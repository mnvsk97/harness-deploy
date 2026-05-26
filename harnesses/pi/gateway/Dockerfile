FROM node:22-bookworm

ARG STEPPABLE_PI_REPO=https://github.com/mupt-ai/steppable-pi.git
ARG STEPPABLE_PI_REF=6db2e4aa237f325b79f5adf89415a7e48d071b4e

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git python3 make g++ ripgrep && \
    rm -rf /var/lib/apt/lists/*

RUN git clone "${STEPPABLE_PI_REPO}" /opt/steppable-pi && \
    cd /opt/steppable-pi && \
    git checkout "${STEPPABLE_PI_REF}" && \
    npm ci --ignore-scripts && \
    npm run build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/data/home
ENV PI_HOME=/data/pi
ENV PI_CODING_AGENT_DIR=/data/pi/agent
ENV PI_CODING_AGENT_SESSION_DIR=/data/pi/sessions
ENV PI_WORKSPACE_ROOT=/data/workspaces
ENV PI_STEPPABLE_CLI=/opt/steppable-pi/packages/coding-agent/dist/cli.js
ENV PI_AI_MODULE=/opt/steppable-pi/packages/ai/dist/index.js
ENV PI_PROVIDER=tfy-gateway
ENV PI_MODEL=openai-main/gpt-5.5
ENV PI_MODEL_API=openai-responses
ENV PI_TELEMETRY=0
ENV PI_SKIP_VERSION_CHECK=1

EXPOSE 3001

CMD ["node", "server.js"]
