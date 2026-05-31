---
title: "Using Terraform to Write Terraform for Software-Vended Infrastructure Blocks"
description: "A general thread running through the Terraform value proposition is creating a culture of clearly defined and source-controlled infrastructure artifacts."
pubDate: 2024-05-04
slug: "using-terraform-to-write-terraform-for-software-vended-infrastructure-blocks"
categories: ["golang","terraform"]
legacy: true
---
A general thread running through the Terraform value proposition is creating a culture of clearly defined and source-controlled infrastructure artifacts.

Sit through enough Terraform executive pitches, conference sessions, or lunch and learns, and you will hear some version of the same story: at any point, you can hop into a designated `git` repo and see not just the state of the intended infrastructure and SaaS configuration universe, but also its entire change history going back to the initial AWS credit card swipe. Should it fall out of the target configuration, rerun your plan and slap it back into place.

The success of this strategy in modern deployment strategies is evident in the widespread adoption of Terraform. It has become such a default choice that an entire ecosystem of Terraform hosting companies forked the project to ensure their continued place in the market. It’s important to note, though, that while Terraform is a reliable and effective tool, it still requires manual drafting.

Imagine a process where a cloud management team has provided a set of modules to deploy opinionated, secure-by-default VPCs and IAM roles. At first, the cloud team may have managed the PR process related to getting these in place behind the scenes for other engineering teams. Yet, as the request volume increased, the process, which was an abstract Jira ticket for most folks, was moved to having individual teams open their own PRs to reduce bottlenecks. Now, engineers are trying to use an unfamiliar module to request new deployments. The engineer has to research the module and understand its flags, and the owning team has to review the PR, which, given its unfamiliarity, may have errors that require a “request for change” or three. For small teams, this cycle may pose a manageable challenge that fits within some version of its ordinary course of business.

However, the manual work linked with Terraform can pose a significant time burden when managing large-scale operations. The accumulation of minor frictions in generating and reviewing the code can lead to the realization that the process needs to be automated. At this point, the team is confronted with a decision – should they abandon their well-established Terraform strategy in favor of a new bespoke software project that replicates all the API orchestration they’ve relied on so far (along with all the related DevEx investment to deliver a new internal project to the organization)?

Fortunately, leveraging Terraform providers as `golang` libraries offers a (mostly) direct route to assist teams in maintaining their Terraform strategy – `git` repo and all – while allowing software to handle most of the workload and accelerate their delivery cycles.

## Using hclwrite

The `hcl` project includes a library called `hclwrite`. As the docs describe, this library “deals with the problem of generating HCL configuration and making specific surgical changes to existing HCL configurations”. It’s an important component in kickstarting a Terraform-generating project.

The below demonstrates some basic ergonomics of the library, such as creating a base `hcl` object and adding basic blocks. These will be used in other parts of the demo.

```
package blocks

import (
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
)

func NewHcl() hclwrite.File {
	hclFile := hclwrite.NewEmptyFile()
	return *hclFile
}

func NewBlock(hclBody hclwrite.Body, blockName string, attributeNames []string) hclwrite.Body {
	newBlock := hclBody.AppendNewBlock(blockName, attributeNames)
	newBlockBody := newBlock.Body()
	return *newBlockBody
}

func BuildBlockBody(blockBody hclwrite.Body, t cty.Type, attributeName string, attributeValue interface{}) {
	if t == cty.String {
		blockBody.SetAttributeValue(attributeName, cty.StringVal(attributeValue.(string)))
	} else if t == cty.Bool {
		blockBody.SetAttributeValue(attributeName, cty.BoolVal(attributeValue.(bool)))
	}
}
```

### Writing a Terraform and Provider block

Using the `hclwrite` building blocks above, a standard AWS Terraform module could be initialized using the code below.

