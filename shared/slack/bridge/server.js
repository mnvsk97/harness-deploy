import http from "node:http";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebClient } from "@slack/web-api";

const port = Number(process.env.PORT || 3000);
const slackBotToken = requiredEnv("SLACK_BOT_TOKEN");
const slackSigningSecret = requiredEnv("SLACK_SIGNING_SECRET");
const harnessName = process.env.HARNESS_NAME || "target-harness";
const harnessApiUrl = requiredEnv("HARNESS_API_URL").replace(/\/+$/, "");
const harnessApiToken = process.env.HARNESS_API_TOKEN || "";
const harnessAuthHeader = process.env.HARNESS_AUTH_HEADER || "authorization";
const harnessAuthSchemeRaw = process.env.HARNESS_AUTH_SCHEME;
const harnessAuthScheme = harnessAuthSchemeRaw === "none" ? "" : (harnessAuthSchemeRaw || (harnessAuthHeader.toLowerCase() === "authorization" ? "Bearer" : ""));
const harnessBodyProfile = process.env.HARNESS_BODY_PROFILE || "generic";
const sendInitialMessageAfterCreate = boolEnv("HARNESS_SEND_INITIAL_MESSAGE_AFTER_CREATE", false);
const harnessWorkingDir = process.env.HARNESS_WORKING_DIR || "/data/workspaces/slack";
const requireMention = boolEnv("SLACK_REQUIRE_MENTION", true);
const strictMention = boolEnv("SLACK_STRICT_MENTION", true);
const allowedUsers = csvSet(process.env.SLACK_ALLOWED_USERS || "");
const allowedChannels = csvSet(process.env.SLACK_ALLOWED_CHANNELS || "");
const freeResponseChannels = csvSet(process.env.SLACK_FREE_RESPONSE_CHANNELS || "");
const createPath = process.env.HARNESS_SESSION_CREATE_PATH || "/sessions";
const messagePathTemplate = process.env.HARNESS_SESSION_MESSAGE_PATH_TEMPLATE || "/sessions/{session_id}/messages";
const eventsPathTemplate = process.env.HARNESS_SESSION_EVENTS_PATH_TEMPLATE || "/sessions/{session_id}/events";
const statusPathTemplate = process.env.HARNESS_SESSION_STATUS_PATH_TEMPLATE
  || eventsPathTemplate.replace(/\/(?:events|messages)$/, "");
const pollEvents = boolEnv("HARNESS_POLL_EVENTS", true);
const pollIntervalMs = Number(process.env.HARNESS_POLL_INTERVAL_MS || 3000);
const pollAttempts = Number(process.env.HARNESS_POLL_ATTEMPTS || 20);
const requestTimeoutMs = Number(process.env.HARNESS_REQUEST_TIMEOUT_MS || 300000);
const eventPollTimeoutMs = Number(process.env.HARNESS_EVENT_POLL_TIMEOUT_MS || 10000);
const ignoreEventTimeouts = boolEnv("HARNESS_IGNORE_EVENT_TIMEOUTS", false);
const stateDir = process.env.SLACK_BRIDGE_STATE_DIR || "/data/slack-bridge";
const statePath = join(stateDir, "state.json");
const updateThrottleMs = Number(process.env.SLACK_UPDATE_THROTTLE_MS || 1500);
const runningReaction = process.env.SLACK_REACTION_RUNNING || "eyes";
const successReaction = process.env.SLACK_REACTION_SUCCESS || "white_check_mark";
const failureReaction = process.env.SLACK_REACTION_FAILURE || "x";
const processedSlackEventTtlMs = Number(process.env.SLACK_PROCESSED_EVENT_TTL_MS || 24 * 60 * 60 * 1000);
const processedSlackEventLimit = Number(process.env.SLACK_PROCESSED_EVENT_LIMIT || 5000);

let botUserId = "";
let botUserName = "";
let ready = false;
let lastError = "";

