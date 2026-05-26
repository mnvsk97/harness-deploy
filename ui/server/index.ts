import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { config as loadEnv } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type ConnectionRecord = {
  id: string;
  name: string;
  control_plane_url: string;
  gateway_base_url: string;
  key_hint: string;
  created_at: string;
};

type AgentRecord = {
  id: string;
  name: string;
  harness: string;
  truefoundry_connection: string;
  llm_model: string;
  slack_app_name: string;
  channel_id: string | null;
  memory_scope: string;
  mcp_servers: string;
  agent_skills: string;
  sandbox: string | null;
  status: string;
  slack_app_id: string | null;
  slack_oauth_url: string | null;
  slack_team_domain: string | null;
  slack_signing_secret_hint: string | null;
  last_error: string | null;
  tfy_deploy_status: string | null;
  generated_yaml: string;
  created_at: string;
  updated_at: string;
};

type AgentResponse = Omit<AgentRecord, "memory_scope" | "mcp_servers" | "agent_skills" | "sandbox"> & {
  memory_scope: string[];
  mcp_servers: string[];
  agent_skills: string[];
  sandbox: { name: string } | null;
  deployment_url: string | null;
  slack_app_created: boolean;
};

type HarnessAutomation = {
  create_slack_target: string;
  slack_app_name_variable: string;
  slack_response_path: string;
  deploy_targets: string[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
loadEnv({ path: join(repoRoot, ".env") });
const execFileAsync = promisify(execFile);

const dataDir = join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "harness-deploy.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    control_plane_url TEXT NOT NULL,
    gateway_base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    harness TEXT NOT NULL,
    truefoundry_connection TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    slack_app_name TEXT NOT NULL,
    channel_id TEXT,
    memory_scope TEXT NOT NULL,
    mcp_servers TEXT NOT NULL,
    agent_skills TEXT NOT NULL,
    sandbox TEXT,
    status TEXT NOT NULL,
    generated_yaml TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

`);

for (const statement of [
  "ALTER TABLE agents ADD COLUMN slack_app_id TEXT",
  "ALTER TABLE agents ADD COLUMN slack_oauth_url TEXT",
  "ALTER TABLE agents ADD COLUMN slack_team_domain TEXT",
  "ALTER TABLE agents ADD COLUMN slack_signing_secret_hint TEXT",
  "ALTER TABLE agents ADD COLUMN last_error TEXT",
  "ALTER TABLE agents ADD COLUMN tfy_deploy_status TEXT"
]) {
  try {
    db.exec(statement);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

const harnesses = [
  { name: "codex", label: "Codex", detail: "Service + Volume gateway" },
  { name: "claude-code", label: "Claude Code", detail: "Service + Volume gateway" },
  { name: "hermes-agent", label: "Hermes Agent", detail: "Service + Volume API" },
  { name: "goose", label: "Goose", detail: "Service + Volume server" },
  { name: "pi", label: "Pi", detail: "Service + Volume gateway" },
  { name: "openswe", label: "Open SWE", detail: "Service + SecretGroup" }
];

const catalog = {
  harnesses,
  models: [
    "openai-main/gpt-4o-mini",
    "openai-main/gpt-5.5",
    "anthropic-main/claude-4-sonnet",
    "tfy-ai-bedrock/us-anthropic-claude-sonnet-4-20250514-v1-0"
  ],
  mcp_servers: [
    {
      fqn: "truefoundry:mcp-server-group:platform-tools:mcp-server:github",
      name: "github",
      status: "authenticated"
    },
    {
      fqn: "truefoundry:mcp-server-group:platform-tools:mcp-server:sentry",
      name: "sentry",
      status: "authenticated"
    },
    {
      fqn: "truefoundry:mcp-server-group:platform-tools:mcp-server:linear",
      name: "linear",
      status: "authenticated"
    }
  ],
  agent_skills: [
    {
      fqn: "agent-skill:my-tenant/platform-skills/code-review:3",
      name: "code-review",
      repo: "platform-skills"
    },
    {
      fqn: "agent-skill:my-tenant/platform-skills/deploy-debugging:1",
      name: "deploy-debugging",
      repo: "platform-skills"
    },
    {
      fqn: "agent-skill:my-tenant/devrel/event-follow-up:2",
      name: "event-follow-up",
      repo: "devrel"
    }
  ]
};

const localRuntime = {
  truefoundry_connection: process.env.TFY_WORKSPACE_FQN || "local-truefoundry",
  has_daytona_key: Boolean(process.env.DAYTONA_API_KEY),
  has_slack_app_config_token: Boolean(process.env.SLACK_APP_CONFIG_TOKEN)
};

const harnessHostEnv: Record<string, string> = {
  codex: "CODEX_GATEWAY_HOST",
  "claude-code": "CLAUDE_CODE_GATEWAY_HOST",
  "hermes-agent": "HERMES_API_HOST",
  goose: "GOOSE_API_HOST",
  pi: "PI_GATEWAY_HOST",
  openswe: "OPENSWE_API_HOST"
};

const harnessAutomation: Record<string, HarnessAutomation> = {
  codex: {
    create_slack_target: "create-codex-slack-app",
    slack_app_name_variable: "CODEX_SLACK_APP_NAME",
    slack_response_path: ".rendered/codex/slack-app-create-response.json",
    deploy_targets: ["deploy-codex", "deploy-codex-slack"]
  },
  "claude-code": {
    create_slack_target: "create-claude-code-slack-app",
    slack_app_name_variable: "CLAUDE_CODE_SLACK_APP_NAME",
    slack_response_path: ".rendered/claude-code/slack-app-create-response.json",
    deploy_targets: ["deploy-claude-code", "deploy-claude-code-slack"]
  },
  "hermes-agent": {
    create_slack_target: "create-hermes-agent-slack-app",
    slack_app_name_variable: "HERMES_SLACK_APP_NAME",
    slack_response_path: ".rendered/hermes-agent/slack-app-create-response.json",
    deploy_targets: ["deploy-hermes-agent"]
  },
  goose: {
    create_slack_target: "create-goose-slack-app",
    slack_app_name_variable: "GOOSE_SLACK_APP_NAME",
    slack_response_path: ".rendered/goose/slack-app-create-response.json",
    deploy_targets: ["deploy-goose", "deploy-goose-slack"]
  },
  pi: {
    create_slack_target: "create-pi-slack-app",
    slack_app_name_variable: "PI_SLACK_APP_NAME",
    slack_response_path: ".rendered/pi/slack-app-create-response.json",
    deploy_targets: ["deploy-pi", "deploy-pi-slack"]
  },
  openswe: {
    create_slack_target: "create-openswe-slack-app",
    slack_app_name_variable: "OPENSWE_SLACK_APP_NAME",
    slack_response_path: ".rendered/openswe/slack-app-create-response.json",
    deploy_targets: ["deploy-openswe", "deploy-openswe-slack"]
  }
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function keyHint(value: string) {
  if (value.length <= 8) return "stored";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function yamlList(items: string[], indent: number, key = "fqn") {
  const pad = " ".repeat(indent);
  return items.map((item) => `${pad}- ${key}: ${item}`).join("\n");
}

function deploymentUrlFor(harness: string) {
  const envKey = harnessHostEnv[harness];
  const host = envKey ? process.env[envKey] : undefined;
  if (!host) return null;
  return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
}

function toAgentResponse(row: AgentRecord): AgentResponse {
  return {
    ...row,
    memory_scope: JSON.parse(row.memory_scope),
    mcp_servers: JSON.parse(row.mcp_servers),
    agent_skills: JSON.parse(row.agent_skills),
    sandbox: row.sandbox ? JSON.parse(row.sandbox) : null,
    deployment_url: deploymentUrlFor(row.harness),
    slack_app_created: Boolean(row.slack_app_id)
  };
}

function getAgent(agentId: string) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRecord | undefined;
}

function makeError(error: unknown) {
  if (error instanceof Error) {
    const maybeProcessError = error as Error & { stdout?: string; stderr?: string };
    return [error.message, maybeProcessError.stderr, maybeProcessError.stdout].filter(Boolean).join("\n");
  }
  return "Unknown command failure";
}

async function runMake(target: string, variables: Record<string, string> = {}) {
  const args = [...Object.entries(variables).map(([key, value]) => `${key}=${value}`), target];
  return execFileAsync("make", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}`
    },
    maxBuffer: 1024 * 1024 * 10
  });
}

