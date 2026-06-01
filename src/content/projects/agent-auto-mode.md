---
title: 'Overseer-in-the-loop'
summary: 'Practically implementing Auto Mode for agent loops, on an open-source stack, with defense-in-depth and a code-first red-team battery.'
status: 'active'
repoUrl: 'https://github.com/getglad/overseer-in-the-loop'
tech: ['NeMo Agent Toolkit', 'NeMo Guardrails', 'OpenShell', 'Supabase']
highlights:
  - 'Code-first red-team battery scoring the action gate'
  - 'Independent enforcement across four layers'
order: 2
featured: true
---

Claude Code's _auto mode_ puts a classifier between the agent and its tools. Overseer-in-the-loop
is an attempt to build that pattern - and the layers underneath it - entirely on an open-source
stack: NVIDIA's NeMo Agent Toolkit as the runtime, NeMo Guardrails as the action classifier, and
OpenShell for sandbox policy.

The design is defense-in-depth: the agent's own judgment, a classifier that reasons over
conversation context, tool-level guards, and a kernel-enforced sandbox each own an independent
failure domain. A code-first red-team battery drives a corpus of adversarial probes straight at the
action classifier and scores where it holds - and where it doesn't.

I'm building it in the open, one layer at a time - start with
[The Permission Problem](/writing/the-permission-problem/).
