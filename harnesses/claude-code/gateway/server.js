import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const port = Number(process.env.PORT || 3001);
const workspaceRoot = process.env.WORKSPACE_ROOT || "/data/workspaces";
const stateRoot = process.env.CLAUDE_GATEWAY_STATE_DIR || "/data/gateway-state";
const home = process.env.HOME || "/data/home";
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || "/data/claude";
const gatewayToken = process.env.GATEWAY_BEARER_TOKEN || "";
const defaultModel = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "";
const defaultPermissionMode = process.env.CLAUDE_PERMISSION_MODE || "bypassPermissions";
const maxSessionEvents = Number(process.env.CLAUDE_GATEWAY_MAX_EVENTS || 10000);
const defaultMaxTurns = Number(process.env.CLAUDE_MAX_TURNS || 20);
const defaultAllowedTools = (process.env.CLAUDE_ALLOWED_TOOLS || "Bash,Read,Edit,Write,MultiEdit,Glob,Grep,LS,NotebookEdit,WebFetch,WebSearch")
  .split(",")
  .map((tool) => tool.trim())
  .filter(Boolean);

mkdirSync(workspaceRoot, { recursive: true });
mkdirSync(stateRoot, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(claudeConfigDir, { recursive: true });

const sessions = new Map();
const subscribers = new Map();

function sessionDir(sessionId) {
  return join(workspaceRoot, "sessions", sessionId);
}

function sessionStatePath(sessionId) {
  return join(stateRoot, `${sessionId}.json`);
}

function ensureSessionLayout(sessionId) {
  const root = sessionDir(sessionId);
  for (const child of ["workspace", "state", "checkpoints", "artifacts"]) {
    mkdirSync(join(root, child), { recursive: true });
  }
  return root;
}

function nextSequenceFrom(events) {
  return Math.max(0, ...events.map((event) => Number(event.sequence || 0))) + 1;
}

function persistSession(session) {
  const events = session.events || [];
  const safe = {
    id: session.id,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    workspace_dir: session.workspace_dir,
    state_dir: session.state_dir,
    model: session.model || null,
    permission_mode: session.permission_mode,
    max_turns: session.max_turns || null,
    native_session_id: session.native_session_id || null,
    exit: session.exit || null,
    events,
    next_sequence: session.next_sequence || nextSequenceFrom(events),
  };
  writeFileSync(sessionStatePath(session.id), JSON.stringify(safe, null, 2));
}

function loadPersistedSessions() {
  for (const file of readdirSync(stateRoot, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(join(stateRoot, file.name), "utf8"));
      const events = data.events || [];
      sessions.set(data.id, {
        ...data,
        status: data.status === "running" ? "failed" : data.status,
        events,
        next_sequence: data.next_sequence || nextSequenceFrom(events),
        query: null,
        input: null,
        abortController: null,
      });
    } catch (error) {
      console.error(`failed to load session ${file.name}: ${error.message}`);
    }
  }
}

loadPersistedSessions();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function authorized(request) {
  if (!gatewayToken) return false;
  const auth = request.headers.authorization || "";
  const headerToken = request.headers["x-claude-gateway-token"] || request.headers["x-codex-gateway-token"] || "";
  return auth === `Bearer ${gatewayToken}` || headerToken === gatewayToken;
}

function appendEvent(session, type, payload) {
  const event = {
    id: `evt_${randomUUID()}`,
    session_id: session.id,
    sequence: session.next_sequence || 1,
    type,
    created_at: new Date().toISOString(),
    payload,
  };
  session.next_sequence = event.sequence + 1;
  session.events.push(event);
  session.updated_at = event.created_at;
  if (session.events.length > maxSessionEvents) {
    session.events = session.events.slice(-maxSessionEvents);
  }
  persistSession(session);

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of subscribers.get(session.id) || []) response.write(data);
  return event;
}

class MessageQueue {
  constructor() {
    this.messages = [];
    this.waiters = [];
    this.closed = false;
  }

  push(text) {
    if (this.closed) throw new Error("Session input is closed");
    const message = {
      type: "user",
      message: {
        role: "user",
        content: text,
      },
      parent_tool_use_id: null,
    };
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: message, done: false });
    else this.messages.push(message);
  }

  close() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.messages.length) {
        yield this.messages.shift();
        continue;
      }
      if (this.closed) return;
      const next = await new Promise((resolve) => this.waiters.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}