function readSlackCreateResponse(relativePath: string) {
  const response = JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as {
    app_id?: string;
    oauth_authorize_url?: string;
    team_domain?: string;
    credentials?: { signing_secret?: string };
  };
  if (!response.app_id || !response.oauth_authorize_url) {
    throw new Error("Slack app response did not include app_id and oauth_authorize_url");
  }
  return {
    app_id: response.app_id,
    oauth_authorize_url: response.oauth_authorize_url,
    team_domain: response.team_domain ?? null,
    signing_secret_hint: response.credentials?.signing_secret ? keyHint(response.credentials.signing_secret) : null
  };
}

function generateYaml(input: {
  name: string;
  harness: string;
  truefoundry_connection: string;
  llm_model: string;
  mcp_servers: string[];
  agent_skills: string[];
  memory_scope: string[];
  slack_app_name: string;
  channel_id?: string;
  sandbox?: { name: string; key: string };
}) {
  const lines = [
    `name: ${input.name}`,
    `harness: ${input.harness}`,
    "",
    "truefoundry:",
    `  connection: ${input.truefoundry_connection}`,
    "",
    "llm:",
    `  model: ${input.llm_model}`
  ];

  if (input.sandbox) {
    lines.push("", "sandbox:", `  name: ${input.sandbox.name}`, "  key: ${daytona_api_key}");
  }

  if (input.mcp_servers.length > 0) {
    lines.push("", "mcp_servers:", yamlList(input.mcp_servers, 2));
  }

  if (input.agent_skills.length > 0) {
    lines.push("", "agent_skills:", yamlList(input.agent_skills, 2));
  }

  lines.push("", "memory:", "  scope:", ...input.memory_scope.map((scope) => `    - ${scope}`));
  lines.push("", "channels:", "  - name: slack", `    app_name: ${input.slack_app_name}`);
  if (input.channel_id) lines.push(`    channel_id: ${input.channel_id}`);

  return `${lines.join("\n")}\n`;
}

