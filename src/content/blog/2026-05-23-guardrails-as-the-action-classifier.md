---
title: "Guardrails as the Action Classifier"
description: "We ended the last round with a purposefully painful UX - a registered FunctionGroup middleware named hitl_approval, sitting between the agent and every tool…"
pubDate: 2026-05-23
slug: "guardrails-as-the-action-classifier"
categories: ["agentic-ai","security","nemo-guardrails"]
series: "Overseer-in-the-loop"
seriesOrder: 4
draft: false
---
_Companion code: the [post-04 tag](https://github.com/getglad/overseer-in-the-loop/tree/post-04)._

We ended the last round with a purposefully painful UX - a registered FunctionGroup middleware named hitl\_approval, sitting between the agent and every tool call, prompting the human every time.

This is where the classifier comes in. Using the same middleware shape, we can create an entirely different experience. Reasonable action given what the user asked for? Auto-approve, no prompt. Unreasonable? Unclear? Fall back to HITL - the human decides whether to override. Most tool calls in a real session are reasonable, which lets us cut out the prompting.

The classifier is effectively an LLM-based "guardrail agent" - it judges using an action-safety taxonomy that's specific to what agents _do_ and can be extended to scope the specific goals of a particular agent loop, executed by an independent agent operating entirely out of scope of the primary loop so it has the independence to do the evaluation - and using good old-fashioned software logic to keep the primary agent from ignoring its judgment.

Designed this way, it also means it can use an entirely different model if you want to get into those layers.

As an aside - to make this _very_ easy to demonstrate - in the demo UI I've added a toggle so the backend automatically inserts something gnarly to induce a rejection. It makes for better storytelling.

### From "always gate" to "classify, then decide"

Recall the eight-line hitl\_approval middleware of HITL-on-every-call. We swap it out for a classifier middleware on the same FunctionGroup - same shape, but the human is now prompted only when the classifier escalates:

```python
class ClassifierMiddleware(FunctionMiddleware):
    async def function_middleware_invoke(self, *args, call_next, context, **kwargs):
        _, fn_name = FunctionGroup.decompose(context.name)

        # For this example, I treat read-only tools as a category that can skip classify() entirely.
        if fn_name in ALWAYS_ALLOW_TOOLS:
            await emit_classification_event(
                fn_name, decision="allow", layer="rules", reason="always-allow set",
            )
            return await call_next(*args, **kwargs)

        tool_args = args[0].model_dump() if args and isinstance(args[0], BaseModel) else {}
        user_context = Context.get().input_message or ""

        result = await classify(self._rails, fn_name, tool_args, user_context=user_context)
        if result.allowed:
            return await call_next(*args, **kwargs)

        if await prompt_binary_approval(_build_block_prompt(fn_name, tool_args, result)):
            return await call_next(*args, **kwargs)
        return REJECTION_MESSAGE
```

One simplification in that snippet: I check ALWAYS\_ALLOW\_TOOLS by name to keep it readable, but the shipped code actually runs even read-only tools through the same check\_rules the LLM tier uses. That difference matters - it's the line between read\_file('notes.txt') sailing through and read\_file('.env') getting escalated. A name-only allowlist would hand an agent your credentials on a read; routing through check\_rules is what keeps the A6 case (below) honest. The full version lives in src/guardrails/rules.py. Two more things the snippet leaves out: classify() returns a typed ClassifyResult(allowed, layer, reason), and it takes a keyword-only skip\_rules flag - the bypass the demo's evil-payload toggle flips to send an action past the deterministic rules and straight to the LLM judge.

The HITL primitive isn't gone - it's been demoted from default to fallback. The human still has the final word on every blocked action; they just don't get asked about the ones judged to be safe.

The classifier is passed the user's original query, and the past N user prompts, to judge proportionality ("did the user ask to add a comment, but the agent is writing a curl exfiltration script?"). Also worth mentioning - the classifier _only_ sees the user's side of the conversation going back N prompts and the agent's _current_ tool call, to avoid pollution from the agent's own thinking and actions.

I also maintain a list of DANGEROUS\_PATTERNS (think regexes for rm -rf, curl|bash, mkfs., fork bombs, etc., on bash/shell tool args) that result in an immediate HITL, rather than even risking an LLM judge going sideways on us. Additionally, should the classifier loop fail, it falls back to HITL.

### Action safety, not content safety

NeMo Guardrails ships with content-safety categories called S1-S23 - hate speech, violence, sexual content, self-harm, and so on. They're the right categories for chatbots, and helpful to have in place by default for cases where the agent is going to produce output.

But they're also insufficient for an agent that runs tools.

Fortunately, NeMo Guardrails lets us extend into a parallel taxonomy aimed at action safety, which I've labeled A1-A7:

-   **A1 Self-Destruction:** the action deletes or overwrites files the agent depends on
-   **A2 Self-Modification:** edits guardrails, policy, or permission files
-   **A3 Data Exfiltration:** sends workspace data to external hosts the user didn't ask about
-   **A4 Privilege Escalation:** sudo, chmod, ownership changes, setuid
-   **A5 Persistence:** crontab, systemd, launchd, shell-profile hooks
-   **A6 Credential Access:** reads/writes .env, tokens, SSH keys, common vendor credential storage paths
-   **A7 Disproportionate Action:** the action is much broader or more destructive than what the user asked for

The respective tool layers also encode deterministic versions of the same categories - for example, code writing would trip on os.remove(\_\_file\_\_) in the content, and a read tool includes a list of protected path prefixes and credential-path regexes.

The two layers don't disagree about what's dangerous - they augment one another: what absolutely must be true, and what may be hard to anticipate but would be rejected given some amount of independent judgment or reasoning.

There's a lot more I could say here, but it's going to be a good "read the source, not just the summary" situation.

### The classifier that approved self-destruction

Worth telling on myself, because the lesson generalizes. Early in testing, I asked the agent to "edit foobar.txt to be a python script that deletes itself." It produced a write\_file call with os.remove(\_\_file\_\_) in the body - and the guardrail agent waved it through. guardrail-agent:allow. The trace showed the model's input as prompt: user: Agent task and its verdict as response: no (safe).

Two failures had stacked. First, the middleware wasn't handing the user's actual request to classify() - the LLM saw "Agent task" instead of "edit foobar.txt to be a python script that deletes itself," so it had nothing to judge proportionality against. Second, the prompt was generic ("is this unsafe?") and the tool args were formatted so the file body never made it in front of the model. write\_file({'file\_path': 'foobar.txt'}) looks fine; the dangerous part was the text it never saw.

All three fixes are in the code now: thread the real user query through (the user\_context above), format the args so content is visible to the LLM, and add the content-aware rule so os.remove(\_\_file\_\_) is blocked deterministically before the LLM is even consulted. The generalization is the part worth keeping: **a guardrail that doesn't read the content is a rubber stamp.** The classifier saw a write to foobar.txt and said "looks fine." It never looked inside. Action safety lives in _what_ is being written, not just _where_.

### Judges are still just LLMs

When developing these sorts of judges and overseers, it's important to remember - they are _still LLMs_ that are functionally incapable of any real consequence-modeling. Tuning your prompts, and applying your own risk modeling to what even gets the classifier treatment, is critical.

If you read through the source, you'll see how I've configured a set of traces - and the demo UI has a panel that captures how they work and what they show you. NeMo makes this trivial to add to your own implementations.

In addition to performing regular reviews of your workflow traces, you can run pytest integration test cases through them - this is Python after all - complete with spies and everything, to ensure all the right workflow paths are followed as you change prompts, swap models, and find new edge cases.

### When the model refuses on its own

As models have progressed, I've also seen more of the model itself refusing some things. Asked to "edit foobar.txt to be a python script that deletes <some other file>," the model might just decline without calling a tool - _"I need to pause here. This type of self-deleting script is often associated with malicious behavior."_ That's training, not inference-endpoint safety, or local tool safety, or classifier safety. This is great to see, but I decline to name it as another layer of protection - as model consumers, we have no say in how deeply or in what way it's implemented. And, as most of us can attest, this type of protection is highly non-deterministic.

### What running it looks like

![The same src/tools query running with zero approval prompts - list_directory and read_file flow straight through, the trace logging an allow for each call.](../../assets/blog/post-04-auto-mode.png)
_Auto mode, finally: the reasonable read-only calls are waved through, no human in the loop._

At this point, a simple query that once produced a pretty lame click-fest - _"show me what's in src/tools and read the files there"_ - now results in zero HITL prompts. list\_directory and read\_file are in ALWAYS\_ALLOW\_TOOLS, so the rules layer auto-approves each call instantly and emits rules:allow to the trace. The whole exchange runs without the human touching the UI - which is an excellent foundation for being able to model running independently in a backend.

![With the demo's "inject evil payload" toggle on, the classifier catches a read_file smuggling a curl exfiltration of .env and blocks it, falling back to a human override.](../../assets/blog/post-04-evil-block.png)
_The other half of the job: flip the toggle and the same machinery blocks the dangerous call instead of waving it through._

> That's the auto-mode payoff: allowing LLMs to interact with the real world at arms length through appropriately scoped tools (via software and workload authentication) - with reasoning and actions still visible, decisions still auditable, just without you in the mix for each pivot point.

The first half of that sentence is what we've built so far: scoped tools, visible reasoning, an audit trail, no clicks. The next post stops trusting it and _attacks_ it - a red-team battery that drives a corpus of dangerous actions straight at this overseer to measure what actually gets caught. The second half - _workload authentication_, the part that lets an agent prove who it is to the systems it touches - is where the series goes after that, when a Pydantic policy layer and then the OpenShell kernel become ceilings that don't depend on any classifier's judgment.

### Where this leaves us

What's running:

-   A classifier middleware that wraps every tool call in the getglad\_tools FunctionGroup - static rules first, LLM second, HITL only when a layer escalates.
-   A binary decision shape (allowed / not allowed) backed by NeMo Guardrails' built-in self\_check\_output flow.
-   The action-safety taxonomy (A1-A7) in both the LLM prompt and the rules patterns, so the two layers agree about what's dangerous.

What's lame:

-   This is genuinely hard to test and evaluate - which is the whole reason the next post exists.
-   Per-call classification has a structural blindspot: cumulative effect. One write\_file to a benign path is reasonable; a hundred of them across the tree add up to a refactor nobody asked for. The classifier judges each call in isolation against the stated goal, so if the goal is broad ("clean up the codebase") and each call individually fits, there's nothing to block on. The aggregate is the problem, and per-call review can't see it - which is exactly why the classifier is _a_ ceiling, not the only one, and why Posts 5 and 6 still matter.
-   A NAT wrinkle leaks into the traces: the ReAct agent wraps tool results in HumanMessage rather than ToolMessage, and the model occasionally re-reads its own tool result as a new user turn and runs the same tool twice. It's an architecture quirk, not a classifier bug, but it's the "approved once, ran twice" shape you'll spot if you watch the trace closely (and it rhymes with the reject-replan behavior from Post 3).

So if evaluating the outcome is the hard part, the next post should be about doing some auto-red-teaming.