```
package blocks

import (
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
)

func MainFile() {
	hclFile := NewHcl()
	rootHcl := hclFile.Body()
	TerraformBlock(*rootHcl)
	ProviderBlock(*rootHcl)
}

func TerraformBlock(rootHcl hclwrite.Body) {
	terraformBlockBody := NewBlock(rootHcl, "terraform", nil)

	requiredProvidersBlockBody := NewBlock(terraformBlockBody, "required_providers", nil)

	requiredProvidersBlockBody.SetAttributeValue(
		"aws",
		cty.ObjectVal(map[string]cty.Value{
			"source":  cty.StringVal("hashicorp/aws"),
			"version": cty.StringVal("~> 3.0"),
		}),
	)
	rootHcl.AppendNewline()
}

func ProviderBlock(rootHcl hclwrite.Body) {
	providerBlockBody = NewBlock(rootHcl, "provider", []string{"aws"})
	providerBlockBody.SetAttributeValue("region", cty.StringVal("us-east-1"))
	rootHcl.AppendNewline()
}
```

Should the `hclFile` object be written to disk, the resulting HCL should read like the familiar output below.

```
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}
```

## Using a Terraform Provider to generate valid Terraform

With the provider initialized, the project needs to create some actual provider resource blocks, which is where the interesting and challenging bit comes in.

The goal of a well-designed automation system should be:

1.  To better allocate engineering time
2.  To reduce errors
3.  To create more predictable outcomes

So, while a naive approach could have an engineer review the provider’s documentation and replicate each resource block as a `struct` in their own code base, that _definitely_ does not sound like a good way to save time. It also provides no hard assurances that the HCL generated will be valid both at ship time and after six months of updates – at least without a heavily invested integration testing suite.

It’s better if the provider itself can be used. For example, the GitHub provider could be used to create a validated `github_repository` block using a generic blob of JSON loaded as a `map`.

```
package blocks

import (
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/hashicorp/terraform-plugin-sdk/terraform"
	"github.com/integrations/terraform-provider-github/v5/github"
)

func GithubRepository(input map[string]interface{}) {
	GithubRepositoryValidateInput(input)

	hclFile := NewHcl()
	rootHcl := hclFile.Body()
	GithubRepositoryValidateInput(input)
	GithubRepositoryBlock(*rootHcl, input)
}

func GithubRepositoryBlock(rootHcl hclwrite.Body, input map[string]interface{}) {
	ghRepoBlockBody := NewBlock(rootHcl, "resource", []string{"github_repository", "foo"})

	GenericHCLMaker(github.Provider(), ghRepoBlockBody, "github_repository", input)
}

func GithubRepositoryValidateInput(input map[string]interface{}) []error {
	config := terraform.NewResourceConfigRaw(input)
	gh := github.Provider()
	_, err := gh.ValidateResource("github_repository", config)
	if err != nil {
		return err
	}
	return nil
}
```

`GithubRepository` and `GithubRepositoryBlock` largely build on the patterns established by the earlier examples in `TerraformBlock` and `ProviderBlock` – they create new empty HCL objects and fill them in. But this time, they do it based on a given input.