const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/catalog", (c) => c.json(catalog));

app.get("/api/runtime", (c) => c.json(localRuntime));

app.get("/api/connections", (c) => {
  const rows = db
    .prepare("SELECT id, name, control_plane_url, gateway_base_url, key_hint, created_at FROM connections ORDER BY created_at DESC")
    .all() as ConnectionRecord[];
  return c.json({ data: rows });
});

app.post("/api/connections", async (c) => {
  const body = await c.req.json<{ name: string; control_plane_url: string; gateway_base_url: string; api_key: string }>();
  if (!body.name || !body.control_plane_url || !body.gateway_base_url || !body.api_key) {
    return c.json({ error: "name, control_plane_url, gateway_base_url, and api_key are required" }, 400);
  }

  const record = {
    id: id("conn"),
    name: body.name,
    control_plane_url: body.control_plane_url,
    gateway_base_url: body.gateway_base_url,
    api_key: body.api_key,
    key_hint: keyHint(body.api_key),
    created_at: now()
  };

  db.prepare(`
    INSERT INTO connections (id, name, control_plane_url, gateway_base_url, api_key, key_hint, created_at)
    VALUES (@id, @name, @control_plane_url, @gateway_base_url, @api_key, @key_hint, @created_at)
  `).run(record);

  return c.json({
    data: {
      id: record.id,
      name: record.name,
      control_plane_url: record.control_plane_url,
      gateway_base_url: record.gateway_base_url,
      key_hint: record.key_hint,
      created_at: record.created_at
    }
  });
});

