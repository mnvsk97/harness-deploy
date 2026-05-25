import http from "node:http";
import { App } from "@slack/bolt";

const port = Number(process.env.PORT || 3000);
const slackBotToken = requiredEnv("SLACK_BOT_TOKEN");
const slackAppToken = requiredEnv("SLACK_APP_TOKEN");
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

let botUserId = "";
let connected = false;
let lastError = "";

const sessions = new Map();
const deliveredEvents = new Map();
const processedSlackEvents = new Set();

const app = new App({
  token: slackBotToken,
  appToken: slackAppToken,
  socketMode: true,
});

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

function allowed(event) {
  const user = event.user || "";
  const channel = event.channel || "";
  if (!user || event.bot_id || event.subtype === "bot_message") return false;
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
  const channel = event.channel || "unknown";
  const root = event.thread_ts || event.ts || event.client_msg_id || "root";
  return `${channel}:${root}`;
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
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Harness returned HTTP ${response.status}`);
  }
  return payload;
}

function extractSessionId(payload) {
  return (
    payload?.session?.id ||
    payload?.thread?.id ||
    payload?.session_id ||
    payload?.threadId ||
    payload?.id ||
    null
  );
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
  if (type && !["assistant.message", "run.completed", "run.failed"].some((prefix) => type.startsWith(prefix))) {
    return "";
  }
  const payload = event.payload || event.event?.params || event;
  const value = payload.text || payload.message || payload.content || payload.output || "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => item.text || item.content || "").filter(Boolean).join("\n").trim();
  }
  return "";
}

async function post(channel, text, thread) {
  await app.client.chat.postMessage({
    channel,
    text: text.slice(0, 39000),
    thread_ts: thread,
  });
}

async function handleSlackMessage(event) {
  const dedupKey = event.client_msg_id || `${event.channel}:${event.ts}:${event.type}`;
  if (processedSlackEvents.has(dedupKey)) return;
  processedSlackEvents.add(dedupKey);
  if (processedSlackEvents.size > 5000) processedSlackEvents.clear();

  if (!allowed(event)) return;

  const channel = event.channel;
  const text = event.text || "";
  const isDm = channel?.startsWith("D");
  const isFree = freeResponseChannels.has(channel);
  const isMentioned = mentioned(text);
  const existingSession = sessions.get(sessionKey(event));
  const isThreadReply = Boolean(event.thread_ts);

  if (!isDm && requireMention && !isFree) {
    if (!(existingSession && isThreadReply)) {
      if (strictMention && !isMentioned) return;
      if (!existingSession && !isMentioned) return;
    }
  }

  const message = cleanSlackText(text);
  if (!message) return;

  const slackThread = threadTs(event);
  await post(channel, existingSession ? `Sending to ${harnessName}...` : `Starting ${harnessName} session...`, slackThread);

  try {
    let sessionId = existingSession;
    if (!sessionId) {
      const created = await harnessFetch(createPath, {
        method: "POST",
        body: { message, source: "slack", slack: { channel, user: event.user, thread_ts: slackThread } },
      });
      sessionId = extractSessionId(created);
      if (!sessionId) throw new Error("Harness response did not include a session id");
      sessions.set(sessionKey(event), sessionId);
      await post(channel, `Session \`${sessionId}\` is running.`, slackThread);
    } else {
      await harnessFetch(templatePath(messagePathTemplate, sessionId), {
        method: "POST",
        body: { message, source: "slack", slack: { channel, user: event.user, thread_ts: slackThread } },
      });
    }

    if (pollEvents) {
      await pollAndPostEvents({ sessionId, channel, slackThread });
    }
  } catch (error) {
    lastError = error.message;
    await post(channel, `Slack bridge error: ${error.message}`, slackThread);
  }
}

async function pollAndPostEvents({ sessionId, channel, slackThread }) {
  const delivered = deliveredEvents.get(sessionId) || new Set();
  deliveredEvents.set(sessionId, delivered);

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    let payload;
    try {
      payload = await harnessFetch(templatePath(eventsPathTemplate, sessionId), {
        timeoutMs: eventPollTimeoutMs,
      });
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

    for (const text of newTexts) {
      await post(channel, text, slackThread);
    }

    const status = payload?.session?.status || payload?.status || "";
    if (["completed", "failed", "cancelled", "waiting_for_input"].includes(status)) return;
  }
}

app.message(async ({ message }) => {
  await handleSlackMessage(message);
});

app.event("app_mention", async ({ event }) => {
  await handleSlackMessage(event);
});

const healthServer = http.createServer((request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path === "/healthz" || path === "/readyz") {
    const status = connected ? 200 : 503;
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: connected, harness: harnessName, lastError: lastError || null }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

healthServer.listen(port, "0.0.0.0", () => {
  console.log(`harness-slack-bridge health server listening on ${port}`);
});

try {
  const auth = await app.client.auth.test();
  botUserId = auth.user_id;
  await app.start();
  connected = true;
  console.log(`harness-slack-bridge connected as ${auth.user} for ${harnessName}`);
} catch (error) {
  lastError = error.message;
  console.error(error);
  process.exitCode = 1;
}
