---
title: 'Overseer-in-the-loop'
summary: "Practically implementing Auto Mode for agent loops, on an open-source stack, with defense-in-depth and a clean red-team pass."
status: 'active'
tech: ['NeMo Agent Toolkit', 'NeMo Guardrails', 'OpenShell', 'Supabase']
highlights:
  - 'Red-teamed: 0 of 14 escape attempts succeeded'
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
failure domain. It survived a red-team pass clean - zero of fourteen escape attempts succeeded.

I'm building it in the open, one layer at a time - start with
[The Permission Problem](/writing/the-permission-problem/).
