---
title: "The Permission Problem"
description: "Why every agent system eventually needs an auto-mode classifier — and what it takes to build Claude Code-style permission handling on a fully open-source stack."
pubDate: 2026-05-02
slug: "the-permission-problem"
categories: ["agentic-ai","security","permissions"]
series: "Agent Auto Mode"
seriesOrder: 1
draft: false
---
_Companion repo: the post-01 tag is the project scaffold — code starts in Post 2._

I should say from the top that this is one of those meta "why" comes before the "how" intros, so there won't be any code in the next few paragraphs. I'll make up for it, though, with a runnable system to show off some level of capability in the next several to come. For now, however, I'll try to earn the right to make you read the others.

In late March 2026, Anthropic [published a post](https://www.anthropic.com/engineering/claude-code-auto-mode) titled "How we built Claude Code auto mode: a safer way to skip permissions." If you've spent any time with agentic coding tools, the framing probably landed immediately. Before auto mode, Claude Code gave you three ways to run: approve every single tool call by hand, pass --dangerously-skip-permissions and let the model do whatever it wanted, or hand-roll a regex-based allow-list.

Auto mode aimed to fix this mixed bag by putting a classifier between the agent and the tool, evaluating each proposed action against a set of decision criteria and either letting it through or stopping it. It's a neat design, and once you've named it, you can't un-see it.

It's also, with small variations, probably the design that every agent system eventually needs. So it got me thinking — how do I get Claude Code-style auto mode entirely on an open-source stack?

### A few thoughts on the autonomy spectrum

Agent permissions can feel like a mode picker — ask, auto, bypass — but those aren't modes, they're implicit trust levels. They live on a single axis: how much can this thing do before I want to know about it? If you've ever touched the identity security space, this starts to sound familiar but with the wrong framing of "pick the mode that matches your comfort." Just like with any reasonable permission model, the right framing is _escalation_: establish a protocol for when an agent should escalate to a human operator and when it shouldn't.

Antonio Gulli, who writes extensively on agentic design patterns, has named this need for escalation directly. He additionally named a constraint that makes it unavoidable: human-in-the-loop (HITL) does not scale. If your agent does anything interesting at all, you will eventually need automation for the routine work and humans for the consequential decisions.

The question then becomes how you draw the line. The classifier does not solve or replace the HITL requirement, but it _does_ push that line out further by giving the agent something additional to watch over it.

### How Claude Code auto mode works

Anthropic's auto mode is the high-profile production example of this pattern, so it's worth digging into how it works.

It effectively functions as a transcript classifier using a medium-tier model (in their case Claude Sonnet 4.6) and evaluates each action before it executes, asking three questions:

1.  Is the action dangerous?
2.  Did the user authorize _this specific_ action?
3.  Does the user's authorization cover the blast radius?

The classifier runs in two stages:

1.  a fast single-token filter (yes/no) that handles the easy cases
2.  chain-of-thought reasoning only when the fast filter flags something

The output is binary — allow or not — and when the classifier blocks, the denial comes back to Claude Code as a tool result along with an instruction to find a safer path rather than route around the boundary. As described at least, there's a circuit breaker too: three blocks in a row, or twenty blocks in a session, and auto mode pauses and falls back to prompting for each action (bad bot!).

### Why one layer is not enough

From my perspective, when building out an agentic system there are two main failure modes that feed into four construction layers of concern:

1.  _The agent can be manipulated._ Prompt injection through tool output is the canonical version of this failure. A web fetch could return adversarial content, the content tells the agent to ignore prior instructions and exfiltrate ~/.aws/credentials to some HTTP endpoint. But there are many flavors. Anticipating and codifying N permutations to protect against that pattern is ultimately unreasonable. A classifier can judge "reasonableness" based on the user's side of the conversation history.
2.  _The classifier can be wrong._ Anthropic's own data shows a 17% false-negative rate on their curated set of real over-eager actions — and that's a frontier model (Sonnet 4.6) judging a _deliberately stripped_ transcript: just the user's messages and the agent's tool calls, with the agent's own reasoning removed so it can't talk the classifier into a bad call. A smaller, faster classifier (which you'll want, because you live in the real world) might be wrong more often. If the only thing standing between an agent and your filesystem is the classifier's judgment, the classifier's error rate is your effective risk exposure.

Neither failure mode is fully answered by any single check, so the response is independent enforcement at four layers, each owning its own failure domain:

1.  _Agent decision_ — does the agent want to do this at all?
2.  _Content classification_ — is the proposed action safe given history?
3.  _Tool-level guards_ — does this call match a banned pattern?
4.  _Infrastructure sandbox_ — can the action even reach what it's trying to touch?

So keep in mind that while an "overseer"-style classifier is an interesting first defense, it's also an unacceptable last one.

### Considering agent-escalated sandboxes

If auto mode's classifier is dynamically scoping "safe" behavior for the loop, there is still an infrastructure-level configuration to govern the allowed tools, the allowed directories, the allowed network access, etc., for the whole session. The agent operates inside that standing grant.

These grants start to rhyme with software-defined infrastructure management problems — too broad (on the theory that "it might need it") versus too narrow (the agent hits a wall mid-task and bails). To carry the auto mode principle forward to this level, I also got curious about the idea that a planner agent could ask for what a job might need out of a sandboxed environment, that I could let a separate validator agent approve it, and that I'd still use standard tool-call enforcement to govern a maximum level either agent could implement.

To me, this begins to sound exactly like a Privileged Identity Management (PIM) problem statement. If you've never used PIM: it's the pattern where a permission exists in _eligible_ form until you activate it for a specific reason and a bounded duration, after which it expires. PIM has three tiers:

1.  Maximum boundary — the role definition itself, the ceiling above which no one can be granted.
2.  Requested — what the requester is asking for, with justification. Always less than or equal to maximum.
3.  Approved for task — what an approver has agreed _this requester_ can have _at this time for this purpose_.

### The stack

To implement all of these concepts, I wanted to chain together three open-source projects to do the heavy lifting.

1.  [**NeMo Agent Toolkit**](https://github.com/NVIDIA/NeMo-Agent-Toolkit) (NAT) will be the agent runtime. It gives me a ReAct agent loop, HITL primitives, a middleware system to slot the classifier between the agent and tool execution, an A2A protocol, and OpenTelemetry support for instrumentation. One note — NAT's primary onboarding path is YAML (every tutorial uses it) — but we're software engineers here and are building embeddable systems, so… we won't do that.
2.  [**NeMo Guardrails**](https://github.com/NVIDIA-NeMo/Guardrails) can function as our classifier. The thing to understand about Guardrails is that it's a _programmable middleware framework_, not a canned content-safety product. The content-safety rails ship as one example configuration; the framework lets you write any classification logic you want. We'll use it for tool-call classification: per action, with history context, with a pluggable evaluation model. The IORails engine runs multiple rails in parallel — which is also fun.
3.  [**OpenShell**](https://github.com/NVIDIA/OpenShell) is the sandbox. Released at GTC 2026 and still alpha, but easy to drop in. It gives us a four-domain declarative policy (filesystem, network, process, inference). Static policy sections (filesystem, process) lock at sandbox creation; dynamic sections (network, inference) hot-reload via openshell policy set. This is the PIM ceiling on everything the inner agent does.

Where all of this is heading is one sentence, and it's worth planting now: the goal is to let an LLM act on the real world _at arms length_ — through tools scoped by software today and workload authentication later — with its reasoning and actions still visible, every decision still auditable, and you out of the loop for the routine pivots. Posts 2 through 4 earn the first half of that sentence. The red-team post stress-tests whether it actually holds; the policy and sandbox posts that follow earn the second. Everything else is detail.

_\[Figures: architecture diagram (post-01-architecture-diagram) and the per-action flow (post-01-per-action-flow).\]_