`GithubRepositoryValidateInput`, on the other hand, is part of the software’s trust-building strategy. Each Terraform provider should implement a [set of validators](https://developer.hashicorp.com/terraform/plugin/framework/internals/rpcs#validateconfig-rpcs), which gives the implementation a built-in capability to validate the input being sent for processing – batteries included!

Unfortunately, this method only _validates_ the input – it does not convert it into HCL. To do that with the least amount of intervention possible, we’ll need one more method: a `GenericHCLMaker`.

## Making a Generic Provider Resource HCL Block

The final challenge for this workflow is to convert some JSON blobs, which should represent a collection of valid Terraform blocks, into HCL. This requirement makes us look into the Terraform internals again.

To do this successfully, we need a few things:

1.  The provider’s `terraform.ProviderSchema` object
2.  The resource’s schema object (this is simply a `configschema.Block`)
3.  The resource’s defined attributes (`configschema.Attribute`)
4.  The ability to recursively navigate the JSON blob to translate it onto a `hclwrite.Body` object

The `GithubRepositoryBlock` method shared earlier demonstrates how the code below could be leveraged with any valid Terraform provider (fingers crossed!).

```
package blocks

import (
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/hashicorp/terraform-plugin-sdk/terraform"
)

func GenericGetTFSchema(provider terraform.ResourceProvider, resources []string, datasources []string) *terraform.ProviderSchema {
	request := &terraform.ProviderSchemaRequest{
		ResourceTypes: resources,
		DataSources:   datasources,
	}
	schemas, _ := provider.GetSchema(request)
	return schemas
}

func GenericHCLMaker(provider terraform.ResourceProvider, hclBody hclwrite.Body, resource_type string, input map[string]interface{}) {

	provider_schema := GenericGetTFSchema(provider, []string{resource_type}, nil)
	schema_resource_type := provider_schema.ResourceTypes[resource_type]
	var attr_target = schema_resource_type.Attributes

	AttrProcess := func(hclBodyPassed hclwrite.Body, blockInput map[string]interface{}) {
		for k, v := range attr_target {
			if val, ok := blockInput[k]; ok {
				BuildBlockBody(hclBodyPassed, v.Type, k, val)
			}
		}
	}
	AttrProcess(hclBody, input)

	var block_target = schema_resource_type.BlockTypes

	var BlockProcess func(hclwrite.Body, map[string]interface{})
	BlockProcess = func(hclBodyPassed hclwrite.Body, blockInput map[string]interface{}) {
		for k, v := range block_target {
			if val, ok := blockInput[k]; ok {
				hclBody.AppendNewline()
				newBlock := NewBlock(hclBodyPassed, k, nil)
				attr_target = v.Attributes
				AttrProcess(newBlock, val.(map[string]interface{}))
				if v.BlockTypes != nil {
					block_target = v.BlockTypes
					BlockProcess(newBlock, val.(map[string]interface{}))
				}
			}
		}
	}
	BlockProcess(hclBody, input)
}
```

## Writing to disk

Finally, `hclwrite` can be used to write a `hclwrite.File` object to disk. From here, these outputs can be committed to a repository or applied by a backend.

```
package blocks

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/hashicorp/hcl/v2/hclwrite"
)

func OutFile(filename string, hclFile hclwrite.File) {
	pwd, _ := os.Getwd()
	newpath := filepath.Join(pwd, "..", "out")
	_ = os.MkdirAll(newpath, os.ModePerm)
	outFile, _ := os.Create(newpath + "/" + filename)
	fmt.Printf("%s", hclFile.Bytes())
	outFile.Write(hclFile.Bytes())
}
```

## Proving our work

To put a final bow on the effort, I’m providing a few silly examples of how a similar project could be validated.

```
package blocks_test

import (
	"example/blocks"
	"testing"
)

// If the provider knows the field, it will be accepted
func TestGithubRepositoryValidateInputGood(t *testing.T) {
	mapOfSlices := map[string]interface{}{
		"name":       "foo",
		"visibility": "public",
	}
	result := blocks.GithubRepositoryValidateInput(mapOfSlices)
	if result != nil {
		t.Error("Expected nil, got", result)
	}
}

// If the provider knows the field, but the input is wrong, it will be rejected
func TestGithubRepositoryValidateInputBadInput(t *testing.T) {
	mapOfSlices := map[string]interface{}{
		"name":       "foo",
		"visibility": "foo",
	}
	result := blocks.GithubRepositoryValidateInput(mapOfSlices)
	if result == nil {
		t.Error("Expected not nil, got", result)
	}
}

// If the provider knows the field, but the input is missing the required field, it will be rejected
func TestGithubRepositoryValidateInputMissingRequired(t *testing.T) {
	mapOfSlices := map[string]interface{}{
		"visibility": "public",
	}
	result := blocks.GithubRepositoryValidateInput(mapOfSlices)
	if result == nil {
		t.Error("Expected not nil, got", result)
	}
}

// If the field is unknown by the provider, it will be rejected
func TestGithubRepositoryValidateInputBad(t *testing.T) {
	mapOfSlices := map[string]interface{}{
		"invalid_key": "foo",
	}
	result := blocks.GithubRepositoryValidateInput(mapOfSlices)
	if result == nil {
		t.Error("Expected not nil, got", result)
	}
}
```
