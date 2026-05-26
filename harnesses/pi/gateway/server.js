import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix as posixPath } from "node:path";

const port = Number(process.env.PORT || 3001);
const piHome = process.env.PI_HOME || "/data/pi";
const agentDir = process.env.PI_CODING_AGENT_DIR || join(piHome, "agent");
const sessionDir = process.env.PI_CODING_AGENT_SESSION_DIR || join(piHome, "sessions");
const workspaceRoot = process.env.PI_WORKSPACE_ROOT || "/data/workspaces";
const gatewayStateDir = process.env.PI_GATEWAY_STATE_DIR || join(piHome, "gateway-state");
const cliPath = process.env.PI_STEPPABLE_CLI || "/opt/steppable-pi/packages/coding-agent/dist/cli.js";
const aiModulePath = process.env.PI_AI_MODULE || "/opt/steppable-pi/packages/ai/dist/index.js";
const defaultProvider = process.env.PI_PROVIDER || "tfy-gateway";
const defaultModel = process.env.PI_MODEL || "openai-main/gpt-5.5";
const defaultThinking = process.env.PI_THINKING || "off";
const sandboxProvider = (process.env.PI_SANDBOX_PROVIDER || "local").toLowerCase();
const daytonaWorkdir = process.env.PI_DAYTONA_WORKDIR || "/workspace";
const daytonaApiKey = process.env.DAYTONA_API_KEY || "";
const daytonaApiUrl = process.env.DAYTONA_API_URL || "";
const daytonaTarget = process.env.DAYTONA_TARGET || "";
const daytonaImageName = process.env.PI_DAYTONA_IMAGE || "node:22-bookworm";
const gatewayToken = process.env.GATEWAY_BEARER_TOKEN || "";
const modelApiKey = process.env.PI_MODEL_API_KEY || process.env.TFY_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || "";

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const daytonaAutoStopInterval = numberEnv("PI_DAYTONA_AUTO_STOP_INTERVAL", 15);
const daytonaAutoArchiveInterval = numberEnv("PI_DAYTONA_AUTO_ARCHIVE_INTERVAL", 60);
const daytonaAutoDeleteInterval = numberEnv("PI_DAYTONA_AUTO_DELETE_INTERVAL", 1440);

for (const dir of [piHome, agentDir, sessionDir, workspaceRoot, gatewayStateDir]) {
  mkdirSync(dir, { recursive: true });
}

let streamSimplePromise;
async function streamSimple() {
  if (!streamSimplePromise) {
    streamSimplePromise = import(aiModulePath).then((module) => module.streamSimple);
  }
  return streamSimplePromise;
}

let daytonaClientPromise;
async function daytonaClient() {
  if (!daytonaApiKey) throw new Error("DAYTONA_API_KEY is required when PI_SANDBOX_PROVIDER=daytona");
  if (!daytonaClientPromise) {
    daytonaClientPromise = import("@daytona/sdk").then(({ Daytona }) => {
      const config = {
        apiKey: daytonaApiKey,
        otelEnabled: false,
      };
      if (daytonaApiUrl) config.apiUrl = daytonaApiUrl;
      if (daytonaTarget) config.target = daytonaTarget;
      return new Daytona(config);
    });
  }
  return daytonaClientPromise;
}

function writeModelConfig() {
  const baseUrl = process.env.PI_MODEL_BASE_URL || process.env.TFY_GATEWAY_BASE_URL || "";
  if (!baseUrl) return;

  const provider = process.env.PI_PROVIDER || defaultProvider;
  const model = process.env.PI_MODEL || defaultModel;
  const config = {
    providers: {
      [provider]: {
        baseUrl,
        apiKey: "PI_MODEL_API_KEY",
        api: process.env.PI_MODEL_API || "openai-responses",
        authHeader: true,
        models: [
          {
            id: model,
            name: model,
            api: process.env.PI_MODEL_API || "openai-responses",
            reasoning: (process.env.PI_MODEL_REASONING || "true").toLowerCase() === "true",
            input: ["text", "image"],
            contextWindow: Number(process.env.PI_MODEL_CONTEXT_WINDOW || 128000),
            maxTokens: Number(process.env.PI_MODEL_MAX_TOKENS || 16384),
          },
        ],
      },
    },
  };
  writeFileSync(join(agentDir, "models.json"), `${JSON.stringify(config, null, 2)}\n`);
}