const sessions = new Map();
const deliveredEvents = new Map();
const processedSlackEvents = new Map();
const inFlightSlackEvents = new Set();
const activePolls = new Set();
const slack = new WebClient(slackBotToken);
const metrics = {
  processedSlackEvents: 0,
  dedupedSlackEvents: 0,
  lastSlackEventAt: null,
  lastSessionId: null,
  lastUpdateAt: null,
  resumedActiveRuns: 0,
};

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
  const values = new Set(String(raw || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (values.has("*")) return new Set();
  return values;
}

function loadState() {
  if (!existsSync(statePath)) return;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    for (const [key, value] of Object.entries(state.sessions || {})) {
      const record = typeof value === "string" ? { sessionId: value } : { ...value };
      if (!record.deliveredEventIds) record.deliveredEventIds = [];
      sessions.set(key, record);
      if (record.sessionId && !deliveredEvents.has(record.sessionId)) {
        deliveredEvents.set(record.sessionId, new Set(record.deliveredEventIds || []));
      }
    }
    for (const [key, values] of Object.entries(state.deliveredEvents || {})) deliveredEvents.set(key, new Set(values));
    const processed = Array.isArray(state.processedSlackEvents) ? state.processedSlackEvents : [];
    for (const item of processed) {
      if (typeof item === "string") processedSlackEvents.set(item, Date.now());
      else if (item?.id) processedSlackEvents.set(item.id, Number(item.at || Date.now()));
    }
    pruneProcessedSlackEvents();
  } catch (error) {
    lastError = `Failed to load state: ${error.message}`;
  }
}

