import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";

/**
 * Alias that API Gateway invokes on the Lambdas behind the REST API.
 *
 * SnapStart only applies to published versions, never to $LATEST, so API
 * Gateway has to call a qualified ARN to get the faster cold start. ApiStack
 * appends this alias to every ARN it reads from `ssmPathHandlers`, so every
 * function wired there must call {@link addApiLiveAlias}. The SSM parameters
 * keep the unqualified ARN, so other callers (Lambda-to-Lambda, EventBridge
 * Scheduler) are unchanged and keep invoking $LATEST.
 */
export const API_LAMBDA_ALIAS = "live";

/**
 * Memory for the Python Lambdas behind API Gateway. Lambda allocates CPU in
 * proportion to memory, so this shortens both init and per-request time.
 */
export const API_LAMBDA_MEMORY_MB = 1024;

/**
 * Function props that enable SnapStart. Old versions are deleted when a new
 * one replaces them: SnapStart for Python bills snapshot cache per active
 * version, so retained versions would keep costing money.
 */
export const SNAPSTART_FUNCTION_PROPS = {
  snapStart: lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
  currentVersionOptions: { removalPolicy: cdk.RemovalPolicy.DESTROY },
} satisfies Partial<lambda.FunctionProps>;

/**
 * Publish the function's current version and point the {@link API_LAMBDA_ALIAS}
 * alias at it. Each deploy that changes the function publishes a new version
 * and takes a new snapshot.
 */
export function addApiLiveAlias(
  fn: lambda.Function,
  id = "LiveAlias",
): lambda.Alias {
  return new lambda.Alias(fn, id, {
    aliasName: API_LAMBDA_ALIAS,
    version: fn.currentVersion,
  });
}