function sdkEnv() {
  return {
    ...process.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: "truefoundry-claude-code-gateway",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB || "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || "1",
    DISABLE_UPDATES: process.env.DISABLE_UPDATES || "1",
  };
}

function sdkOptions(session, { resumeNativeSessionId } = {}) {
  const requestedPermissionMode = session.permission_mode || "default";
  const scrubEnabled = sdkEnv().CLAUDE_CODE_SUBPROCESS_ENV_SCRUB !== "0";
  const permissionMode = scrubEnabled && requestedPermissionMode === "bypassPermissions" ? "default" : requestedPermissionMode;
  return {
    cwd: session.workspace_dir,
    env: sdkEnv(),
    model: session.model || undefined,
    permissionMode,
    allowDangerouslySkipPermissions: permissionMode === "bypassPermissions" && !scrubEnabled,
    allowedTools: defaultAllowedTools,
    maxTurns: session.max_turns || defaultMaxTurns,
    persistSession: true,
    resume: resumeNativeSessionId || undefined,
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: { type: "preset", preset: "claude_code" },
    stderr: (data) => appendEvent(session, "sdk.stderr", { text: data }),
  };
}

function extractAssistantText(message) {
  if (message?.type !== "assistant" || !Array.isArray(message.message?.content)) return "";
  return message.message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function startSdkRuntime(session, { resumeNativeSessionId } = {}) {
  const input = new MessageQueue();
  const abortController = new AbortController();
  const sdkQuery = query({
    prompt: input,
    options: {
      ...sdkOptions(session, { resumeNativeSessionId }),
      abortController,
    },
  });

  session.input = input;
  session.query = sdkQuery;
  session.abortController = abortController;
  session.status = "running";
  appendEvent(session, "harness.status", { status: "running", runtime: "claude-agent-sdk" });

  void (async () => {
    try {
      for await (const message of sdkQuery) {
        if (message.session_id && !session.native_session_id) {
          session.native_session_id = message.session_id;
          persistSession(session);
        }
        appendEvent(session, "sdk.message", { message });

        const text = extractAssistantText(message);
        if (text) appendEvent(session, "assistant.message", { text, stream: "sdk" });

        if (message.type === "result") {
          if (message.session_id) {
            session.native_session_id = message.session_id;
            persistSession(session);
          }
          appendEvent(session, message.subtype === "success" ? "run.completed" : "run.failed", {
            subtype: message.subtype,
            result: message.result,
            session_id: message.session_id,
            total_cost_usd: message.total_cost_usd,
            usage: message.usage,
          });
        }
      }
      if (session.status === "running") session.status = "idle";
      appendEvent(session, "harness.status", { status: session.status });
    } catch (error) {
      session.status = error?.name === "AbortError" ? "cancelled" : "failed";
      appendEvent(session, session.status === "cancelled" ? "run.cancelled" : "run.failed", {
        error: error.message,
      });
    } finally {
      session.query = null;
      session.input = null;
      session.abortController = null;
      persistSession(session);
    }
  })();

  return input;
}

function startClaudeSession({ message, model, permissionMode } = {}) {
  const sessionId = `sess_${randomUUID()}`;
  const root = ensureSessionLayout(sessionId);
  const workspaceDir = join(root, "workspace");
  const stateDir = join(root, "state");
  const session = {
    id: sessionId,
    status: "starting",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace_dir: workspaceDir,
    state_dir: stateDir,
    model: model || defaultModel,
    permission_mode: permissionMode || defaultPermissionMode,
    max_turns: defaultMaxTurns,
    events: [],
    next_sequence: 1,
    native_session_id: null,
    query: null,
    input: null,
    abortController: null,
  };
  sessions.set(sessionId, session);
  persistSession(session);
  appendEvent(session, "harness.started", {
    harness: "claude-code",
    workspace_dir: workspaceDir,
    state_dir: stateDir,
    runtime: "claude-agent-sdk",
  });

  const input = startSdkRuntime(session);
  if (message) input.push(message);

  return session;
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    workspace_dir: session.workspace_dir,
    state_dir: session.state_dir,
    model: session.model || null,
    permission_mode: session.permission_mode,
    native_session_id: session.native_session_id || null,
    runtime: "claude-agent-sdk",
    live: Boolean(session.query),
    exit: session.exit || null,
  };
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session;
}

