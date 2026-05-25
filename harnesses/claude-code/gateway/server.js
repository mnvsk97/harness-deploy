import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pty from "node-pty";

const port = Number(process.env.PORT || 3001);
const workspaceRoot = process.env.WORKSPACE_ROOT || "/data/workspaces";
const stateRoot = process.env.CLAUDE_GATEWAY_STATE_DIR || "/data/gateway-state";
const home = process.env.HOME || "/data/home";
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || "/data/claude";
const gatewayToken = process.env.GATEWAY_BEARER_TOKEN || "";
const defaultModel = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "";
const defaultPermissionMode = process.env.CLAUDE_PERMISSION_MODE || "bypassPermissions";
const maxSessionEvents = Number(process.env.CLAUDE_GATEWAY_MAX_EVENTS || 10000);

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
        pty: null,
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

function ptyArgs(session, initialMessage) {
  const args = [];
  if (session.model) args.push("--model", session.model);
  if (session.permission_mode) args.push("--permission-mode", session.permission_mode);
  if (initialMessage) args.push(initialMessage);
  return args;
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
    events: [],
    next_sequence: 1,
    pty: null,
  };
  sessions.set(sessionId, session);
  persistSession(session);
  appendEvent(session, "harness.started", {
    harness: "claude-code",
    workspace_dir: workspaceDir,
    state_dir: stateDir,
  });

  const child = pty.spawn("claude", ptyArgs(session, message), {
    name: "xterm-256color",
    cols: 120,
    rows: 36,
    cwd: workspaceDir,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB || "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || "1",
      DISABLE_UPDATES: process.env.DISABLE_UPDATES || "1",
      IS_DEMO: process.env.IS_DEMO || "1",
    },
  });

  session.pty = child;
  session.status = "running";
  appendEvent(session, "harness.status", { status: "running", pid: child.pid });

  child.onData((data) => {
    appendEvent(session, "assistant.message", { text: data, stream: "pty" });
  });

  child.onExit(({ exitCode, signal }) => {
    session.status = exitCode === 0 ? "completed" : "failed";
    session.exit = { exit_code: exitCode, signal };
    session.pty = null;
    appendEvent(session, exitCode === 0 ? "run.completed" : "run.failed", session.exit);
  });

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
    live: Boolean(session.pty),
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
    if (!session.pty) throw new Error("Session is not live");
    const body = await readBody(request);
    const message = inputFromBody(body);
    appendEvent(session, "user.message", { text: message });
    session.pty.write(`${message}\r`);
    setTimeout(() => {
      if (session.pty) session.pty.write("\r");
    }, 150);
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
    if (session.pty) {
      session.status = "cancelled";
      session.pty.kill();
      session.pty = null;
      appendEvent(session, "run.cancelled", {});
    }
    return sendJson(response, 200, { ok: true, session: publicSession(session) });
  }

  if (request.method === "POST" && action === "resume") {
    return sendJson(response, 200, {
      session: publicSession(session),
      note: session.pty ? "Session is already live" : "Native Claude Code resume requires persisted Claude session state and is not started automatically by this endpoint yet",
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
    return sendJson(response, 200, { events: session.events.filter((event) => event.payload?.stream === "pty") });
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
