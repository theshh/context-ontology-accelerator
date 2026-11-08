# Baseline ("without COA") agent for the Playground side-by-side view.
# Build context is this package directory:
#   docker build packages/baseline-agent
# (Not the repo root: the root .dockerignore is an allowlist shared by the other
# images, and widening it would change every one of their asset hashes.)
# Same pinned, patched AL2023 base as the Context Manager image. constraints.txt
# is generated from the repo's uv.lock (scripts/uv_lock_constraints.py), so the
# installed versions match what the rest of the repo is tested on.
FROM --platform=linux/arm64 public.ecr.aws/amazonlinux/amazonlinux:2023-minimal@sha256:fe18d1ee02440b6480eb4a045be052e9aeaf9bf5029368f09d3425ddab2bfa0a

WORKDIR /app

RUN dnf upgrade -y --releasever=latest && \
    dnf install -y --releasever=latest python3.12 python3.12-pip shadow-utils && \
    ln -sf /usr/bin/python3.12 /usr/local/bin/python && \
    dnf clean all && rm -rf /var/cache/dnf

RUN useradd --no-create-home --shell /bin/false appuser

COPY constraints.txt /tmp/constraints.txt
RUN python -m pip install --no-cache-dir -c /tmp/constraints.txt bedrock-agentcore boto3 sqlglot && \
    python -m pip install --no-cache-dir -c /tmp/constraints.txt --upgrade pip "setuptools>=78.1.1" && \
    rm /tmp/constraints.txt

COPY src/ ./src/
ENV PYTHONPATH=/app/src PYTHONUNBUFFERED=1

# AgentCore Runtime calls the container on 8080 (/invocations, /ping). No host
# port is published; AgentCore fronts it with JWT-authenticated invocations.
EXPOSE 8080
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/ping')" || exit 1

CMD ["python", "-m", "coa_baseline.main"]