app.get("/api/agents", (c) => {
  const rows = db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as AgentRecord[];
  return c.json({
    data: rows.map(toAgentResponse)
  });
});

app.patch("/api/agents/:id/status", async (c) => {
  const body = await c.req.json<{ status: string }>();
  if (!["configured", "slack_oauth_pending", "deploying", "running", "stopped", "failed"].includes(body.status)) {
    return c.json({ error: "unsupported status" }, 400);
  }

  const updatedAt = now();
  const result = db
    .prepare("UPDATE agents SET status = ?, updated_at = ? WHERE id = ?")
    .run(body.status, updatedAt, c.req.param("id"));
  if (result.changes === 0) {
    return c.json({ error: "agent not found" }, 404);
  }

  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(c.req.param("id")) as AgentRecord;
  return c.json({ data: toAgentResponse(row) });
});

app.post("/api/agents/:id/slack-app", async (c) => {
  const agentId = c.req.param("id");
  const row = getAgent(agentId);
  if (!row) {
    return c.json({ error: "agent not found" }, 404);
  }
  if (row.slack_app_id) {
    return c.json({ data: toAgentResponse(row) });
  }

  const automation = harnessAutomation[row.harness];
  if (!automation) {
    return c.json({ error: `no Slack app creation target for ${row.harness}` }, 400);
  }

  try {
    await runMake(automation.create_slack_target, {
      [automation.slack_app_name_variable]: row.slack_app_name
    });
    const slackApp = readSlackCreateResponse(automation.slack_response_path);
    db.prepare(`
      UPDATE agents
      SET slack_app_id = ?, slack_oauth_url = ?, slack_team_domain = ?, slack_signing_secret_hint = ?,
          status = ?, last_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      slackApp.app_id,
      slackApp.oauth_authorize_url,
      slackApp.team_domain,
      slackApp.signing_secret_hint,
      "slack_oauth_pending",
      now(),
      agentId
    );
  } catch (error) {
    const message = makeError(error);
    db.prepare("UPDATE agents SET status = ?, last_error = ?, updated_at = ? WHERE id = ?").run("failed", message, now(), agentId);
    return c.json({ error: message }, 500);
  }

  const updated = getAgent(agentId) as AgentRecord;
  return c.json({ data: toAgentResponse(updated) });
});

app.post("/api/agents/:id/deploy", async (c) => {
  const agentId = c.req.param("id");
  const row = getAgent(agentId);
  if (!row) {
    return c.json({ error: "agent not found" }, 404);
  }

  const automation = harnessAutomation[row.harness];
  if (!automation) {
    return c.json({ error: `no deploy target for ${row.harness}` }, 400);
  }
  if (!row.slack_app_id) {
    return c.json({ error: "create the Slack app and finish OAuth before deploying" }, 400);
  }

  db.prepare("UPDATE agents SET status = ?, tfy_deploy_status = ?, last_error = NULL, updated_at = ? WHERE id = ?").run(
    "deploying",
    "started",
    now(),
    agentId
  );

  try {
    for (const target of automation.deploy_targets) {
      await runMake(target, {
        [automation.slack_app_name_variable]: row.slack_app_name
      });
    }
    db.prepare("UPDATE agents SET status = ?, tfy_deploy_status = ?, last_error = NULL, updated_at = ? WHERE id = ?").run(
      "running",
      "submitted",
      now(),
      agentId
    );
  } catch (error) {
    const message = makeError(error);
    db.prepare("UPDATE agents SET status = ?, tfy_deploy_status = ?, last_error = ?, updated_at = ? WHERE id = ?").run(
      "failed",
      "failed",
      message,
      now(),
      agentId
    );
    return c.json({ error: message }, 500);
  }

  const updated = getAgent(agentId) as AgentRecord;
  return c.json({ data: toAgentResponse(updated) });
});

app.post("/api/agents", async (c) => {
  const body = await c.req.json<{
    name: string;
    harness: string;
    llm_model: string;
    memory_scope?: string[];
    mcp_servers?: string[];
    agent_skills?: string[];
    sandbox?: { name: string; key: string };
  }>();

  const supportedHarnesses = new Set(harnesses.map((harness) => harness.name));
  if (!body.name || !body.harness || !body.llm_model) {
    return c.json({ error: "name, harness, and llm_model are required" }, 400);
  }
  if (!supportedHarnesses.has(body.harness)) {
    return c.json({ error: `unsupported harness: ${body.harness}` }, 400);
  }
  if (body.sandbox && body.sandbox.name !== "daytona") {
    return c.json({ error: "only daytona sandbox is supported" }, 400);
  }

  const slackAppName = body.name;
  const existingAgent = db
    .prepare("SELECT id, name FROM agents WHERE lower(slack_app_name) = lower(?) LIMIT 1")
    .get(slackAppName) as { id: string; name: string } | undefined;
  if (existingAgent) {
    return c.json({ error: `bot name already exists: ${slackAppName}` }, 409);
  }

  const memoryScope = body.memory_scope?.length ? body.memory_scope : ["personal", "organization"];
  const mcpServers = body.mcp_servers ?? [];
  const agentSkills = body.agent_skills ?? [];
  const generatedYaml = generateYaml({
    name: body.name,
    harness: body.harness,
    truefoundry_connection: localRuntime.truefoundry_connection,
    llm_model: body.llm_model,
    slack_app_name: slackAppName,
    memory_scope: memoryScope,
    mcp_servers: mcpServers,
    agent_skills: agentSkills,
    sandbox: body.sandbox
  });

  const record = {
    id: id("agent"),
    name: body.name,
    harness: body.harness,
    truefoundry_connection: localRuntime.truefoundry_connection,
    llm_model: body.llm_model,
    slack_app_name: slackAppName,
    channel_id: null,
    memory_scope: JSON.stringify(memoryScope),
    mcp_servers: JSON.stringify(mcpServers),
    agent_skills: JSON.stringify(agentSkills),
    sandbox: body.sandbox ? JSON.stringify({ name: body.sandbox.name }) : null,
    status: "configured",
    slack_app_id: null,
    slack_oauth_url: null,
    slack_team_domain: null,
    slack_signing_secret_hint: null,
    last_error: null,
    tfy_deploy_status: null,
    generated_yaml: generatedYaml,
    created_at: now(),
    updated_at: now()
  };

  db.prepare(`
    INSERT INTO agents (
      id, name, harness, truefoundry_connection, llm_model, slack_app_name, channel_id,
      memory_scope, mcp_servers, agent_skills, sandbox, status, slack_app_id, slack_oauth_url,
      slack_team_domain, slack_signing_secret_hint, last_error, tfy_deploy_status,
      generated_yaml, created_at, updated_at
    ) VALUES (
      @id, @name, @harness, @truefoundry_connection, @llm_model, @slack_app_name, @channel_id,
      @memory_scope, @mcp_servers, @agent_skills, @sandbox, @status, @slack_app_id, @slack_oauth_url,
      @slack_team_domain, @slack_signing_secret_hint, @last_error, @tfy_deploy_status,
      @generated_yaml, @created_at, @updated_at
    )
  `).run(record);

  return c.json({
    data: toAgentResponse({
      ...record,
      memory_scope: record.memory_scope,
      mcp_servers: record.mcp_servers,
      agent_skills: record.agent_skills,
      sandbox: record.sandbox
    })
  });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Harness Deploy API listening on http://127.0.0.1:${port}`);
});