writeModelConfig();

const sessions = new Map();
const subscribers = new Map();

function sessionRoot(sessionId) {
  return join(workspaceRoot, "sessions", sessionId);
}

function sessionStatePath(sessionId) {
  return join(gatewayStateDir, `${sessionId}.json`);
}

function ensureSessionLayout(sessionId) {
  const root = sessionRoot(sessionId);
  for (const child of ["workspace", "state", "checkpoints", "artifacts"]) {
    mkdirSync(join(root, child), { recursive: true });
  }
  return root;
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    provider: session.provider,
    model: session.model,
    thinking: session.thinking,
    workspace_dir: session.workspace_dir,
    state_dir: session.state_dir,
    sandbox_provider: sandboxProvider,
    sandbox: session.sandbox
      ? {
          provider: session.sandbox.provider,
          id: session.sandbox.id,
          name: session.sandbox.name,
          workdir: session.sandbox.workdir,
        }
      : null,
    live: Boolean(session.child),
    next_action: session.next_action?.type || null,
    error: session.error || null,
  };
}

function persistSession(session) {
  const persisted = {
    ...publicSession(session),
    snapshot: session.snapshot || null,
    events: session.events || [],
  };
  writeFileSync(sessionStatePath(session.id), `${JSON.stringify(persisted, null, 2)}\n`);
}

function loadPersistedSessions() {
  if (!existsSync(gatewayStateDir)) return;
  for (const file of readdirSync(gatewayStateDir, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(join(gatewayStateDir, file.name), "utf8"));
      sessions.set(data.id, {
        id: data.id,
        status: data.status === "running" ? "failed" : data.status,
        created_at: data.created_at,
        updated_at: data.updated_at,
        provider: data.provider || defaultProvider,
        model: data.model || defaultModel,
        thinking: data.thinking || defaultThinking,
        workspace_dir: data.workspace_dir,
        state_dir: data.state_dir,
        snapshot: data.snapshot || null,
        sandbox: data.sandbox || null,
        events: data.events || [],
        next_action: null,
        child: null,
        pending: new Map(),
        stderr: "",
      });
    } catch (error) {
      console.error(`failed to load pi session ${file.name}: ${error.message}`);
    }
  }
}

loadPersistedSessions();

function appendEvent(session, type, payload) {
  const event = {
    id: `evt_${randomUUID()}`,
    session_id: session.id,
    sequence: session.events.length + 1,
    type,
    created_at: new Date().toISOString(),
    payload,
  };
  session.events.push(event);
  if (session.events.length > 2000) session.events = session.events.slice(-2000);
  session.updated_at = event.created_at;
  persistSession(session);

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of subscribers.get(session.id) || []) response.write(data);
  return event;
}

function attachJsonlLineReader(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line) onLine(line);
    }
  });
  stream.on("end", () => {
    if (buffer) onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
  });
}

function startRuntime(session) {
  if (session.child) return;

  const args = [
    cliPath,
    "--mode",
    "steppable-rpc",
    "--provider",
    session.provider,
    "--model",
    session.model,
    "--thinking",
    session.thinking,
    "--session-dir",
    sessionDir,
  ];

  const child = spawn("node", args, {
    cwd: session.workspace_dir,
    env: {
      ...process.env,
      HOME: process.env.HOME || "/data/home",
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
      PI_MODEL_API_KEY: modelApiKey,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  session.child = child;
  session.pending = new Map();
  session.stderr = "";

  attachJsonlLineReader(child.stdout, (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      appendEvent(session, "harness.stderr", { text: `Invalid JSON from steppable Pi: ${line}` });
      return;
    }
    const waiter = session.pending.get(message.id);
    if (!waiter) return;
    session.pending.delete(message.id);
    clearTimeout(waiter.timeout);
    if (message.success === false) {
      waiter.reject(new Error(message.error || `Pi ${message.command || "command"} failed`));
    } else {
      waiter.resolve(message.data ?? {});
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    session.stderr = `${session.stderr}${text}`.slice(-8000);
    appendEvent(session, "harness.stderr", { text });
  });

  child.on("exit", (code, signal) => {
    for (const waiter of session.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(`Pi runtime exited with code=${code} signal=${signal}`));
    }
    session.pending.clear();
    session.child = null;
    if (session.status === "running") session.status = "failed";
    appendEvent(session, "harness.exited", { code, signal });
  });
}

function runtimeCommand(session, command, timeoutMs = 600000) {
  startRuntime(session);
  const id = `req_${randomUUID()}`;
  const payload = { id, ...command };
  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`Timed out waiting for Pi command ${command.type}`));
    }, timeoutMs);
    session.pending.set(id, { resolve, reject, timeout });
  });
  session.child.stdin.write(`${JSON.stringify(payload)}\n`);
  return promise;
}

