---
title: "Rationalizing Cloud Custodian Orchestration"
description: "Cloud Custodian is a powerful cloud service provider management tool that has occupied a considerable percentage of my professional headspace."
pubDate: 2024-06-01
slug: "rationalizing-cloud-custodian-orchestration"
categories: ["c7n","python"]
legacy: true
---
Cloud Custodian is a powerful cloud service provider management tool that has occupied a considerable percentage of my professional headspace.

The internet doesn’t need yet another `custodian` explainer, but, for me, one element where `c7n` has always fallen short is its lack of orchestration management.

You could use its AWS Lambda Function packager, but that comes with a set of limitations:

1.  Limited to AWS resources
2.  Scoped to a single account/region pair
3.  Bounded to a single `yml` file

Another alternative is to put together a custom container that executes the `custodian` CLI. It could be more elegant, but it does offer some additional flexibility. Still, you are bound to the project’s design philosophy, which can leave you with an essentially unbounded and unmanaged set of workloads with no native circuit breakers or sense of state.

Recently, I was presented with a challenge: How can you use `custodian`‘s `yml` ergonomics while gaining a framework of a modern orchestration system? It was an interesting question; the good news is that it was pretty easy!

## Design goals

The main design goals of a `c7n` orchestrator include:

1.  Job queuing, scheduling, and visibility of policy execution workloads
2.  Dynamic storage and extraction of policies related to those workloads
3.  Fan-out capability for larger units of work (e.g., multi-region or organization/tenant runs)
4.  Circuit-breaker techniques to manage workloads (e.g., approvals, rate limit backoffs, etc.)

## Quick Code Survey

Setting most of these goals as feature requirements on `c7n` would be unfair to the project. It isn’t meant to be a workload orchestrator - it only offers a feature-limited Lambda bundler for convenience.

However, to get most of what is needed, the native `c7n` runtime lifecycle must be circumvented, and some custom logic needs to be inserted at its key milestones in the original project’s workflow. A naive approach can be implemented using just a few of the project’s components. Below is a simple example, where `policy` is a set of `c7n` yml converted into JSON/Python `dict`s.

```
from c7n.handler import init_config
from c7n.policy import PolicyCollection, PullMode
from c7n.resources import load_resources
from c7n.structure import StructureParser

def policy_load(policy: dict[str, Any]) -> PolicyCollection:
    policy_data = {"policies": [policy]}
    policy_config = init_config(policy_data)
    load_resources(StructureParser().get_resource_types(policy_data))
    policies = PolicyCollection.from_data(policy_data, policy_config)
    return policies

def run_policies(policy: dict[str, Any]):
    policies: PolicyCollection = policy_load(policy)

    for c7n_policy in policies:
        c7n_policy.validate()
        mode = PullMode(c7n_policy)
        mode.run()
```

By bypassing the `custodian` launch phase, a project gains the flexibility to construct the `policy` object in various ways. This approach allows for additional design choices, such as implementing custom safeguards, before executing `mode.run()`. In essence, it opens up the possibility of creating job definitions tailored specifically for _workloads that will run policies_ rather than treating _policies as top-level definitions_.

For instance, a scheduled workload could be designed to iterate through an AWS Organization or a group of Organizations, generate a set of policies with dynamically inserted role or account IDs, and then schedule those policies to be executed by a second worker. Furthermore, it could specify which regions to target for running the account-specific policy. Some or all of these workers could be informed by metadata stores, such as indicating that Account 1 is cleared to use three regions and Account 2 has five regions.

This approach offers opportunities to introduce a policy template convention and explore the possibilities and variations that may arise from it, requiring some - but not much - creative thinking.

## Workload Orchestration

This implementation strategy largely benefits from treating `c7n` as a library in a more extensive platform-agnostic architecture instead of a primary operator. `c7n` policy execution could become simply one job in a library of cloud management workloads managed by a team.

For example, a naive pub-sub workflow using Lambda and SQS could look like:

1.  Job 1
    1.  Triggered by EventBridge on a schedule
    2.  Enumerates all accounts from a set of AWS Organizations defined in a DynamoDB table
    3.  Generates permutations of a set of policies stored in S3 based on that list of accounts
    4.  Each permutation is built into a job manifest and stored in DynamoDB with a TTL (to avoid overlapping jobs, hopefully!)
    5.  Job Manifest ID is inserted into SQS
2.  Job 2
    1.  Trigger from SQS
    2.  Job manifest is retrieved
    3.  Policy is generated based on the job manifest
    4.  Policy is executed against the above policy code

In this example, both jobs could leverage a shared typing library to ensure the workload payloads are compatible across the services.

More advanced techniques could use a system such as [Temporal](https://temporal.io/), which fulfills the design goals of more robust workload orchestration controls. Following the code path above makes it possible to have a “`c7n` execution task” with an observable state. It could slot in as part of a larger workflow. This workflow could be a language-agnostic management system that supports rescheduling (for example, if jobs are getting rate-limited) and even _interruption/cancellation_ (crucial when a `c7n` policy is running wild).

For example, a first `c7n` task can find all EC2s that do not match a given expectation, an internal tool can wait for a human review/approval of those EC2s, and then a second remediation job scoped to just those reviewed/approved EC2s can be run. Finding and remediating those EC2s is a classic example of how `c7n` excels and can save cloud operations time/energy. Still, without a multi-step workflow with human context/intervention, it quickly becomes impractical to use in the real world.

Leveraging `c7n` as a tool in a full-featured workflow platform instead brings a layer of control flow that the project otherwise lacks.

## Policy Safety - or why not just execute the CLI from a container?

This new design pattern also comes with an important consideration of `custodian` execution security - what assurances can be made that the intended policies are being executed and that `custodian` will not be hijacked into a form of insider threat? There are a few patterns to consider.

### Forward workload IDs, not workloads

Since `custodian` policies are tiny pieces of JSON, it can be very tempting to insert them into payloads. After all, what’s the harm? If `custodian` is used as read-only, maybe only your control plane traffic throughput is at risk. However, many teams use it to _mutate their cloud environments at scale_. As such, having confidence that a _policy_ is not arbitrarily inserted into a work queue is a significant risk to mitigate.

Using metadata and manifest stores (e.g., Redis, DynamoDB, S3) where the instructions can be given an identifier and stored is a low-effort capability to adopt.

### Let workloads escalate privileges as necessary

Giving `custodian`‘s runtime environment a blanket set of permissions can be tempting. But as each task should perform a scoped set of work, it is a better pattern to have a role associated with a given task. The workload would start with a base set of permissions, read its required role from the job manifest, and then assume that higher privileged role.

### Use client-side encryption of policies

Having established that workflow instructions, including policies, should be kept in outside data stores, it becomes important to consider how those instructions are read. Client-side encrypting the policies can be a great approach. It keeps outside observers from considering trusted policies or roles that might be a good candidate for unintended manipulation. It can also function as a canary that the policy was not inserted along the expected path (i.e., the expected key will fail to decrypt).

### Use resources that can be restricted

Now that data stores and encryption keys will be part of the trust chain, resource-level policies should help avoid unintended modifications of those stores. Consider restricting mutating capabilities to a limited, enumerated set of non-human workers.
