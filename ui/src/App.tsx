import { Check, Copy, ExternalLink, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Catalog = {
  harnesses: Array<{ name: string; label: string; detail: string }>;
  models: string[];
  mcp_servers: Array<{ fqn: string; name: string; status: string }>;
  agent_skills: Array<{ fqn: string; name: string; repo: string }>;
};

type Runtime = {
  truefoundry_connection: string;
  has_daytona_key: boolean;
  has_slack_app_config_token: boolean;
};

type Agent = {
  id: string;
  name: string;
  harness: string;
  truefoundry_connection: string;
  llm_model: string;
  slack_app_name: string;
  channel_id: string | null;
  memory_scope: string[];
  mcp_servers: string[];
  agent_skills: string[];
  status: string;
  generated_yaml: string;
  created_at: string;
  updated_at: string;
  deployment_url: string | null;
  slack_app_created: boolean;
  slack_app_id: string | null;
  slack_oauth_url: string | null;
  slack_team_domain: string | null;
  slack_signing_secret_hint: string | null;
  last_error: string | null;
  tfy_deploy_status: string | null;
  sandbox: { name: string } | null;
};

const defaultCatalog: Catalog = {
  harnesses: [],
  models: [],
  mcp_servers: [],
  agent_skills: []
};

const defaultRuntime: Runtime = {
  truefoundry_connection: "local-truefoundry",
  has_daytona_key: false,
  has_slack_app_config_token: false
};

const defaultAgentName = `agent_${Date.now()}`;

const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
};

function buildYaml(input: {
  name: string;
  harness: string;
  connection: string;
  model: string;
  mcpServers: string[];
  agentSkills: string[];
  useSandbox: boolean;
}) {
  const lines = [
    `name: ${input.name || "agent"}`,
    `harness: ${input.harness || "codex"}`,
    "",
    "truefoundry:",
    `  connection: ${input.connection}`,
    "",
    "llm:",
    `  model: ${input.model || "openai-main/gpt-4o-mini"}`
  ];

  if (input.useSandbox) {
    lines.push("", "sandbox:", "  name: daytona", "  key: ${daytona_api_key}");
  }

  if (input.mcpServers.length) {
    lines.push("", "mcp_servers:", ...input.mcpServers.map((fqn) => `  - fqn: ${fqn}`));
  }

  if (input.agentSkills.length) {
    lines.push("", "agent_skills:", ...input.agentSkills.map((fqn) => `  - fqn: ${fqn}`));
  }

  lines.push("", "memory:", "  scope:", "    - personal", "    - organization");
  lines.push("", "channels:", "  - name: slack", `    app_name: ${input.name || "agent"}`);
  return `${lines.join("\n")}\n`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ChipSelect({
  items,
  selected,
  onChange,
  getLabel
}: {
  items: string[];
  selected: string[];
  onChange: (items: string[]) => void;
  getLabel: (item: string) => string;
}) {
  return (
    <div className="chips">
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <button
            className={active ? "chip active" : "chip"}
            key={item}
            onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])}
            type="button"
          >
            {getLabel(item)}
            {active ? <Check size={13} /> : <Plus size={13} />}
          </button>
        );
      })}
    </div>
  );
}

