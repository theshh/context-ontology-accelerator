# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""AgentCore Runtime entrypoint for the baseline agent.

AgentCore validates the caller's JWT (the runtime's customJWTAuthorizer)
before this code runs; the token is forwarded through the allowlisted
Authorization header and replayed to the COA API for the Cedar check.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from botocore.config import Config

from coa_baseline.core import AccessDenied, BadRequest, CoaApi, Deps, NoGlueData, answer, load_skills

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("coa_baseline")

REGION = os.environ["AWS_REGION"]
MODEL_ID = os.environ["MODEL_ID"]
API_ENDPOINT = os.environ["COA_API_ENDPOINT"]
MAX_TOKENS = 8000

_cfg = Config(connect_timeout=5, read_timeout=60, retries={"mode": "standard", "max_attempts": 2})
_glue = boto3.client("glue", region_name=REGION, config=_cfg)
_athena = boto3.client("athena", region_name=REGION, config=_cfg)
_bedrock = boto3.client("bedrock-runtime", region_name=REGION, config=_cfg)

_skills = load_skills()
log.info("baseline_skills_loaded names=%s", [s.name for s in _skills])

app = BedrockAgentCoreApp()


def _converse(system: str, user: str) -> str:
    resp = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        # No temperature: newer Claude models reject it (deprecated parameter).
        # The model reasons before it answers and that reasoning counts toward
        # maxTokens, so 1500 cut multi-period SQL off mid-reply.
        inferenceConfig={"maxTokens": MAX_TOKENS},
    )
    if resp.get("stopReason") == "max_tokens":
        log.warning("baseline_reply_truncated max_tokens=%s", MAX_TOKENS)
    return "".join(b.get("text", "") for b in resp["output"]["message"]["content"])


def _bearer(context: Any) -> str:
    headers = getattr(context, "request_headers", None) or {}
    value = headers.get("Authorization") or headers.get("authorization") or ""
    return value[7:] if value.startswith("Bearer ") else ""


def _error(kind: str, message: str, status: int, request_id: str) -> dict:
    return {"error": kind, "message": message, "statusCode": status, "requestId": request_id}


@app.entrypoint
def invoke(payload: dict, context=None) -> dict:
    """Answer one question the way a generic text-to-SQL assistant would."""
    request_id = str(uuid.uuid4())
    token = _bearer(context)
    if not token:
        return _error("AccessDenied", "Missing bearer token", 401, request_id)
    deps = Deps(
        api=CoaApi(API_ENDPOINT, token),
        glue=_glue,
        athena=_athena,
        converse=_converse,
        model_id=MODEL_ID,
        skills=_skills,
    )
    try:
        out = answer(payload or {}, deps)
        out["requestId"] = request_id
        return out
    except AccessDenied as e:
        log.info("baseline_access_denied request_id=%s reason=%s", request_id, e)
        return _error("AccessDenied", "Not allowed to query this context graph", 403, request_id)
    except NoGlueData:
        return _error(
            "NoGlueData",
            "This context graph has no AWS Glue data connections. The plain agent can only read Glue tables.",
            422,
            request_id,
        )
    except BadRequest as e:
        return _error("ValidationError", str(e), 400, request_id)
    except Exception:
        log.exception("baseline_failed request_id=%s", request_id)
        return _error("InternalError", "Baseline agent failed", 500, request_id)


if __name__ == "__main__":
    app.run()
