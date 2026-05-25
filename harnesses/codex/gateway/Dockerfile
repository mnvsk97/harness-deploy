FROM node:22-bookworm

ARG CODEX_VERSION=0.133.0

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

WORKDIR /app
COPY package.json server.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/data/home
ENV CODEX_HOME=/data/codex
ENV WORKSPACE_ROOT=/data/workspace

EXPOSE 3001

CMD ["node", "server.js"]
