import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.PORT || 3001);
const workspaceRoot = process.env.WORKSPACE_ROOT || "/data/workspace";
const codexHome = process.env.CODEX_HOME || "/data/codex";
const home = process.env.HOME || "/data/home";
const defaultModel = process.env.CODEX_MODEL || "gpt-5.4";
const codexModelProvider = process.env.CODEX_MODEL_PROVIDER || "";
const tfyGatewayBaseUrl = process.env.TFY_GATEWAY_BASE_URL || "";
const tfyGatewayEnvKey = process.env.TFY_GATEWAY_ENV_KEY || "TFY_GATEWAY_API_KEY";
const tfyGatewaySupportsWebsockets = (process.env.TFY_GATEWAY_SUPPORTS_WEBSOCKETS || "false").toLowerCase() === "true";
const defaultApprovalPolicy = process.env.CODEX_APPROVAL_POLICY || "never";
const defaultSandbox = process.env.CODEX_SANDBOX || "workspace-write";
const codexSandboxNetworkAccess = (process.env.CODEX_SANDBOX_NETWORK_ACCESS || "false").toLowerCase() === "true";
const serviceName = process.env.CODEX_SERVICE_NAME || "tfy_codex_harness";
const gatewayToken = process.env.GATEWAY_BEARER_TOKEN || "";

mkdirSync(workspaceRoot, { recursive: true });
mkdirSync(codexHome, { recursive: true });
mkdirSync(home, { recursive: true });

function tomlString(value) {
  return JSON.stringify(String(value));
}

function writeCodexConfig() {
  if (!codexModelProvider) return;
  if (!tfyGatewayBaseUrl) {
    throw new Error("TFY_GATEWAY_BASE_URL is required when CODEX_MODEL_PROVIDER is set");
  }
  if (!process.env[tfyGatewayEnvKey]) {
    throw new Error(`${tfyGatewayEnvKey} is required when CODEX_MODEL_PROVIDER is set`);
  }

  const config = [
    `model = ${tomlString(defaultModel)}`,
    `model_provider = ${tomlString(codexModelProvider)}`,
    `sandbox_mode = ${tomlString(defaultSandbox)}`,
    "",
    `[model_providers.${codexModelProvider}]`,
    `name = ${tomlString("TrueFoundry AI Gateway")}`,
    `base_url = ${tomlString(tfyGatewayBaseUrl)}`,
    `env_key = ${tomlString(tfyGatewayEnvKey)}`,
    `wire_api = ${tomlString("responses")}`,
    `supports_websockets = ${tfyGatewaySupportsWebsockets ? "true" : "false"}`,
    "",
    `[sandbox_workspace_write]`,
    `writable_roots = [${tomlString(workspaceRoot)}, ${tomlString(join(codexHome, "memories"))}]`,
    `network_access = ${codexSandboxNetworkAccess ? "true" : "false"}`,
    "",
    `[projects.${tomlString(workspaceRoot)}]`,
    `trust_level = ${tomlString("trusted")}`,
    "",
  ].join("\n");

  const homeCodexDir = join(home, ".codex");
  mkdirSync(homeCodexDir, { recursive: true });
  writeFileSync(join(homeCodexDir, "config.toml"), config);
  writeFileSync(join(codexHome, "config.toml"), config);
  console.log(`wrote Codex config for provider ${codexModelProvider}`);
}

writeCodexConfig();

let nextId = 1;
let ready = false;
let appServerExited = false;
let stdoutBuffer = "";
let lastError = "";

const pending = new Map();
const subscribers = new Map();
const recentEvents = new Map();

const codex = spawn("codex", ["app-server", "--listen", "stdio://"], {
  env: {
    ...process.env,
    HOME: home,
    CODEX_HOME: codexHome,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

codex.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    if (line) handleRpcMessage(line);
  }
});

codex.stderr.on("data", (chunk) => {
  lastError = chunk.toString("utf8").slice(-4000);
  process.stderr.write(chunk);
});

codex.on("exit", (code, signal) => {
  ready = false;
  appServerExited = true;
  const error = new Error(`codex app-server exited with code=${code} signal=${signal}`);
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
});

function handleRpcMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    lastError = `Invalid JSON from codex app-server: ${line}`;
    return;
  }

  if (Object.prototype.hasOwnProperty.call(message, "id")) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    if (message.error) waiter.reject(new Error(message.error.message || "Codex JSON-RPC error"));
    else waiter.resolve(message.result ?? {});
    return;
  }

  publishEvent(message);
}

function publishEvent(message) {
  const threadId = extractThreadId(message.params || {});
  if (threadId) {
    const events = recentEvents.get(threadId) || [];
    events.push({ at: new Date().toISOString(), event: message });
    recentEvents.set(threadId, events.slice(-100));
  }

  const payload = `data: ${JSON.stringify(message)}\n\n`;
  const targets = new Set([...(subscribers.get("*") || [])]);
  if (threadId) {
    for (const response of subscribers.get(threadId) || []) targets.add(response);
  }
  for (const response of targets) response.write(payload);
}

function extractThreadId(params) {
  return (
    params.threadId ||
    params.thread?.id ||
    params.turn?.threadId ||
    params.item?.threadId ||
    params.request?.threadId ||
    null
  );
}

