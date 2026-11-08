// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { BaselineStack } from "../../lib/stacks/services/baseline-stack";
import { DEFAULT_RESOURCE_PREFIX, DEFAULT_ENV } from "../../lib/constants";

const ENV = { account: "123456789012", region: "ap-southeast-1" };

function synth(): Template {
  const app = new cdk.App({
    context: {
      resource_prefix: DEFAULT_RESOURCE_PREFIX,
      env: DEFAULT_ENV,
      baseline_agent_image_uri:
        "123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/baseline:latest",
    },
  });
  const stack = new BaselineStack(app, "TestBaseline", {
    env: ENV,
    apiEndpoint: "https://api.example.com/prod/",
    bedrockLlmModelId: "global.anthropic.claude-sonnet-5-5",
    athenaResultsBucketName: "coa-dev-athena-results-123456789012",
  });
  return Template.fromStack(stack);
}

describe("BaselineStack", () => {
  const template = synth();

  it("gates the runtime with the web app's JWT and forwards the Authorization header", () => {
    template.hasResourceProperties(
      "AWS::BedrockAgentCore::Runtime",
      Match.objectLike({
        AuthorizerConfiguration: {
          CustomJWTAuthorizer: Match.objectLike({
            DiscoveryUrl: Match.anyValue(),
            AllowedAudience: Match.anyValue(),
          }),
        },
        RequestHeaderConfiguration: {
          RequestHeaderAllowlist: ["Authorization"],
        },
        NetworkConfiguration: { NetworkMode: "PUBLIC" },
        EnvironmentVariables: Match.objectLike({
          MODEL_ID: "global.anthropic.claude-sonnet-5-5",
          COA_API_ENDPOINT: "https://api.example.com/prod/",
        }),
      }),
    );
  });

  it("can only run queries in this deployment's workgroups", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const statements = Object.values(policies).flatMap(
      (p) =>
        (
          p as {
            Properties: {
              PolicyDocument: { Statement: Array<Record<string, unknown>> };
            };
          }
        ).Properties.PolicyDocument.Statement,
    );
    const athena = statements.find((s) =>
      JSON.stringify(s.Action).includes("athena:StartQueryExecution"),
    );
    expect(athena).toBeDefined();
    expect(JSON.stringify(athena!.Resource)).toContain(
      `workgroup/${DEFAULT_RESOURCE_PREFIX}-${DEFAULT_ENV}-`,
    );
    // No write access to the catalog.
    expect(JSON.stringify(statements)).not.toMatch(
      /glue:(Create|Delete|Update)/,
    );
  });

  it("publishes the runtime ARN and role for the web app and Lake Formation grants", () => {
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: `/${DEFAULT_RESOURCE_PREFIX}/baseline/runtime-arn`,
    });
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: `/${DEFAULT_RESOURCE_PREFIX}/baseline/runtime-role-arn`,
    });
  });
});
