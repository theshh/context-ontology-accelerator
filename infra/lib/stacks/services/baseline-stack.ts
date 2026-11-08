// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from "aws-cdk-lib";
import * as bedrockagentcore from "aws-cdk-lib/aws-bedrockagentcore";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { SCLStack } from "../../constructs";
import { DEFAULT_BEDROCK_LLM_MODEL_ID } from "../../constants";
import { resolveContext } from "../../context";
import { fromRoot } from "../../paths";
import { parseEcrImageUri } from "../../utils/ecr-utils";
import { brandEnv } from "../../utils/brand-env";

export interface BaselineStackProps extends cdk.StackProps {
  /** COA REST API base URL; the agent replays the caller's token to it for Cedar checks. */
  readonly apiEndpoint: string;
  /** Model the baseline writes SQL with (the same one COA's Tier 2 uses, for a fair comparison). */
  readonly bedrockLlmModelId?: string;
  /** Bucket the per-graph Athena workgroups write results to. */
  readonly athenaResultsBucketName: string;
}

/**
 * Baseline ("without COA") agent for the Playground side-by-side view.
 *
 * A plain text-to-SQL agent on AgentCore Runtime: it sees only the raw Glue
 * schema (no ontology, governed metrics, documents or business descriptions),
 * writes one SELECT, runs it in the graph's Athena workgroup and phrases the
 * result. It exists to show what a generic assistant answers.
 *
 * Access: inbound calls must carry a web-app ID token (AgentCore JWT
 * authorizer, same issuer and audience as the serve runtime). The agent then
 * replays that token to the COA API, whose Cedar authorizer decides whether
 * the caller may read the context graph; any denial fails the request.
 * Data access: read-only Glue/Athena; table access is still governed by Lake
 * Formation grants on the runtime role.
 */
export class BaselineStack extends SCLStack {
  public readonly agentRuntimeArn: string;
  public readonly runtimeRoleArn: string;

  constructor(scope: Construct, id: string, props: BaselineStackProps) {
    super(scope, id, props);
    this.addComponentTag("baseline");

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    const { ssmPrefix } = resolveContext(this.node);

    const issuerUrl = ssm.StringParameter.valueForStringParameter(
      this,
      `${ssmPrefix}/issuer`,
    );
    const clientId = ssm.StringParameter.valueForStringParameter(
      this,
      `${ssmPrefix}/userpool-client-id`,
    );

    // Build context is the package itself (see its Dockerfile). Tests pass
    // `-c baseline_agent_image_uri=...` to skip the image build.
    const explicitImageUri = this.node.tryGetContext(
      "baseline_agent_image_uri",
    ) as string | undefined;
    const image = explicitImageUri
      ? undefined
      : new DockerImageAsset(this, "BaselineImage", {
          directory: fromRoot("packages/baseline-agent"),
          platform: Platform.LINUX_ARM64,
        });
    const imageUri = explicitImageUri ?? image!.imageUri;

    const runtime = new bedrockagentcore.Runtime(this, "BaselineRuntime", {
      runtimeName: this.prefixed("baseline-agent").replace(/-/g, "_"),
      agentRuntimeArtifact:
        bedrockagentcore.AgentRuntimeArtifact.fromImageUri(imageUri),
      // ID tokens from the web app only (aud == app client id), as for serve.
      authorizerConfiguration:
        bedrockagentcore.RuntimeAuthorizerConfiguration.usingJWT(
          `${issuerUrl}/.well-known/openid-configuration`,
          undefined,
          [clientId],
        ),
      // Public network mode: the agent only calls AWS APIs and the COA REST API.
      // Nothing is listening for callers except AgentCore's JWT-gated endpoint.
      networkConfiguration:
        bedrockagentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      requestHeaderConfiguration: { allowlistedHeaders: ["Authorization"] },
      tracingEnabled: false,
      environmentVariables: {
        ...brandEnv(this.node),
        AWS_REGION: region,
        LOG_LEVEL: "INFO",
        MODEL_ID: props.bedrockLlmModelId ?? DEFAULT_BEDROCK_LLM_MODEL_ID,
        COA_API_ENDPOINT: props.apiEndpoint,
      },
      description:
        "Baseline text-to-SQL agent (raw schema only) for the Playground without/with COA view",
    });

    if (image) {
      image.repository.grantPull(runtime.role!);
    } else {
      runtime.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
            "ecr:BatchCheckLayerAvailability",
          ],
          resources: [parseEcrImageUri(explicitImageUri!).repositoryArn],
        }),
      );
    }
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );

    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        resources: [
          `arn:aws:bedrock:*:${account}:inference-profile/*`,
          `arn:aws:bedrock:*::foundation-model/*`,
        ],
      }),
    );

    // Read-only catalog access; Lake Formation still decides which tables.
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "glue:GetDatabase",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetPartitions",
        ],
        resources: [
          `arn:aws:glue:${region}:${account}:catalog`,
          `arn:aws:glue:${region}:${account}:database/*`,
          `arn:aws:glue:${region}:${account}:table/*/*`,
        ],
      }),
    );
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lakeformation:GetDataAccess"],
        resources: ["*"],
      }),
    );

    // Only this deployment's per-graph workgroups (named <prefix>-<env>-<namespaceId>).
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
          "athena:StopQueryExecution",
          "athena:GetWorkGroup",
        ],
        resources: [
          `arn:aws:athena:${region}:${account}:workgroup/${this.prefixed("")}*`,
        ],
      }),
    );
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:AbortMultipartUpload",
        ],
        resources: [
          `arn:aws:s3:::${props.athenaResultsBucketName}`,
          `arn:aws:s3:::${props.athenaResultsBucketName}/*`,
        ],
      }),
    );

    new ssm.StringParameter(this, "BaselineRuntimeArnParam", {
      parameterName: `${ssmPrefix}/baseline/runtime-arn`,
      stringValue: runtime.agentRuntimeArn,
      description: "AgentCore Runtime ARN for the baseline (without COA) agent",
    });
    new ssm.StringParameter(this, "BaselineRuntimeRoleArnParam", {
      parameterName: `${ssmPrefix}/baseline/runtime-role-arn`,
      stringValue: runtime.role!.roleArn,
      description:
        "Baseline agent runtime role (needs Lake Formation grants per Glue database)",
    });

    this.agentRuntimeArn = runtime.agentRuntimeArn;
    this.runtimeRoleArn = runtime.role!.roleArn;
    new cdk.CfnOutput(this, "BaselineRuntimeArn", {
      value: runtime.agentRuntimeArn,
    });
    new cdk.CfnOutput(this, "BaselineRuntimeRoleArn", {
      value: runtime.role!.roleArn,
    });
  }
}