function rpc(method, params, timeoutMs = 300000) {
  if (appServerExited) throw new Error("codex app-server is not running");
  const id = nextId++;
  const payload = params === undefined ? { method, id } : { method, id, params };
  const timeout = setTimeout(() => {
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    waiter.reject(new Error(`Timed out waiting for ${method}`));
  }, timeoutMs);

  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, timeout });
  });
  codex.stdin.write(`${JSON.stringify(payload)}\n`);
  return promise;
}

function notify(method, params) {
  codex.stdin.write(`${JSON.stringify({ method, params })}\n`);
}

async function initialize() {
  await rpc("initialize", {
    clientInfo: {
      name: "tfy_codex_harness",
      title: "TrueFoundry Codex Harness",
      version: "0.1.0",
    },
  }, 60000);
  notify("initialized", {});
  ready = true;
}

const initPromise = initialize().catch((error) => {
  lastError = error.message;
  console.error(error);
});

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
  const headerToken = request.headers["x-codex-gateway-token"] || "";
  return auth === `Bearer ${gatewayToken}` || headerToken === gatewayToken;
}

async function requireReady() {
  await initPromise;
  if (!ready) throw new Error(lastError || "codex app-server is not ready");
}

function inputFromBody(body) {
  if (Array.isArray(body.input)) return body.input;
  if (typeof body.message === "string") return [{ type: "text", text: body.message }];
  if (typeof body.prompt === "string") return [{ type: "text", text: body.prompt }];
  throw new Error("Provide `message`, `prompt`, or `input`");
}

async function createSession(body) {
  const params = {
    model: body.model || defaultModel,
    cwd: body.cwd || workspaceRoot,
    approvalPolicy: body.approvalPolicy || defaultApprovalPolicy,
    sandbox: body.sandbox || defaultSandbox,
    serviceName: body.serviceName || serviceName,
  };
  if (body.personality) params.personality = body.personality;
  if (body.settings) params.settings = body.settings;
  if (body.dynamicTools) params.dynamicTools = body.dynamicTools;

  const started = await rpc("thread/start", params);
  const threadId = started.thread?.id;
  if (!threadId) throw new Error("Codex did not return a thread id");

  let turn = null;
  if (body.message || body.prompt || body.input) {
    turn = await rpc("turn/start", {
      threadId,
      input: inputFromBody(body),
    });
  }
  return { ...started, turn };
}

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    return sendJson(response, appServerExited ? 500 : 200, {
      ok: !appServerExited,
      ready,
      lastError: lastError || null,
    });
  }

  if (url.pathname === "/readyz") {
    const authConfigured = Boolean(gatewayToken);
    return sendJson(response, ready && authConfigured ? 200 : 503, {
      ready: ready && authConfigured,
      auth_configured: Boolean(gatewayToken),
      lastError: lastError || null,
    });
  }

  if (!authorized(request)) {
    return sendJson(response, 401, { error: "Missing or invalid gateway token" });
  }

  await requireReady();

  if (request.method === "POST" && url.pathname === "/sessions") {
    const body = await readBody(request);
    return sendJson(response, 200, await createSession(body));
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    const limit = Number(url.searchParams.get("limit") || 50);
    const cursor = url.searchParams.get("cursor");
    return sendJson(response, 200, await rpc("thread/list", { limit, cursor }));
  }

  const match = url.pathname.match(/^\/sessions\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return sendJson(response, 404, { error: "Not found" });

  const threadId = decodeURIComponent(match[1]);
  const action = match[2] || "";

  if (request.method === "GET" && !action) {
    const includeTurns = url.searchParams.get("includeTurns") === "true";
    return sendJson(response, 200, await rpc("thread/read", { threadId, includeTurns }));
  }

  if (request.method === "POST" && action === "messages") {
    const body = await readBody(request);
    return sendJson(response, 200, await rpc("turn/start", {
      threadId,
      input: inputFromBody(body),
      ...(body.model ? { model: body.model } : {}),
      ...(body.cwd ? { cwd: body.cwd } : {}),
      ...(body.approvalPolicy ? { approvalPolicy: body.approvalPolicy } : {}),
      ...(body.sandbox ? { sandbox: body.sandbox } : {}),
    }));
  }

  if (request.method === "POST" && action === "steer") {
    const body = await readBody(request);
    return sendJson(response, 200, await rpc("turn/steer", {
      threadId,
      input: inputFromBody(body),
    }));
  }

  if (request.method === "POST" && action === "interrupt") {
    const body = await readBody(request);
    return sendJson(response, 200, await rpc("turn/interrupt", {
      threadId,
      turnId: body.turnId,
    }));
  }

  if (request.method === "POST" && action === "resume") {
    return sendJson(response, 200, await rpc("thread/resume", { threadId }));
  }

  if (request.method === "GET" && action === "events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ threadId })}\n\n`);
    for (const item of recentEvents.get(threadId) || []) {
      response.write(`data: ${JSON.stringify(item.event)}\n\n`);
    }
    const set = subscribers.get(threadId) || new Set();
    set.add(response);
    subscribers.set(threadId, set);
    const keepAlive = setInterval(() => response.write(": keepalive\n\n"), 25000);
    request.on("close", () => {
      clearInterval(keepAlive);
      set.delete(response);
    });
    return;
  }

  return sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, 500, { error: error.message });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`codex-http-gateway listening on ${port}`);
});