function inputFromBody(body) {
  if (typeof body.message === "string") return body.message;
  if (typeof body.prompt === "string") return body.prompt;
  if (typeof body.input === "string") return body.input;
  throw new Error("Provide `message`, `prompt`, or string `input`");
}

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    return sendJson(response, 200, {
      ok: true,
      sessions: sessions.size,
    });
  }

  if (url.pathname === "/readyz") {
    const authConfigured = Boolean(gatewayToken);
    return sendJson(response, authConfigured ? 200 : 503, {
      ready: authConfigured,
      auth_configured: authConfigured,
      claude_config_dir: claudeConfigDir,
      workspace_root: workspaceRoot,
    });
  }

  if (!authorized(request)) {
    return sendJson(response, 401, { error: "Missing or invalid gateway token" });
  }

  if (request.method === "POST" && (url.pathname === "/sessions" || url.pathname.match(/^\/v1\/agents\/[^/]+\/sessions$/))) {
    const body = await readBody(request);
    const session = startClaudeSession({
      message: typeof body.message === "string" ? body.message : typeof body.prompt === "string" ? body.prompt : "",
      model: body.model,
      permissionMode: body.permissionMode || body.permission_mode,
    });
    return sendJson(response, 200, { session: publicSession(session) });
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    return sendJson(response, 200, { sessions: [...sessions.values()].map(publicSession) });
  }

  const v1Match = url.pathname.match(/^\/v1\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  const compatMatch = url.pathname.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  const match = v1Match || compatMatch;
  if (!match) return sendJson(response, 404, { error: "Not found" });

  const sessionId = decodeURIComponent(match[1]);
  const action = match[2] || "";
  const session = getSession(sessionId);

  if (request.method === "GET" && !action) {
    return sendJson(response, 200, { session: publicSession(session) });
  }

  if (request.method === "POST" && (action === "events" || action === "messages")) {
    if (!session.input) {
      startSdkRuntime(session, { resumeNativeSessionId: session.native_session_id });
    }
    const body = await readBody(request);
    const message = inputFromBody(body);
    appendEvent(session, "user.message", { text: message });
    session.input.push(message);
    return sendJson(response, 200, { ok: true, session: publicSession(session) });
  }

  if (request.method === "GET" && action === "events") {
    return sendJson(response, 200, { events: session.events });
  }

  if (request.method === "GET" && action === "stream") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`);
    for (const event of session.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
    const set = subscribers.get(sessionId) || new Set();
    set.add(response);
    subscribers.set(sessionId, set);
    const keepAlive = setInterval(() => response.write(": keepalive\n\n"), 25000);
    request.on("close", () => {
      clearInterval(keepAlive);
      set.delete(response);
    });
    return;
  }

  if (request.method === "POST" && action === "cancel") {
    if (session.query) {
      session.status = "cancelled";
      session.input?.close();
      session.query.close();
      session.abortController?.abort();
      session.query = null;
      session.input = null;
      session.abortController = null;
      appendEvent(session, "run.cancelled", {});
    }
    return sendJson(response, 200, { ok: true, session: publicSession(session) });
  }

  if (request.method === "POST" && action === "resume") {
    if (!session.query) {
      startSdkRuntime(session, { resumeNativeSessionId: session.native_session_id });
    }
    return sendJson(response, 200, {
      session: publicSession(session),
      note: session.native_session_id ? "Session runtime is live; future messages will resume through the Claude Agent SDK session." : "Session runtime is live, but no native Claude session id has been observed yet.",
    });
  }

  if (request.method === "GET" && action === "workspace") {
    return sendJson(response, 200, {
      workspace_dir: session.workspace_dir,
      state_dir: session.state_dir,
      artifacts_dir: join(sessionDir(sessionId), "artifacts"),
    });
  }

  if (request.method === "GET" && action === "logs") {
    return sendJson(response, 200, { events: session.events.filter((event) => event.type.startsWith("sdk.") || event.payload?.stream === "sdk") });
  }

  return sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, 500, { error: error.message });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`claude-code-http-gateway listening on ${port}`);
});
