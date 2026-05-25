import http from "node:http";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebClient } from "@slack/web-api";

const port = Number(process.env.PORT || 3000);
const slackBotToken = requiredEnv("SLACK_BOT_TOKEN");
const slackSigningSecret = requiredEnv("SLACK_SIGNING_SECRET");
const harnessName = process.env.HARNESS_NAME || "target-harness";
const harnessApiUrl = requiredEnv("HARNESS_API_URL").replace(/\/+$/, "");
const harnessApiToken = process.env.HARNESS_API_TOKEN || "";
const requireMention = boolEnv("SLACK_REQUIRE_MENTION", true);
const strictMention = boolEnv("SLACK_STRICT_MENTION", true);
const allowedUsers = csvSet(process.env.SLACK_ALLOWED_USERS || "");
const allowedChannels = csvSet(process.env.SLACK_ALLOWED_CHANNELS || "");
const freeResponseChannels = csvSet(process.env.SLACK_FREE_RESPONSE_CHANNELS || "");
const createPath = process.env.HARNESS_SESSION_CREATE_PATH || "/sessions";
const messagePathTemplate = process.env.HARNESS_SESSION_MESSAGE_PATH_TEMPLATE || "/sessions/{session_id}/messages";
const eventsPathTemplate = process.env.HARNESS_SESSION_EVENTS_PATH_TEMPLATE || "/sessions/{session_id}/events";
const pollEvents = boolEnv("HARNESS_POLL_EVENTS", true);
const pollIntervalMs = Number(process.env.HARNESS_POLL_INTERVAL_MS || 3000);
const pollAttempts = Number(process.env.HARNESS_POLL_ATTEMPTS || 20);
const requestTimeoutMs = Number(process.env.HARNESS_REQUEST_TIMEOUT_MS || 300000);
const eventPollTimeoutMs = Number(process.env.HARNESS_EVENT_POLL_TIMEOUT_MS || 10000);
const stateDir = process.env.SLACK_BRIDGE_STATE_DIR || "/data/slack-bridge";
const statePath = join(stateDir, "state.json");

let botUserId = "";
let botUserName = "";
let ready = false;
let lastError = "";

const sessions = new Map();
const deliveredEvents = new Map();
const processedSlackEvents = new Set();
const inFlightSlackEvents = new Set();
const slack = new WebClient(slackBotToken);

