FROM python:3.12-slim

ARG UV_VERSION=0.9.26
ARG OPEN_SWE_REF=40162a6d9ee0574609bce403b5ae8fcb4b64fed7

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.local/bin:${PATH}"
ENV OPEN_SWE_REF="${OPEN_SWE_REF}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf "https://astral.sh/uv/${UV_VERSION}/install.sh" | sh

WORKDIR /workspace

CMD bash -lc 'set -euo pipefail; \
  rm -rf /workspace/open-swe; \
  git clone https://github.com/langchain-ai/open-swe /workspace/open-swe; \
  cd /workspace/open-swe; \
  git checkout "${OPEN_SWE_REF}"; \
  /root/.local/bin/uv run langgraph dev --host 0.0.0.0 --port 2024 --no-browser'