function statusClass(status: string) {
  if (status === "stopped" || status === "failed") return "stopped";
  if (status === "slack_oauth_pending" || status === "deploying") return "pending";
  return "ready";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog>(defaultCatalog);
  const [runtime, setRuntime] = useState<Runtime>(defaultRuntime);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState(defaultAgentName);
  const [harness, setHarness] = useState("codex");
  const [model, setModel] = useState("");
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [agentSkills, setAgentSkills] = useState<string[]>([]);
  const [useSandbox, setUseSandbox] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAgents, setShowAgents] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");

  async function refresh() {
    const [catalogResponse, runtimeResponse, agentResponse] = await Promise.all([
      api.get<Catalog>("/api/catalog"),
      api.get<Runtime>("/api/runtime"),
      api.get<{ data: Agent[] }>("/api/agents")
    ]);
    setCatalog(catalogResponse);
    setRuntime(runtimeResponse);
    setAgents(agentResponse.data);
    if (!model) setModel(catalogResponse.models[0] ?? "");
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  const normalizedSlackAppName = name.trim().toLowerCase();
  const duplicateSlackApp = agents.find((agent) => agent.slack_app_name.trim().toLowerCase() === normalizedSlackAppName);
  const generatedYaml = useMemo(
    () =>
      buildYaml({
        name,
        harness,
        connection: runtime.truefoundry_connection,
        model,
        mcpServers,
        agentSkills,
        useSandbox
      }),
    [agentSkills, harness, mcpServers, model, name, runtime.truefoundry_connection, useSandbox]
  );

  async function deployAgent() {
    setSaving(true);
    setError("");
    try {
      await api.post("/api/agents", {
        name,
        harness,
        llm_model: model,
        memory_scope: ["personal", "organization"],
        mcp_servers: mcpServers,
        agent_skills: agentSkills,
        sandbox: useSandbox ? { name: "daytona", key: "${daytona_api_key}" } : undefined
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy agent");
    } finally {
      setSaving(false);
    }
  }

  async function createSlackBot(agentId: string) {
    setSaving(true);
    setError("");
    try {
      await api.post(`/api/agents/${agentId}/slack-app`, {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Slack bot");
    } finally {
      setSaving(false);
    }
  }

  async function deployToTrueFoundry(agentId: string) {
    setSaving(true);
    setError("");
    try {
      await api.post(`/api/agents/${agentId}/deploy`, {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy to TrueFoundry");
    } finally {
      setSaving(false);
    }
  }

  async function setAgentStatus(agentId: string, status: "running" | "stopped") {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/api/agents/${agentId}/status`, { status });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent status");
    } finally {
      setSaving(false);
    }
  }

  const canDeploy = Boolean(name && harness && model && !duplicateSlackApp);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>Harness Deploy</h1>
          <p>System deployment status from local environment.</p>
        </div>
        <div className="connection">
          <span className="connection-item ready-dot">{runtime.truefoundry_connection}</span>
          <span className="connection-item">{runtime.has_daytona_key ? "Daytona active" : "No Daytona key"}</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {duplicateSlackApp ? <div className="error">Bot name already exists. Choose another name.</div> : null}

      <section className="section">
        <div className="section-head">
          <h2>New Slack Agent</h2>
          <button className="primary" disabled={!canDeploy || saving} onClick={deployAgent} type="button">
            Deploy Harness
          </button>
        </div>

        <div className="form-grid">
          <Field label="agent name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="harness">
            <select value={harness} onChange={(event) => setHarness(event.target.value)}>
              {catalog.harnesses.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="model">
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {catalog.models.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="pickers">
          <div>
            <div className="label">mcp servers</div>
            <ChipSelect
              getLabel={(fqn) => catalog.mcp_servers.find((item) => item.fqn === fqn)?.name ?? fqn}
              items={catalog.mcp_servers.map((item) => item.fqn)}
              onChange={setMcpServers}
              selected={mcpServers}
            />
          </div>
          <div>
            <div className="label">agent skills</div>
            <ChipSelect
              getLabel={(fqn) => catalog.agent_skills.find((item) => item.fqn === fqn)?.name ?? fqn}
              items={catalog.agent_skills.map((item) => item.fqn)}
              onChange={setAgentSkills}
              selected={agentSkills}
            />
          </div>
        </div>

        <div className="footer-row">
          <label className="check">
            <input checked={useSandbox} disabled={!runtime.has_daytona_key} onChange={(event) => setUseSandbox(event.target.checked)} type="checkbox" />
            Daytona sandbox
          </label>
          <div className="memory">Slack app name = agent name. Memory: personal + organization.</div>
        </div>

        <details className="yaml">
          <summary>View Generated Manifest</summary>
          <button className="copy" onClick={() => navigator.clipboard.writeText(generatedYaml)} type="button">
            <Copy size={14} />
            Copy
          </button>
          <pre>{generatedYaml}</pre>
        </details>
      </section>

      <section className="section">
        <button className="secondary agents-toggle" onClick={() => setShowAgents((value) => !value)} type="button">
          {showAgents ? "Hide deployments" : `Active Deployments (${agents.length})`}
        </button>
        {showAgents ? (
          agents.length === 0 ? (
            <div className="empty">No agents yet.</div>
          ) : (
            <div className="table">
              {agents.map((agent) => (
                <button className="row" key={agent.id} onClick={() => setSelectedAgentId(agent.id)} type="button">
                  <div className="agent-name">
                    <strong>{agent.name}</strong>
                    <span>{agent.slack_app_name}</span>
                  </div>
                  <span>{agent.harness}</span>
                  <span>{agent.llm_model}</span>
                  <span className={statusClass(agent.status)}>{statusLabel(agent.status)}</span>
                </button>
              ))}
            </div>
          )
        ) : null}
      </section>

      {selectedAgent ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-modal="true" className="modal" role="dialog">
            <div className="modal-head">
              <div>
                <h2>{selectedAgent.name}</h2>
                <p>HARNESS: {selectedAgent.harness.toUpperCase()}</p>
              </div>
              <button className="icon" onClick={() => setSelectedAgentId("")} type="button">
                <X size={17} />
              </button>
            </div>

            <div className="details-grid">
              <div>
                <span>runtime status</span>
                <strong>{statusLabel(selectedAgent.status)}</strong>
              </div>
              <div>
                <span>slack identity</span>
                <strong>{selectedAgent.slack_app_created ? selectedAgent.slack_app_id : "not created yet"}</strong>
              </div>
              <div>
                <span>tfy workspace</span>
                <strong>{selectedAgent.truefoundry_connection}</strong>
              </div>
              <div>
                <span>model</span>
                <strong>{selectedAgent.llm_model}</strong>
              </div>
              <div>
                <span>mcp</span>
                <strong>{selectedAgent.mcp_servers.length || "none"}</strong>
              </div>
              <div>
                <span>skills</span>
                <strong>{selectedAgent.agent_skills.length || "none"}</strong>
              </div>
            </div>

            <div className="detail-block">
              <span>TrueFoundry Link</span>
              {selectedAgent.deployment_url ? (
                <a href={selectedAgent.deployment_url} rel="noreferrer" target="_blank">
                  {selectedAgent.deployment_url}
                  <ExternalLink size={13} />
                </a>
              ) : (
                <strong>not available</strong>
              )}
            </div>

            <div className="detail-block">
              <span>Slack Integration</span>
              {selectedAgent.slack_oauth_url ? (
                <a href={selectedAgent.slack_oauth_url} rel="noreferrer" target="_blank">
                  Open OAuth URL
                  <ExternalLink size={13} />
                </a>
              ) : (
                <strong>Create the Slack bot first.</strong>
              )}
              {selectedAgent.slack_oauth_url ? <small>Install it in Slack, then deploy the TrueFoundry services.</small> : null}
            </div>

            {selectedAgent.last_error ? (
              <div className="detail-block error-block">
                <span>Last error</span>
                <pre>{selectedAgent.last_error}</pre>
              </div>
            ) : null}

            <div className="detail-block">
              <span>Deploy State</span>
              <strong>{selectedAgent.tfy_deploy_status ?? "not submitted"}</strong>
            </div>

            <div className="modal-actions">
              <button className="primary" disabled={saving || selectedAgent.slack_app_created} onClick={() => createSlackBot(selectedAgent.id)} type="button">
                Create Slack bot
              </button>
              <button
                className="secondary"
                disabled={saving || !selectedAgent.slack_oauth_url}
                onClick={() => deployToTrueFoundry(selectedAgent.id)}
                type="button"
              >
                Deploy to TrueFoundry
              </button>
              <button className="secondary" disabled={saving} onClick={() => setAgentStatus(selectedAgent.id, "running")} type="button">
                Start
              </button>
              <button className="secondary danger" disabled={saving} onClick={() => setAgentStatus(selectedAgent.id, "stopped")} type="button">
                Stop
              </button>
            </div>

            <details className="yaml" open>
              <summary>Deployment YAML</summary>
              <button className="copy" onClick={() => navigator.clipboard.writeText(selectedAgent.generated_yaml)} type="button">
                <Copy size={14} />
                Copy
              </button>
              <pre>{selectedAgent.generated_yaml}</pre>
            </details>
          </section>
        </div>
      ) : null}
    </main>
  );
}