mkdirSync(stateDir, { recursive: true });
loadState();

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function boolEnv(key, defaultValue) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function csvSet(raw) {
  return new Set(String(raw || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function loadState() {
  if (!existsSync(statePath)) return;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    for (const [key, value] of Object.entries(state.sessions || {})) sessions.set(key, value);
    for (const [key, values] of Object.entries(state.deliveredEvents || {})) deliveredEvents.set(key, new Set(values));
  } catch (error) {
    lastError = `Failed to load state: ${error.message}`;
  }
}

function persistState() {
  const state = {
    sessions: Object.fromEntries(sessions.entries()),
    deliveredEvents: Object.fromEntries([...deliveredEvents.entries()].map(([key, value]) => [key, [...value].slice(-1000)])),
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySlackSignature(request, rawBody) {
  const timestamp = request.headers["x-slack-request-timestamp"];
  const signature = request.headers["x-slack-signature"];
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${crypto.createHmac("sha256", slackSigningSecret).update(base).digest("hex")}`;
  return timingSafeEqual(digest, signature);
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function allowed(event) {
  const user = event.user || "";
  const channel = event.channel || "";
  if (!user || event.bot_id || event.subtype === "bot_message") return false;
  if (user === botUserId) return false;
  if (allowedUsers.size && !allowedUsers.has(user)) return false;
  if (allowedChannels.size && !allowedChannels.has(channel)) return false;
  return true;
}

function mentioned(text) {
  return Boolean(botUserId && new RegExp(`<@${escapeRegex(botUserId)}(?:\\|[^>]+)?>`).test(text || ""));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSlackText(text) {
  if (!botUserId) return (text || "").trim();
  return (text || "").replace(new RegExp(`<@${escapeRegex(botUserId)}(?:\\|[^>]+)?>`, "g"), "").trim();
}

function sessionKey(event) {
  const team = event.team || event.team_id || "unknown-team";
  const channel = event.channel || "unknown-channel";
  const root = event.thread_ts || event.ts || event.client_msg_id || "root";
  return `${team}:${channel}:${root}`;
}

function threadTs(event) {
  return event.thread_ts || event.ts;
}

function templatePath(template, sessionId) {
  return template.replaceAll("{session_id}", encodeURIComponent(sessionId));
}

async function harnessFetch(path, { method = "GET", body, timeoutMs = requestTimeoutMs } = {}) {
  const response = await fetch(`${harnessApiUrl}${path}`, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      ...(harnessApiToken ? { authorization: `Bearer ${harnessApiToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { text };
    }
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `Harness returned HTTP ${response.status}`);
  return payload;
}

function extractSessionId(payload) {
  return payload?.session?.id || payload?.thread?.id || payload?.session_id || payload?.threadId || payload?.id || null;
}

function eventId(event, index) {
  return event.id || event.sequence || event.created_at || event.at || `${index}`;
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function eventText(event) {
  const type = event.type || event.event?.method || "";
  if (type && !["assistant.message", "run.completed", "run.failed"].some((prefix) => type.startsWith(prefix))) return "";
  const payload = event.payload || event.event?.params || event;
  const value = payload.text || payload.message || payload.content || payload.output || "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => item.text || item.content || "").filter(Boolean).join("\n").trim();
  }
  return "";
}

async function post(channel, text, thread) {
  await slack.chat.postMessage({
    channel,
    text: text.slice(0, 39000),
    thread_ts: thread,
  });
}

function shouldHandleMessage(event) {
  if (!allowed(event)) return false;
  const channel = event.channel || "";
  const text = event.text || "";
  const isDm = channel.startsWith("D");
  const isFree = freeResponseChannels.has(channel);
  const isMentioned = mentioned(text);
  const existingSession = sessions.get(sessionKey(event));
  const isThreadReply = Boolean(event.thread_ts);

  if (!isDm && requireMention && !isFree) {
    if (!(existingSession && isThreadReply)) {
      if (strictMention && !isMentioned) return false;
      if (!existingSession && !isMentioned) return false;
    }
  }

  return Boolean(cleanSlackText(text));
}

function slackEventId(envelope) {
  const event = envelope.event || {};
  return envelope.event_id || event.client_msg_id || `${event.channel}:${event.ts}:${event.type}`;
}

async function handleSlackMessage(envelope) {
  const event = envelope.event || envelope;
  const dedupKey = slackEventId(envelope);
  if (processedSlackEvents.has(dedupKey) || inFlightSlackEvents.has(dedupKey)) return;
  inFlightSlackEvents.add(dedupKey);

  try {
    if (!shouldHandleMessage(event)) return;

    const channel = event.channel;
    const message = cleanSlackText(event.text || "");
    const slackThread = threadTs(event);
    const key = sessionKey({ ...event, team: envelope.team_id || event.team });
    const existingSession = sessions.get(key);

    await post(channel, existingSession ? `Sending to ${harnessName}...` : `Starting ${harnessName} session...`, slackThread);

    let sessionId = existingSession;
    if (!sessionId) {
      const created = await harnessFetch(createPath, {
        method: "POST",
        body: { message, source: "slack", slack: { channel, user: event.user, thread_ts: slackThread, team: envelope.team_id } },
      });
      sessionId = extractSessionId(created);
      if (!sessionId) throw new Error("Harness response did not include a session id");
      sessions.set(key, sessionId);
      persistState();
      await post(channel, `Session \`${sessionId}\` is running.`, slackThread);
    } else {
      await harnessFetch(templatePath(messagePathTemplate, sessionId), {
        method: "POST",
        body: { message, source: "slack", slack: { channel, user: event.user, thread_ts: slackThread, team: envelope.team_id } },
      });
    }

    if (pollEvents) await pollAndPostEvents({ sessionId, channel, slackThread });
    processedSlackEvents.add(dedupKey);
    if (processedSlackEvents.size > 5000) processedSlackEvents.clear();
  } catch (error) {
    lastError = error.message;
    if (event.channel) await post(event.channel, `Slack bridge error: ${error.message}`, threadTs(event));
  } finally {
    inFlightSlackEvents.delete(dedupKey);
  }
}

async function pollAndPostEvents({ sessionId, channel, slackThread }) {
  const delivered = deliveredEvents.get(sessionId) || new Set();
  deliveredEvents.set(sessionId, delivered);

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    let payload;
    try {
      payload = await harnessFetch(templatePath(eventsPathTemplate, sessionId), { timeoutMs: eventPollTimeoutMs });
    } catch (error) {
      lastError = error.message;
      return;
    }

    const newTexts = [];
    extractEvents(payload).forEach((event, index) => {
      const id = eventId(event, index);
      if (delivered.has(id)) return;
      delivered.add(id);
      const text = eventText(event);
      if (text) newTexts.push(text);
    });
    persistState();

    for (const text of newTexts) await post(channel, text, slackThread);

    const status = payload?.session?.status || payload?.status || "";
    if (["completed", "failed", "cancelled", "waiting_for_input", "idle"].includes(status)) return;
  }
}

async function handleSlackEvents(request, response) {
  const rawBody = await readRawBody(request);
  if (!verifySlackSignature(request, rawBody)) return sendJson(response, 401, { error: "Invalid Slack signature" });

  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return sendJson(response, 400, { error: "Invalid JSON" });
  }

  if (envelope.type === "url_verification") return sendJson(response, 200, { challenge: envelope.challenge });
  if (envelope.type !== "event_callback") return sendJson(response, 200, { ok: true });

  sendJson(response, 200, { ok: true });

  if (request.headers["x-slack-retry-num"]) return;
  const eventType = envelope.event?.type || "";
  if (eventType === "app_mention" || eventType === "message") {
    void handleSlackMessage(envelope);
  }
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path === "/healthz" || path === "/readyz") {
    const status = ready ? 200 : 503;
    return sendJson(response, status, {
      ok: ready,
      harness: harnessName,
      bot_user_id: botUserId || null,
      bot_user_name: botUserName || null,
      sessions: sessions.size,
      lastError: lastError || null,
    });
  }
  if (request.method === "POST" && path === "/slack/events") {
    handleSlackEvents(request, response).catch((error) => {
      lastError = error.message;
      sendJson(response, 500, { error: "Slack event handling failed" });
    });
    return;
  }
  return sendJson(response, 404, { error: "Not found" });
});

server.listen(port, "0.0.0.0", async () => {
  console.log(`harness-slack-bridge listening on ${port}`);
  try {
    const auth = await slack.auth.test();
    botUserId = auth.user_id || "";
    botUserName = auth.user || "";
    ready = Boolean(botUserId);
    console.log(`harness-slack-bridge ready as ${botUserName || botUserId} for ${harnessName}`);
  } catch (error) {
    lastError = error.message;
    console.error(error);
  }
});
