FROM node:22-bookworm

RUN npm install -g @openai/codex@latest

WORKDIR /app
COPY package.json server.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/data/home
ENV CODEX_HOME=/data/codex
ENV WORKSPACE_ROOT=/data/workspace

EXPOSE 3001

CMD ["node", "server.js"]
