---
title: "The Agent Loop"
description: "So with all those words about autonomy spectrums out of the way, let's build an agent loop."
pubDate: 2026-05-09
slug: "the-agent-loop"
categories: ["agentic-ai","nemo-agent-toolkit","python"]
series: "Agent Auto Mode"
seriesOrder: 2
draft: false
---
_Companion code: the post-02 tag._

So with all those words about autonomy spectrums out of the way, let's build an agent loop.

For the purposes of this series, I'll be making a ReAct agent built on the NeMo Agent Toolkit. In this post, we'll build a basic loop with HITL approval on every tool call — no classifier yet, one basic tool, and some basic hello-world exercises.

We're also going to be skipping the YAML configs, etc., so that we can actually have an embeddable implementation and not lean on NAT to also host our exposure points.

### Embedding NAT by skipping the YAML

Under the hood, NAT parses its YAML into a Config model, passes that to WorkflowBuilder, and calls build() — letting us skip the CLI entirely.

```python
from nat.builder.workflow_builder import WorkflowBuilder
from nat.data_models.component_ref import FunctionRef, LLMRef
from nat.llm.openai_llm import OpenAIModelConfig
from nat.plugins.langchain.agent.react_agent.register import ReActAgentWorkflowConfig

MAIN_LLM = LLMRef("main_llm")
SOME_TOOL = FunctionRef("some_tool")

async with WorkflowBuilder() as builder:
    await builder.add_llm(MAIN_LLM, OpenAIModelConfig(
        model_name=settings.model_name,
        base_url=settings.base_url,
        api_key=settings.api_key,
    ))
    await builder.add_function(SOME_TOOL, SomeToolForTheAgentConfig())
    await builder.set_workflow(ReActAgentWorkflowConfig(
        tool_names=[SOME_TOOL],
        llm_name=MAIN_LLM,
        use_native_tool_calling=True,
    ))
    workflow = await builder.build()
```

### The HITL wiring

To do some sanity checking, for the purposes of this post, every tool call should pause and wait for human approval — we'll call it ask-mode-for-everything, the absolute floor of the autonomy spectrum.

To implement this, however, we hit a bit of a wrinkle: the ReAct agent's tool\_node calls \_call\_tool() directly. There's no interception point. The fix was a wrapper tool:

```python
class HITLCurrentTimeConfig(FunctionBaseConfig, name="hitl_current_datetime"):
    """Current datetime tool that requires HITL approval before executing."""

@register_function(config_type=HITLCurrentTimeConfig)
async def hitl_current_datetime(_config, _builder):
    async def _get_current_time(query: str) -> str:
        approved = await prompt_binary_approval(
            tool_approval_prompt(
                "current_datetime",
                "get current date and time",
            )
        )
        if not approved:
            return REJECTION_MESSAGE
        return f"The current time is {datetime.now(tz=UTC).isoformat()}"

    yield FunctionInfo.from_fn(
        _get_current_time,
        description="Returns the current date/time.",
    )
```

The lesson is bigger than NAT. **Unit tests verify pieces; they don't verify wiring.** In agent frameworks, components get connected by the runtime — not by code you can grep for. So you need three layers of tests, not one:

| Layer | What it tests | What it catches |
| --- | --- | --- |
| Unit | Each function works in isolation | Broken function logic |
| Integration | The framework actually calls them | Wiring bugs — pieces exist but nothing connects them |
| Trajectory | Calls happen in the right order | Approval fires after execution, or tool runs twice |

For the trajectory layer, I patched both prompt\_binary\_approval and the datetime call to append to a shared list, then asserted on the sequence: \["approve", "datetime\_now"\] for an approval, \["approve"\] alone for a rejection (datetime never fires). Same principle as trace-based testing, smaller scope. If you've ever shipped LangGraph or CrewAI or AutoGen and felt the bug-class where "everything works in tests but the agent ignores my guardrail," this is what it was.

As an aside on observability plumbing: NAT's stock react\_agent builds the agent graph _without_ a callback handler, so the LLM tier emits no LLM\_START/LLM\_END events — only the tool calls reach the stream. Rather than monkeypatch the agent internals, I fork NAT's own ReAct register into src/loop/react\_steps.py and attach NAT's LangchainProfilerHandler per run (the same pattern sequential\_executor uses), so model latency and token-by-token streaming flow through the canonical event stream. (An earlier cut of this series carried a BaseAgent.\_stream\_llm monkeypatch plus [PR #1851](https://github.com/NVIDIA/NeMo-Agent-Toolkit/pull/1851) just to get native tool calling working at all; NAT 1.7 shipped that fix, so the patch is gone — a small lesson in pinning your framework version and re-checking your workarounds on every bump.)

### Owning the gateway

NAT ships nat serve — a command that consumes a YAML config and launches a FastAPI server that exposes the workflow over HTTP and WebSocket.

This series won't use it, to demonstrate how this kind of implementation can be embeddable and to let us actually implement the classifier that sits between the agent and the tool, and create Pydantic policy layers that gate sandbox creation. A planner/validator handshake needs A2A on the back side. Each of these capabilities extends a path that runs through _our_ code. If nat serve is the server, those extensions become compounded indirection with "proxy NAT through our gateway, then proxy back to NAT" gymnastics.

The structural call is simpler: we use NAT as a library. We own the FastAPI surface, the routing, the auth, and the integration points. NAT is one component in that, not the whole thing.

```python
@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None]:
    settings = AgentSettings()
    async with WorkflowBuilder() as builder:
        config = await configure_builder(builder, settings)
        application.state.session_manager = await SessionManager.create(
            config=config, shared_builder=builder,
        )
        yield
        await application.state.session_manager.shutdown()

app = FastAPI(lifespan=lifespan)
app.include_router(server_router)
```

The service layer underneath is transport-agnostic. run\_agent takes a SendFn callback, not a WebSocket object, and the router passes websocket.send\_json. We can reuse this pattern for every future independent agentic service we add, and each agent doesn't need to know what transport it's running over.

It's also worth mentioning that for OTel tracing NAT has its own span pipeline (IntermediateStep → Span → OtelSpan → OTLP) that you'll need to wire explicitly:

```python
await builder.add_telemetry_exporter(
    "otel",
    OtelCollectorTelemetryExporter(
        project="agent-auto-mode",
        endpoint=settings.otel_endpoint,
    ),
)
```

Those spans aren't just for debugging — they're the start of the audit trail the rest of the series leans on, where every agent decision stays inspectable after the fact.

### Where this leaves us

What's running:

-   A ReAct agent built entirely from Python. WorkflowBuilder, no YAML, no nat run.
-   HITL approval on every tool call, wired inside the tool body. Three-layer tests (unit / integration / trajectory).
-   Native tool calling on GLM-5.1 with thinking-mode.
-   A FastAPI gateway we own, with a transport-agnostic service layer, ready for additional features.
-   OTel spans on the wire.

What's lame:

-   The agent has one tool. "What time is it?" is the demo. Every interesting task needs file edit, shell, grep, glob — a real surface.
-   Every action prompts for approval. A single "find all TODOs" task generates dozens of tool calls. Click click click click. This is ask mode at its worst and the motivation for what's next.

So let's get to some tool-surface work.
