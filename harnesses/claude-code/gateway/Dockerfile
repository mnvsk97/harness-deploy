FROM node:22-bookworm

ARG CLAUDE_CODE_VERSION=2.1.150

RUN apt-get update && \
    apt-get install -y --no-install-recommends bubblewrap ca-certificates git make g++ python3 ripgrep socat && \
    npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json server.js ./
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/data/home
ENV CLAUDE_CONFIG_DIR=/data/claude
ENV WORKSPACE_ROOT=/data/workspaces

EXPOSE 3001

CMD ["node", "server.js"]
