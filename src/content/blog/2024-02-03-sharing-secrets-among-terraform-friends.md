---
title: "Sharing Secrets Among Terraform Friends"
description: "In small team environments, establishing good practices around secret sharing can feel like an “important pattern with little practical application” and thus…"
pubDate: 2024-02-03
slug: "sharing-secrets-among-terraform-friends"
categories: ["terraform","tfc","vault"]
legacy: true
---
In small team environments, establishing good practices around secret sharing can feel like an “important pattern with little practical application” and thus never gets any urgency.

Lines of “ownership” can be blurry, especially when “most” people can access “most” things. Suppose I have a team of eight people, three of whom are configured as administrators. Am I gaining any real security boundaries by investing in sharing tooling and strategies when 40% of the team can snag a credential whenever they want?

I once worked in a start-up environment where all managers, members of a DevOps team, and engineers over a certain level could vend new credentials on a system. If my memory serves correctly, that resulted in over 75% of the engineering organization having the privilege. Least privileged access, it was not. Remember that this also meant the other 25% would still need access to the secrets in their day-to-day work, so even then, a sharing strategy was required.

So, how should we best model and mitigate this scenario? As with all security issues, it’s important to identify the risk categories. In other words, what do we hope to achieve by imposing barriers or requirements?

It’s important to ask ourselves, ‘What could go wrong?’ This question prompts us to consider potential risks in order to take a proactive approach to security.

1.  We have a relatively large number of users that can generate secrets.
2.  We have a corresponding number of opportunities for secret exposure.
3.  We have whatever bad thing could occur if the exposed secret is leveraged.

If our mitigation goal is strictly around generating a secret, we have yet to achieve much with a fine-tuned sharing strategy when the ratio of folks that can vend a token is high. This discussion isn’t to discount the importance of a well-considered separation of concerns strategy, where the folks who can vend the tokens are few and operate in isolation from those who consume the tokens – but the world has plenty of those write-ups. In a world of “doing more with less,” teams may not have a practical avenue for reducing the ratio of users with credential vending access, which is a significant but different security concern.

If our mitigation goal is preventing “bad things” from secret exposure, exploring alternative strategies like time-bound, IP-bound, or network access restrictions is best. These are not bad ideas, but they can depend on the system vending the secret, so they may not even be an option. Those strategies also operate from a post-exposure viewpoint, which is an important angle to consider but doesn’t really apply to (and can sometimes work against) a secrets-sharing strategy.

Sitting in the middle, of course, is managing, hopefully reducing, the opportunities for secret exposure. The risk mitigation value that comes from reducing the handling of the secrets is beneficial enough to warrant the investment of a well-considered strategy. Even when the number of users that can vend is relatively high, a well-considered system should create an ergonomic where they do not need to.

I have found this conversation tough to navigate when we start talking about secrets for infrastructure. It’s a big gnarly subject that, even in 2024, is still biased to thinking about work happening behind access walls and segmented networks. It complicates using tools like Terraform – with all its power, the tooling requires highly privileged access. Terraform does a half-decent job vending temporary credentials with the hyper scalers (i.e., AWS and whatnot). Still, there continues to be a long tail of platforms with Terraform providers that operate on long-lived static creds. It opens a catch-22 of how to enable teams to deploy without support and ensure credentials can be passed around securely.

There isn’t a perfect solution, but let’s quickly design and plan one mechanism for sharing secrets.

### Breakdown

We must first frame our job functions or personas when designing a strategy. When using TFC and HCP Vault Secrets, we likely have three core personas:

1.  The TFC Admin
    1.  This job creates a team (i.e., `TokenTeam`) in the TFC Organization with no explicit permissions (this is a one-time activity)
2.  The Application Team
    1.  This job surgically onboards the “Token Team” persona to the TFC Workspaces it needs access to
    2.  It adds the `TokenTeam` to the workspace that needs the credentials
    3.  It also provisions the team with “custom” permissions
        1\. `Run` access should be read only (lowest possible)
        2\. `Variables` should be read and write
        3\. `State` access should be set to none
    4.  The `TokenTeam` can now use an API token to push workspace variables marked as `sensitive` – effectively becoming a write-only service with access to the token only long enough to deliver it.
3.  The “Token Team”
    1.  Create an HCP project to use with the TFC Workspace
    2.  Creates a [Viewer Service Principal](https://developer.hashicorp.com/hcp/docs/hcp/admin/iam/users#project), gets the credential
    3.  Sets the `HCP_CLIENT_ID` and `HCP_CLIENT_SECRET` on the Application Team’s workspace as environmental variables marked `sensitive`
    4.  Secrets for the TFC workspace to read are then set on Vault
        1.  I’m putting this on the Token Team as the team that creates the SP also has to interact with the SP credentials physically – already putting them in the read-access circle of trust. Why add more processes or surfaces for exposure?

The application team can now deploy through TFC using `data.hcp_vault_secrets_secret` to gain transparent access to the required credentials without handling the tokens or providing another team broad access to its workspace.

### Risks

Today, HCP has a poor permission structure to enable this strategy. [Only an Admin](https://developer.hashicorp.com/hcp/docs/hcp/admin/iam/users#organization) can create the Project-level Viewer Service Principal and pull out its credentials, but an Admin-level token is significantly over-permissioned in this case. It skews and limits the personas that can work on the Vault side of things in less-than-ideal ways.

For HCP Vault Secrets, ideally, an Org-level Service Principal would be able to:

1.  create projects
2.  do a one-time generation of a Service Principal token
3.  insert secrets
4.  but could not
    1.  delete projects
    2.  re-generate Service Principals tokens
    3.  read secrets

But for now, we have what we have.

Finally, it is also worth mentioning that – as of this writing – the values of data blocks will end up in the state file. This approach is an exposure mitigation strategy that reduces the number of touchpoints involved in handling the credential instead of officiating the credential to the deploying teams.