function persistState() {
  const state = {
    sessions: Object.fromEntries(sessions.entries()),
    deliveredEvents: Object.fromEntries([...deliveredEvents.entries()].map(([key, value]) => [key, [...value].slice(-1000)])),
    processedSlackEvents: serializeProcessedSlackEvents(),
  };
  const tmpPath = `${statePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, statePath);
}

function pruneProcessedSlackEvents(now = Date.now()) {
  for (const [id, at] of processedSlackEvents.entries()) {
    if (now - at > processedSlackEventTtlMs) processedSlackEvents.delete(id);
  }
  if (processedSlackEvents.size <= processedSlackEventLimit) return;
  const keep = new Set([...processedSlackEvents.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, processedSlackEventLimit)
    .map(([id]) => id));
  for (const id of processedSlackEvents.keys()) {
    if (!keep.has(id)) processedSlackEvents.delete(id);
  }
}

function serializeProcessedSlackEvents() {
  pruneProcessedSlackEvents();
  return [...processedSlackEvents.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, processedSlackEventLimit)
    .map(([id, at]) => ({ id, at }));
}

function hasProcessedSlackEvent(id) {
  pruneProcessedSlackEvents();
  return processedSlackEvents.has(id);
}

function rememberProcessedSlackEvent(id) {
  processedSlackEvents.set(id, Date.now());
  pruneProcessedSlackEvents();
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

function sessionIdFromRecord(record) {
  if (!record) return null;
  if (typeof record === "string") return record;
  return record.sessionId || null;
}

function normalizedSessionRecord(record, fallback = {}) {
  if (record && typeof record === "object") return { ...fallback, ...record };
  if (typeof record === "string") return { ...fallback, sessionId: record };
  return { ...fallback };
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

function stableSlackEventId(envelope) {
  const event = envelope.event || {};
  const team = envelope.team_id || event.team || event.team_id || "unknown-team";
  const channel = event.channel || "unknown-channel";
  const ts = event.client_msg_id || event.ts || event.event_ts || envelope.event_time || envelope.event_id || "unknown-ts";
  return `${team}:${channel}:${ts}`;
}

function threadTs(event) {
  return event.thread_ts || event.ts;
}

function templatePath(template, sessionId) {
  return template.replaceAll("{session_id}", encodeURIComponent(sessionId));
}

function authHeaders() {
  if (!harnessApiToken) return {};
  const value = harnessAuthScheme ? `${harnessAuthScheme} ${harnessApiToken}` : harnessApiToken;
  return { [harnessAuthHeader]: value };
}

function slackContext(message, slack = {}) {
  return { message, source: "slack", slack };
}

function gooseMessage(message) {
  return {
    request_id: crypto.randomUUID(),
    user_message: {
      id: null,
      role: "user",
      created: Math.floor(Date.now() / 1000),
      content: [{ type: "text", text: message }],
      metadata: {},
    },
  };
}

function buildCreateBody(message, slack = {}) {
  if (harnessBodyProfile === "goose") return { working_dir: harnessWorkingDir };
  if (harnessBodyProfile === "openswe-dashboard") return { prompt: message };
  return slackContext(message, slack);
}

function buildMessageBody(message, slack = {}) {
  if (harnessBodyProfile === "goose") return gooseMessage(message);
  if (harnessBodyProfile === "openswe-dashboard") return { content: message };
  return slackContext(message, slack);
}

function parseSseEvents(text) {
  return String(text || "")
    .split(/\n\n+/)
    .map((block) => {
      const eventType = block.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();
      if (!data || data === "[DONE]") return null;
      try {
        const parsed = JSON.parse(data);
        if (eventType && parsed && typeof parsed === "object" && !parsed.type) parsed.type = eventType;
        return parsed;
      } catch {
        return { type: eventType || "message", text: data };
      }
    })
    .filter(Boolean);
}

async function harnessFetch(path, { method = "GET", body, timeoutMs = requestTimeoutMs } = {}) {
  const response = await fetch(`${harnessApiUrl}${path}`, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  let payload = {};
  if (contentType.includes("text/event-stream")) {
    let text = "";
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
        }
      } catch (error) {
        if (error.name !== "AbortError") throw error;
      }
      text += decoder.decode();
    }
    payload = { events: parseSseEvents(text) };
  } else {
    const text = await response.text();
    if (!text) {
      payload = {};
    } else {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { text };
      }
    }
  }
  if (!response.ok) throw new Error(payload.error || payload.message || `Harness returned HTTP ${response.status}`);
  return payload;
}

function extractSessionId(payload) {
  return payload?.session?.id || payload?.thread?.id || payload?.thread_id || payload?.session_id || payload?.threadId || payload?.id || null;
}

function eventId(event, index) {
  return event.id || event.sequence || event.created_at || event.at || `${index}`;
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.messages)) return payload.messages;
  return [];
}

function isTimeoutError(error) {
  const name = error?.name || "";
  const message = error?.message || "";
  return name === "AbortError" || name === "TimeoutError" || /timeout|aborted/i.test(message);
}

function eventText(event) {
  const type = event.type || event.event?.method || "";
  if (event.message?.role && event.message.role !== "assistant") return "";
  if (event.author && event.author !== "agent" && event.author !== "assistant") return "";
  if (Array.isArray(event.chunks)) {
    return event.chunks
      .map((item) => item.text || item.output || item.content || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (Array.isArray(event.message?.content)) {
    return event.message.content.map((item) => item.text || item.content || "").filter(Boolean).join("\n").trim();
  }
  if (type && !["assistant.message", "run.completed", "run.failed", "Message", "messages/partial", "messages/complete"].some((prefix) => type.startsWith(prefix))) return "";
  const payload = event.payload || event.event?.params || event;
  const value = payload.text || payload.message || payload.content || payload.output || "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => item.text || item.content || "").filter(Boolean).join("\n").trim();
  }
  return "";
}

function eventTerminalStatus(event) {
  const type = event.type || "";
  const status = event.payload?.status || event.status || "";
  if (type === "run.completed") return "completed";
  if (type === "run.failed") return "failed";
  if (type === "run.cancelled") return "cancelled";
  if (["finished", "success", "completed", "error", "failed", "cancelled"].includes(status)) return status;
  if (type === "harness.status" && ["idle", "waiting_for_input"].includes(status)) return status;
  if (type === "harness.status" && ["failed", "cancelled"].includes(status)) return status;
  return "";
}

function statusMessage(status, sessionId) {
  const prefix = sessionId ? `${harnessName} session ${sessionId}` : `${harnessName} session`;
  if (["error", "failed"].includes(status)) return `${prefix} ended with status: ${status}.`;
  if (status === "cancelled") return `${prefix} was cancelled.`;
  if (["finished", "success", "completed", "idle", "waiting_for_input"].includes(status)) return `${prefix} is ready.`;
  if (status === "running") return `${prefix} is running.`;
  return "";
}

function isPendingRender(text) {
  return /^(Starting|Sending to)\b| is running\.$|has not produced a response yet/i.test(String(text || "").trim());
}

function eventCreatedAtMs(event) {
  const value = Date.parse(event.created_at || event.createdAt || event.at || "");
  return Number.isFinite(value) ? value : 0;
}

function latestAssistantTextAfter(events, sinceMs) {
  let latest = "";
  for (const event of events) {
    const createdAt = eventCreatedAtMs(event);
    if (sinceMs && createdAt && createdAt < sinceMs - 1000) continue;
    const text = eventText(event);
    if (text) latest = text;
  }
  return latest;
}

function terminalStatusFromEvents(events) {
  let status = "";
  for (const event of events) status = eventTerminalStatus(event) || status;
  return status;
}

async function post(channel, text, thread) {
  return slack.chat.postMessage({
    channel,
    text: text.slice(0, 39000),
    thread_ts: thread,
  });
}

async function updateBotMessage(record, text, { force = false } = {}) {
  const now = Date.now();
  const rendered = String(text || "").trim() || "Working...";
  if (!force && record.lastUpdateAt && now - record.lastUpdateAt < updateThrottleMs) return;
  if (!force && record.lastRenderText === rendered) return;

  try {
    if (!record.botMessageTs) throw new Error("Missing bot message timestamp");
    await slack.chat.update({
      channel: record.channel,
      ts: record.botMessageTs,
      text: rendered.slice(0, 39000),
    });
  } catch (error) {
    const slackError = error?.data?.error || "";
    const canRecoverWithNewMessage = !record.botMessageTs || [
      "cant_update_message",
      "message_not_found",
      "missing_bot_message_timestamp",
    ].includes(slackError) || error.message === "Missing bot message timestamp";
    if (!canRecoverWithNewMessage) throw error;

    const created = await post(record.channel, rendered, record.slackThread);
    record.botMessageTs = created.ts || record.botMessageTs;
  }

  record.lastRenderText = rendered;
  record.lastUpdateAt = now;
  metrics.lastUpdateAt = new Date(now).toISOString();
  persistState();
}

async function addReaction(channel, timestamp, name) {
  if (!channel || !timestamp || !name) return;
  try {
    await slack.reactions.add({ channel, timestamp, name });
  } catch (error) {
    if (!["already_reacted", "missing_scope"].includes(error?.data?.error)) lastError = error.message;
  }
}

async function removeReaction(channel, timestamp, name) {
  if (!channel || !timestamp || !name) return;
  try {
    await slack.reactions.remove({ channel, timestamp, name });
  } catch (error) {
    if (!["no_reaction", "missing_scope"].includes(error?.data?.error)) lastError = error.message;
  }
}

async function markRunning(record, timestamp) {
  await addReaction(record.channel, timestamp || record.originalMessageTs, runningReaction);
}

async function markComplete(record, timestamp, failed = false) {
  const targetTs = timestamp || record.originalMessageTs;
  await removeReaction(record.channel, targetTs, runningReaction);
  await addReaction(record.channel, targetTs, failed ? failureReaction : successReaction);
}

function shouldHandleMessage(event) {
  if (!allowed(event)) return false;
  const channel = event.channel || "";
  const text = event.text || "";
  const isDm = channel.startsWith("D");
  const isFree = freeResponseChannels.has(channel);
  const isMentioned = mentioned(text);
  const existingSession = sessionIdFromRecord(sessions.get(sessionKey(event)));
  const isThreadReply = Boolean(event.thread_ts);

  if (!isDm && requireMention && !isFree) {
    if (!(existingSession && isThreadReply)) {
      if (strictMention && !isMentioned) return false;
      if (!existingSession && !isMentioned) return false;
    }
  }

  return Boolean(cleanSlackText(text));
}

async function handleSlackMessage(envelope) {
  const event = envelope.event || envelope;
  try {
    if (!shouldHandleMessage(event)) return;

    const dedupKey = stableSlackEventId(envelope);
    if (hasProcessedSlackEvent(dedupKey) || inFlightSlackEvents.has(dedupKey)) {
      metrics.dedupedSlackEvents += 1;
      return;
    }
    inFlightSlackEvents.add(dedupKey);
    rememberProcessedSlackEvent(dedupKey);
    persistState();

    const channel = event.channel;
    const message = cleanSlackText(event.text || "");
    const slackThread = threadTs(event);
    const key = sessionKey({ ...event, team: envelope.team_id || event.team });
    const existingRecord = sessions.get(key);
    const record = normalizedSessionRecord(existingRecord, {
      channel,
      slackThread,
      originalMessageTs: event.ts,
      botMessageTs: null,
      lastRenderText: "",
      lastUpdateAt: 0,
      deliveredEventIds: [],
    });
    record.channel = record.channel || channel;
    record.slackThread = record.slackThread || slackThread;
    if (record.originalMessageTs !== event.ts) {
      record.originalMessageTs = event.ts;
      record.botMessageTs = null;
      record.lastRenderText = "";
      record.lastUpdateAt = 0;
    }

    await markRunning(record, event.ts);
    if (!record.botMessageTs) {
      const created = await post(channel, existingRecord ? `Sending to ${harnessName}...` : `Starting ${harnessName} session...`, slackThread);
      record.botMessageTs = created.ts || null;
      record.lastRenderText = existingRecord ? `Sending to ${harnessName}...` : `Starting ${harnessName} session...`;
      record.lastUpdateAt = Date.now();
      metrics.lastUpdateAt = new Date(record.lastUpdateAt).toISOString();
    } else {
      await updateBotMessage(record, `Sending to ${harnessName}...`, { force: true });
    }
    sessions.set(key, record);
    persistState();

    let sessionId = record.sessionId;
    if (!sessionId) {
      const created = await harnessFetch(createPath, {
        method: "POST",
        body: buildCreateBody(message, { channel, user: event.user, thread_ts: slackThread, team: envelope.team_id }),
      });
      sessionId = extractSessionId(created);
      if (!sessionId) throw new Error("Harness response did not include a session id");
      record.sessionId = sessionId;
      metrics.lastSessionId = sessionId;
      sessions.set(key, record);
      persistState();
      await updateBotMessage(record, statusMessage("running", sessionId), { force: true });
      if (sendInitialMessageAfterCreate) {
        await harnessFetch(templatePath(messagePathTemplate, sessionId), {
          method: "POST",
          body: buildMessageBody(message, { channel, user: event.user, thread_ts: slackThread, team: envelope.team_id }),
        });
      }
    } else {
      metrics.lastSessionId = sessionId;
      await harnessFetch(templatePath(messagePathTemplate, sessionId), {
        method: "POST",
        body: buildMessageBody(message, { channel, user: event.user, thread_ts: slackThread, team: envelope.team_id }),
      });
    }

    metrics.processedSlackEvents += 1;
    metrics.lastSlackEventAt = new Date().toISOString();
    if (pollEvents) {
      record.activeRun = {
        sessionId,
        userMessageTs: event.ts,
        startedAt: new Date().toISOString(),
      };
      sessions.set(key, record);
      persistState();
      await pollAndPostEvents({ sessionId, record, userMessageTs: event.ts });
    }
  } catch (error) {
    lastError = error.message;
    const key = sessionKey({ ...event, team: envelope.team_id || event.team });
    const record = sessions.get(key);
    if (record && typeof record === "object") {
      await updateBotMessage(record, `Slack bridge error: ${error.message}`, { force: true });
      await markComplete(record, event.ts, true);
      clearActiveRun(record, event.ts);
    } else if (event.channel) {
      await post(event.channel, `Slack bridge error: ${error.message}`, threadTs(event));
    }
  } finally {
    inFlightSlackEvents.delete(stableSlackEventId(envelope));
  }
}

async function pollAndPostEvents({ sessionId, record, userMessageTs }) {
  const pollKey = `${sessionId}:${userMessageTs}`;
  if (activePolls.has(pollKey)) return;
  activePolls.add(pollKey);
  const delivered = deliveredEvents.get(sessionId) || new Set();
  deliveredEvents.set(sessionId, delivered);

  try {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      let payload;
      try {
        payload = await harnessFetch(templatePath(eventsPathTemplate, sessionId), { timeoutMs: eventPollTimeoutMs });
      } catch (error) {
        if (ignoreEventTimeouts && isTimeoutError(error)) {
          lastError = "";
          continue;
        }
        lastError = error.message;
        await updateBotMessage(record, `Slack bridge error: ${error.message}`, { force: true });
        await markComplete(record, userMessageTs, true);
        clearActiveRun(record, userMessageTs);
        return;
      }

      const newTexts = [];
      let terminalStatus = "";
      extractEvents(payload).forEach((event, index) => {
        terminalStatus = eventTerminalStatus(event) || terminalStatus;
        const id = eventId(event, index);
        if (delivered.has(id)) return;
        delivered.add(id);
        const text = eventText(event);
        if (text) newTexts.push(text);
      });
      record.deliveredEventIds = [...delivered].slice(-1000);
      persistState();

      for (const text of newTexts) await updateBotMessage(record, text);

      const status = terminalStatus || payload?.session?.status || payload?.status || "";
      if (status === "running" && !newTexts.length) await updateBotMessage(record, statusMessage(status, sessionId));
      if (["completed", "finished", "success", "error", "failed", "cancelled", "waiting_for_input", "idle"].includes(status)) {
        if (newTexts.length) {
          await updateBotMessage(record, newTexts[newTexts.length - 1], { force: true });
        } else {
          await updateBotMessage(record, statusMessage(status, sessionId), { force: true });
        }
        await markComplete(record, userMessageTs, ["error", "failed", "cancelled"].includes(status));
        clearActiveRun(record, userMessageTs);
        return;
      }
    }

    await handlePollExhausted({ sessionId, record, userMessageTs });
  } finally {
    activePolls.delete(pollKey);
  }
}

async function handlePollExhausted({ sessionId, record, userMessageTs }) {
  let events = [];
  let status = "";
  try {
    const payload = await harnessFetch(templatePath(statusPathTemplate, sessionId), { timeoutMs: eventPollTimeoutMs });
    status = payload?.session?.status || payload?.status || "";
  } catch (error) {
    lastError = error.message;
  }
  try {
    const payload = await harnessFetch(templatePath(eventsPathTemplate, sessionId), { timeoutMs: eventPollTimeoutMs });
    events = extractEvents(payload);
    const latestText = latestAssistantTextAfter(events, record.lastUpdateAt || 0);
    if (latestText) {
      await updateBotMessage(record, latestText, { force: true });
      await markComplete(record, userMessageTs, false);
      clearActiveRun(record, userMessageTs);
      return;
    }
    status = terminalStatusFromEvents(events) || status;
  } catch (error) {
    lastError = error.message;
  }

  const failed = ["error", "failed", "cancelled"].includes(status);
  const terminal = ["completed", "finished", "success", "error", "failed", "cancelled", "waiting_for_input", "idle"].includes(status);
  const text = terminal
    ? statusMessage(status, sessionId)
    : `${harnessName} has not produced a response yet for session ${sessionId}.`;

  await updateBotMessage(record, text, { force: true });
  if (terminal) await markComplete(record, userMessageTs, failed);
  clearActiveRun(record, userMessageTs);
}

function clearActiveRun(record, userMessageTs) {
  if (!record.activeRun || record.activeRun.userMessageTs !== userMessageTs) return;
  delete record.activeRun;
  persistState();
}

function resumeActiveRuns() {
  if (!pollEvents) return;
  for (const record of sessions.values()) {
    if (!record || typeof record !== "object" || !record.activeRun?.sessionId || !record.activeRun?.userMessageTs) continue;
    if (!record.channel || !record.slackThread || !record.botMessageTs) continue;
    metrics.resumedActiveRuns += 1;
    void pollAndPostEvents({
      sessionId: record.activeRun.sessionId,
      record,
      userMessageTs: record.activeRun.userMessageTs,
    });
  }
  recoverPendingSessions();
}

function recoverPendingSessions() {
  for (const record of sessions.values()) {
    if (!record || typeof record !== "object" || record.activeRun) continue;
    if (!record.sessionId || !record.channel || !record.slackThread || !record.botMessageTs) continue;
    if (!isPendingRender(record.lastRenderText)) continue;
    metrics.resumedActiveRuns += 1;
    void handlePollExhausted({
      sessionId: record.sessionId,
      record,
      userMessageTs: record.originalMessageTs,
    });
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
      processed_slack_events: metrics.processedSlackEvents,
      deduped_slack_events: metrics.dedupedSlackEvents,
      last_slack_event_at: metrics.lastSlackEventAt,
      last_session_id: metrics.lastSessionId,
      last_update_at: metrics.lastUpdateAt,
      persisted_dedupe_events: processedSlackEvents.size,
      active_pollers: activePolls.size,
      resumed_active_runs: metrics.resumedActiveRuns,
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
    resumeActiveRuns();
  } catch (error) {
    lastError = error.message;
    console.error(error);
  }
});