function textMessage(text) {
  return {
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
}

function serializeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack,
  };
}

function textResult(text) {
  return { content: [{ type: "text", text: text || "" }] };
}

function jsonLiteral(value) {
  return JSON.stringify(value ?? "");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function resolveSandboxPath(session, inputPath) {
  const rawPath = String(inputPath || ".");
  if (rawPath === "." || rawPath === "") return session.sandbox?.workdir || daytonaWorkdir;
  if (rawPath.startsWith(session.workspace_dir)) {
    const relative = rawPath.slice(session.workspace_dir.length).replace(/^\/+/, "");
    return posixPath.join(session.sandbox?.workdir || daytonaWorkdir, relative);
  }
  if (rawPath.startsWith(daytonaWorkdir)) return rawPath;
  if (rawPath.startsWith("/")) return rawPath;
  return posixPath.join(session.sandbox?.workdir || daytonaWorkdir, rawPath);
}

async function ensureDaytonaSandbox(session) {
  const client = await daytonaClient();
  if (session.sandbox?.provider === "daytona" && session.sandbox.id) {
    try {
      const existing = await client.get(session.sandbox.id);
      await existing.process.executeCommand(`mkdir -p ${shellQuote(session.sandbox.workdir || daytonaWorkdir)}`);
      return existing;
    } catch (error) {
      appendEvent(session, "sandbox.recreate", { provider: "daytona", previous_id: session.sandbox.id, error: serializeError(error) });
      session.sandbox = null;
      persistSession(session);
    }
  }

  const suffix = session.id.replace(/^sess_/, "").slice(0, 12).replace(/[^a-zA-Z0-9-]/g, "");
  const name = `pi-${suffix || randomUUID().slice(0, 8)}`;
  const { Image } = await import("@daytona/sdk");
  const image = Image.base(daytonaImageName).dockerfileCommands([
    "RUN apt-get update && apt-get install -y --no-install-recommends zsh python3 git ripgrep findutils grep sed coreutils && rm -rf /var/lib/apt/lists/*",
    `WORKDIR ${daytonaWorkdir}`,
  ]);
  const sandbox = await client.create(
    {
      name,
      image,
      autoStopInterval: daytonaAutoStopInterval,
      autoArchiveInterval: daytonaAutoArchiveInterval,
      autoDeleteInterval: daytonaAutoDeleteInterval,
      labels: {
        app: "pi-steppable-gateway",
        session_id: session.id,
        harness: "pi",
      },
    },
    { timeout: numberEnv("PI_DAYTONA_CREATE_TIMEOUT", 120) },
  );
  session.sandbox = { provider: "daytona", id: sandbox.id, name: sandbox.name || name, workdir: daytonaWorkdir };
  appendEvent(session, "sandbox.started", session.sandbox);
  persistSession(session);
  await sandbox.process.executeCommand(`mkdir -p ${shellQuote(daytonaWorkdir)}`);
  return sandbox;
}

async function executeDaytonaCommand(session, command, options = {}) {
  const sandbox = await ensureDaytonaSandbox(session);
  const timeout = options.timeout || numberEnv("PI_DAYTONA_COMMAND_TIMEOUT", 120);
  const response = await sandbox.process.executeCommand(command, options.cwd || session.sandbox.workdir, {}, timeout);
  const text = response.result || "";
  const exitCode = Number(response.exitCode || 0);
  if (exitCode !== 0) {
    return { result: textResult(`${text}${text ? "\n\n" : ""}Command exited with code ${exitCode}`), isError: true };
  }
  return { result: textResult(text || "(no output)"), isError: false };
}

async function executeDaytonaTool(session, action) {
  appendEvent(session, "sandbox.tool_start", {
    provider: "daytona",
    call_id: action.callId,
    tool_call_id: action.toolCallId,
    tool: action.tool,
  });

  const input = action.input || {};
  let output;
  switch (action.tool) {
    case "bash": {
      output = await executeDaytonaCommand(session, String(input.command || ""), { timeout: input.timeout });
      break;
    }
    case "write": {
      const path = resolveSandboxPath(session, input.path);
      const content = Buffer.from(String(input.content || ""), "utf8").toString("base64");
      output = await executeDaytonaCommand(
        session,
        [
          "python3 - <<'PY'",
          "import base64, pathlib",
          `path = pathlib.Path(${jsonLiteral(path)})`,
          `data = base64.b64decode(${jsonLiteral(content)})`,
          "path.parent.mkdir(parents=True, exist_ok=True)",
          "path.write_bytes(data)",
          `print(f"Successfully wrote {len(data)} bytes to ${String(input.path || path).replaceAll('"', '\\"')}")`,
          "PY",
        ].join("\n"),
      );
      break;
    }
    case "read": {
      const path = resolveSandboxPath(session, input.path);
      const offset = Number(input.offset || 1);
      const limit = input.limit === undefined ? null : Number(input.limit);
      output = await executeDaytonaCommand(
        session,
        [
          "python3 - <<'PY'",
          "import pathlib",
          `path = pathlib.Path(${jsonLiteral(path)})`,
          `offset = max(1, int(${jsonLiteral(offset)}))`,
          `limit_raw = ${limit === null ? "None" : jsonLiteral(limit)}`,
          "text = path.read_text()",
          "lines = text.splitlines()",
          "start = offset - 1",
          "selected = lines[start:] if limit_raw is None else lines[start:start + int(limit_raw)]",
          "print('\\n'.join(selected))",
          "PY",
        ].join("\n"),
      );
      break;
    }
    case "edit": {
      const path = resolveSandboxPath(session, input.path);
      const edits = Buffer.from(JSON.stringify(input.edits || []), "utf8").toString("base64");
      output = await executeDaytonaCommand(
        session,
        [
          "python3 - <<'PY'",
          "import base64, json, pathlib, sys",
          `path = pathlib.Path(${jsonLiteral(path)})`,
          `edits = json.loads(base64.b64decode(${jsonLiteral(edits)}).decode())`,
          "text = path.read_text()",
          "for edit in edits:",
          "    old = edit.get('oldText', '')",
          "    new = edit.get('newText', '')",
          "    count = text.count(old)",
          "    if not old or count != 1:",
          "        raise SystemExit(f'Could not apply edit: oldText matched {count} times')",
          "    text = text.replace(old, new, 1)",
          "path.write_text(text)",
          "print(f'Successfully replaced {len(edits)} block(s) in ' + path.name)",
          "PY",
        ].join("\n"),
      );
      break;
    }
    case "ls": {
      const path = resolveSandboxPath(session, input.path || ".");
      const limit = Number(input.limit || 500);
      output = await executeDaytonaCommand(
        session,
        [
          "python3 - <<'PY'",
          "import pathlib",
          `path = pathlib.Path(${jsonLiteral(path)})`,
          `limit = int(${jsonLiteral(limit)})`,
          "entries = []",
          "for child in sorted(path.iterdir(), key=lambda p: p.name.lower()):",
          "    entries.append(child.name + ('/' if child.is_dir() else ''))",
          "    if len(entries) >= limit: break",
          "print('\\n'.join(entries) if entries else '(empty directory)')",
          "PY",
        ].join("\n"),
      );
      break;
    }
    case "grep": {
      const path = resolveSandboxPath(session, input.path || ".");
      const pattern = String(input.pattern || "");
      const flags = input.ignoreCase ? "-RIni" : "-RIn";
      const command = `grep ${flags} -- ${shellQuote(pattern)} ${shellQuote(path)} | head -n ${Number(input.limit || 100)}`;
      output = await executeDaytonaCommand(session, command);
      if (output.isError && output.result.content[0].text.endsWith("Command exited with code 1")) {
        output = { result: textResult("No matches found"), isError: false };
      }
      break;
    }
    case "find": {
      const path = resolveSandboxPath(session, input.path || ".");
      const pattern = String(input.pattern || "*");
      const command = `find ${shellQuote(path)} -name ${shellQuote(pattern)} -print | sed "s#^${path.replaceAll("#", "\\#")}/##" | head -n ${Number(input.limit || 1000)}`;
      output = await executeDaytonaCommand(session, command);
      break;
    }
    default:
      output = {
        result: textResult(`Tool ${action.tool} is not implemented by the Daytona adapter`),
        isError: true,
      };
  }

  appendEvent(session, "sandbox.tool_end", {
    provider: "daytona",
    call_id: action.callId,
    tool_call_id: action.toolCallId,
    tool: action.tool,
    is_error: output.isError,
  });
  return output;
}

function mapPiEventType(type) {
  if (type === "agent_start") return "harness.started";
  if (type === "agent_end") return "run.completed";
  if (type === "message_start" || type === "message_update" || type === "message_end") return "assistant.message";
  if (type === "tool_execution_start") return "tool.call_requested";
  if (type === "tool_execution_end") return "tool.result_submitted";
  return `pi.${type}`;
}

function recordPiEvents(session, result) {
  session.snapshot = result.state;
  session.next_action = result.nextAction;
  for (const event of result.events || []) {
    appendEvent(session, mapPiEventType(event.type), event);
  }
}

async function callLlm(session, action) {
  const runStream = await streamSimple();
  const options = {
    ...action.request.options,
    apiKey: modelApiKey || action.request.options?.apiKey,
    headers: {
      ...(action.request.options?.headers || {}),
      ...(process.env.PI_MODEL_EXTRA_HEADER ? JSON.parse(process.env.PI_MODEL_EXTRA_HEADER) : {}),
    },
  };
  const stream = runStream(action.request.model, action.request.context, options);
  for await (const event of stream) {
    appendEvent(session, "llm.event", { call_id: action.callId, event });
  }
  return stream.result();
}

async function driveUntilWaiting(session, firstInput) {
  let result = await runtimeCommand(session, { type: "advance", input: firstInput });
  recordPiEvents(session, result);

  while (session.next_action && session.next_action.type !== "wait_for_user") {
    const action = session.next_action;
    if (action.type === "call_llm") {
      try {
        const message = await callLlm(session, action);
        result = await runtimeCommand(session, {
          type: "advance",
          input: { type: "llm_result", callId: action.callId, message },
        });
      } catch (error) {
        result = await runtimeCommand(session, {
          type: "advance",
          input: { type: "llm_error", callId: action.callId, error: serializeError(error) },
        });
      }
      recordPiEvents(session, result);
      continue;
    }

    if (action.type === "call_tool") {
      try {
        const tool =
          sandboxProvider === "daytona" && action.execution === "sandbox"
            ? await executeDaytonaTool(session, action)
            : await runtimeCommand(session, { type: "execute_tool", callId: action.callId });
        result = await runtimeCommand(session, {
          type: "advance",
          input: { type: "tool_result", callId: action.callId, result: tool.result, isError: tool.isError },
        });
      } catch (error) {
        result = await runtimeCommand(session, {
          type: "advance",
          input: { type: "tool_error", callId: action.callId, error: serializeError(error) },
        });
      }
      recordPiEvents(session, result);
      continue;
    }

    if (action.type === "error") {
      session.status = "failed";
      session.error = action.error;
      appendEvent(session, "run.failed", action.error);
      persistSession(session);
      return;
    }
  }

  session.status = "waiting_for_input";
  appendEvent(session, "harness.status", { status: session.status });
  persistSession(session);
}

async function createSession(body) {
  const sessionId = `sess_${randomUUID()}`;
  const root = ensureSessionLayout(sessionId);
  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    status: "running",
    created_at: now,
    updated_at: now,
    provider: body.provider || defaultProvider,
    model: body.model || defaultModel,
    thinking: body.thinking || defaultThinking,
    workspace_dir: join(root, "workspace"),
    state_dir: join(root, "state"),
    snapshot: null,
    sandbox: null,
    next_action: null,
    events: [],
    child: null,
    pending: new Map(),
    stderr: "",
    error: null,
  };
  sessions.set(sessionId, session);
  persistSession(session);
  appendEvent(session, "harness.started", { harness: "pi", runtime: "steppable-rpc", workspace_dir: session.workspace_dir });

  const message = body.message || body.prompt || body.input;
  if (typeof message === "string" && message.trim()) {
    void driveUntilWaiting(session, { type: "user_message", message: textMessage(message) }).catch((error) => {
      session.status = "failed";
      session.error = serializeError(error);
      appendEvent(session, "run.failed", session.error);
      persistSession(session);
    });
  } else {
    session.status = "waiting_for_input";
    persistSession(session);
  }
  return session;
}

