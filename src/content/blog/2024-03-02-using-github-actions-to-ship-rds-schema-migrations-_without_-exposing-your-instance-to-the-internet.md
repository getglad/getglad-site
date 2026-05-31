---
title: "Using Github Actions to ship RDS schema migrations without exposing your instance to the internet"
description: "GitHub Actions has become many teams’ go-to code-building and container-shipping solution. With its support for chained workflows, your commits to the main…"
pubDate: 2024-03-02
slug: "using-github-actions-to-ship-rds-schema-migrations-_without_-exposing-your-instance-to-the-internet"
categories: ["database-management","github-actions","networking"]
legacy: true
---
GitHub Actions has become many teams’ go-to code-building and container-shipping solution. With its support for chained workflows, your commits to the `main` can run your tests, trigger container builds and pushes, followed by an HCP Terraform run to update your infrastructure to run with that latest build, and finally run a set of acceptance tests to ensure everything is still running healthy.

However, teams can get tripped up when considering how to roll out database migrations when their architecture involves a networked data store. A classic example is a Postgres instance running on RDS. Any mature production deployment would keep that instance inside a private subnet without internet ingress. This presents a question of how a team could get schema updates rolled out in an observable and managed way while keeping to a single release pipeline tool when that tool is not networked to the instance.

There is a streamlined strategy I’ve adapted over time with an eye to:

1.  Keep Github Actions as the deployment orchestrator
2.  Keep the RDS instance off the internet
3.  Minimize new infrastructure as much as possible
4.  Manage schema migrations with effective rollback strategies

## Using dbmate to manage schema migrations

A key component of this strategy is reliably deploying schema migrations from an arms-length. To do this, my go-to tool has become [dbmate](https://github.com/amacneil/dbmate). It’s a flexible CLI tool that lets you express your schema upgrades and downgrades in pure SQL and reliably falls back when a failure occurs. There isn’t any real secret sauce here - it makes it easy to source control your schema changes while using them in tests and standing-up developer environments. However, the consistency in experience makes it ideal for this strategy: it has a short learning curve and is straightforward for automation to parse success or failure states. Additionally, `dbmate` is designed to be used as a `golang` library, which allows for even more control flow options.

## Run schema migrations using ECS

With a reliable migration deployer selected, the next question becomes how to run the migrations themselves. Given the goal of not putting the instance on the internet, `dbmate` can’t be executed using a standard GitHub action. There still needs to be a path to connect `dbmate` to the instance inside the VPC, which raises two important design decisions:

1.  How to run `dbmate`?
2.  How to source the migration files for `dbmate`?

In the past, I have opted to run `dbmate` as part of a small `go` binary on a container via ECS, with the migration files preloaded onto the container. However, using `dbmate` as a CLI via the container can work for an initial implementation.

### Build container image with schema updates

The `aws-actions/amazon-ecr-login` and `docker/build-push-action` Actions make building and shipping the container to an ECS repo trivial. Using `dbmate` via the CLI or the [go library](https://github.com/amacneil/dbmate?tab=readme-ov-file#embedding-migrations) is a design decision. However, shipping the container with the migration files is a core strategy component.

The rationale is simple - schema migrations can significantly impact the integrity and access of the data. While automation simplifies and de-risks deployments in many ways, it also means most, if not all, integrity is being transferred to the system and the signals that drive it. If the migration files are stored on S3, what safeguards are in place to ensure the bucket’s contents are correct and as expected? `git` can solve the “assurance of content” question, but the container runtime then needs network and identity access to the Github repository, which may not be reasonable or even possible. Either strategy also adds more machinery and access requirements to the deployment process, which generates more overhead and things to break.

By shipping the migrations on the container, the contents of a `git` commit can be associated with a container `sha`, and the deployment can be mapped to an ECS task ID using that container `sha` (and its related CloudTrail event and CloudWatch logs).

## Use ECS run-task from a GitHub Action

The container, built and shipped to ECR, can now run as an ECS `run-task` operation with all the related networking and database connection requirements. There are no official Actions from AWS to perform this operation. Generally, it would be difficult to recommend unofficial Actions - however, forking one into your supply chain could be a viable option.

That being said, the AWS CLI provides sufficient capabilities, requiring three main executions:

1.  Execute `run-task` with the network requirements, extract the task ARN from the result
    1.  The network requirements cannot be embedded into the ECS task definition, so they must be included with the `run-task` step.
    2.  Database configurations are a second consideration. `dbmate` uses standard drivers under the hood, which means it can read the database configurations from the environment. These can be reasonably configured to the ECS task definition. However, for sensitive values like the password, [ECS supports using Secrets Manager](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html) to avoid co-locating them in plain text with the task definition.
2.  Run `wait tasks-stopped` using the task ARN to observe the container’s exit
3.  Once completed, use `describe-tasks` for the task ARN and extract the exit code
    1.  The JMESPath here is `.tasks[0].containers[0].exitCode`

## Bonus point - use RDS IAM auth via a go binary

One final suggestion that further enhances the value of the `golang` capability is using [AWS IAM Auth](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html) instead of static credentials. As of this writing, I am unaware of a reliable method of vending the temporary database password using this IAM pattern and hoisting it in a way that the `dbmate` CLI could leverage. It is, however, a small addition to a `golang` module for it to run as a pre-flight step. Considering the sensitivity of this type of worker, leveraging temporary credentials whenever possible is a net improvement.
