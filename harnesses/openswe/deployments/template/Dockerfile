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

COPY start-openswe.sh /usr/local/bin/start-openswe
RUN chmod +x /usr/local/bin/start-openswe

CMD ["/usr/local/bin/start-openswe"]