async function sendSessionEvent(session, body) {
  const message = body.message || body.prompt || body.input;
  if (typeof message !== "string" || !message.trim()) throw new Error("Provide `message`, `prompt`, or string `input`");
  if (session.status === "running") throw new Error("Session is already running");
  session.status = "running";
  appendEvent(session, "user.message", { text: message });
  void driveUntilWaiting(session, { type: "user_message", message: textMessage(message) }).catch((error) => {
    session.status = "failed";
    session.error = serializeError(error);
    appendEvent(session, "run.failed", session.error);
    persistSession(session);
  });
}

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
  const headerToken = request.headers["x-pi-gateway-token"] || "";
  return auth === `Bearer ${gatewayToken}` || headerToken === gatewayToken;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session;
}

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    return sendJson(response, 200, { ok: true, sessions: sessions.size });
  }

  if (url.pathname === "/readyz") {
    const authConfigured = Boolean(gatewayToken);
    return sendJson(response, modelApiKey && authConfigured ? 200 : 503, {
      ready: Boolean(modelApiKey && authConfigured),
      auth_configured: authConfigured,
      provider: defaultProvider,
      model: defaultModel,
      agent_dir: agentDir,
      workspace_root: workspaceRoot,
    });
  }

  if (!authorized(request)) return sendJson(response, 401, { error: "Missing or invalid gateway token" });

  if (request.method === "POST" && (url.pathname === "/sessions" || url.pathname === "/v1/agents/pi/sessions")) {
    const session = await createSession(await readBody(request));
    return sendJson(response, 200, { session: publicSession(session) });
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    return sendJson(response, 200, { sessions: [...sessions.values()].map(publicSession) });
  }

  const match = url.pathname.match(/^\/(?:v1\/)?sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return sendJson(response, 404, { error: "Not found" });

  const sessionId = decodeURIComponent(match[1]);
  const action = match[2] || "";
  const session = getSession(sessionId);

  if (request.method === "GET" && !action) return sendJson(response, 200, { session: publicSession(session) });

  if (request.method === "POST" && (action === "events" || action === "messages")) {
    await sendSessionEvent(session, await readBody(request));
    return sendJson(response, 202, { ok: true, session: publicSession(session) });
  }

  if (request.method === "GET" && action === "events") return sendJson(response, 200, { events: session.events });

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
    if (session.child) {
      session.child.kill("SIGTERM");
      session.child = null;
    }
    session.status = "cancelled";
    appendEvent(session, "run.cancelled", {});
    return sendJson(response, 200, { ok: true, session: publicSession(session) });
  }

  if (request.method === "POST" && action === "resume") {
    if (!session.snapshot) throw new Error("No Pi snapshot exists for this session");
    startRuntime(session);
    const restored = await runtimeCommand(session, { type: "restore", snapshot: session.snapshot });
    session.snapshot = restored;
    session.status = "waiting_for_input";
    persistSession(session);
    return sendJson(response, 200, { session: publicSession(session) });
  }

  if (request.method === "GET" && action === "workspace") {
    return sendJson(response, 200, {
      workspace_dir: session.workspace_dir,
      state_dir: session.state_dir,
      artifacts_dir: join(sessionRoot(sessionId), "artifacts"),
    });
  }

  if (request.method === "GET" && action === "logs") return sendJson(response, 200, { events: session.events });

  if (request.method === "GET" && action === "snapshot") {
    return sendJson(response, 200, { snapshot: session.snapshot });
  }

  return sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, 500, { error: error.message });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`pi-steppable-gateway listening on ${port}`);
});
