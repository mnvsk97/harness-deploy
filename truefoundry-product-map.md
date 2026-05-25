# TrueFoundry Product Map

Working notes from a docs-grounded pass over the TrueFoundry Platform, AI Engineering, AI Gateway, and API reference docs.

## Source Set

- `https://www.truefoundry.com/docs/platform/overview`
- `https://www.truefoundry.com/docs/create-and-setup-your-account`
- `https://www.truefoundry.com/docs/llms.txt`
- Selected Platform / AI Engineering docs fetched from `llms.txt`
- Selected API reference entries from `llms.txt`

Current docs index size observed: 610 raw index lines. A permissive markdown-link parser extracted 591 structured doc links. A second pass over the `.md` API reference entries extracted 191 API reference entries across 35 groups.

Current crawl evidence from the docs index:

| Scope | Pages fetched | Fetch failures |
| --- | ---: | ---: |
| Platform plus account setup | 27 | 0 |
| Inferred AI Engineering/deploy docs | 153 | 0 |
| API Reference links | 191 | 0 |

The AI Engineering docs do not live under a single `/ai-engineering/` path in `llms.txt`. They are the root-level deploy docs plus related deploy subtrees such as `model-deployment/`, `infrastructure/`, and `mcp-server-deployment/`, after excluding `platform/`, `ai-gateway/`, `api-reference/`, changelog, and change-announcement pages.

## Coverage Status

This pass is complete enough to make product and project-shape decisions for `harness-deploy`:

- top-level Platform shape understood
- AI Engineering deploy primitives mapped
- AI Gateway agent/MCP/model/prompt surfaces mapped
- `tfy apply` and Apply API manifest surfaces mapped
- API reference groups inventoried and classified
- harness-deploy MVP direction captured

This is not yet a replacement for page-by-page implementation work when building a specific harness manifest. For each concrete harness, the next pass should read the exact pages for the selected primitive:

- Service pages for HTTP agents and MCP servers
- Job pages for one-shot/eval/batch harnesses
- Async Service pages for queue-backed inference/agent loops
- Workflow pages for DAG/pipeline harnesses
- Volume and Secrets pages for stateful harnesses
- MCP Gateway and Agent/Skill pages for control-plane registration
- Logs/Application State/Resources pages for smoke-test automation

The practical reading model should be:

```text
Product map first -> choose primitive -> read primitive docs deeply -> write manifest -> dry-run -> deploy -> smoke test -> record compatibility.
```

## Top-Level Product Shape

TrueFoundry is a cloud-agnostic platform for building, deploying, monitoring, and governing AI applications. The docs split the product into two modular top-level modules:

- AI Engineering
- AI Gateway

The platform overview explicitly says components are modular, so a customer can use only the AI Gateway module, only the AI Engineering module, or both.

## Account And Tenant Setup

The account setup flow is:

- Register from the TrueFoundry signup page.
- Provide company name, work email, username, and password.
- Company name creates the tenant access URL, for example `chat-io.truefoundry.cloud`.
- Activate the account from email before login.

This matters for manifest-based deploy artifacts because every deploy example must assume the user already has:

- tenant URL / `TFY_HOST`
- authenticated user or service identity
- workspace access
- connected compute plane if deploying workloads

## Platform Architecture

From the platform overview and install/deploy index, the main platform-level concepts are:

- Control plane
- Compute plane
- Gateway plane
- Data plane
- TFY agent connecting compute clusters to the control plane
- Workspaces
- Clusters
- Integration providers
- Identity and access management
- Audit logs
- Secret stores
- GitOps
- CI/CD

Important framing:

- TrueFoundry does not provide compute by default.
- Users bring their own cloud account or on-prem hardware.
- TrueFoundry connects to that infrastructure and deploys models, agents, workflows, services, jobs, notebooks, and related assets there.
- Models and artifacts are stored in the customer's own storage.

### Split-Plane Architecture

TrueFoundry is described as a split-plane architecture:

- Global authentication/licensing server
- Global analytics server
- Control plane
- Compute plane
- Gateway plane
- Data plane

The control plane is the orchestration and configuration layer. The compute, gateway, and data planes are the execution/data layers.

### Global Authentication And Analytics

The docs state that the global authentication/licensing server is hosted by TrueFoundry and cannot be shipped into customer infrastructure. It authenticates control-plane users and supports licensing. The docs say the control plane passes user emails to this global auth server.

The global analytics server collects platform usage metrics such as:

- number of connected clusters
- cluster add-ons and versions
- control-plane version
- number of requests flowing through Gateway

### Control Plane

The control plane is where users manage deployments, resources, models, services, jobs, workflows, and gateway configuration.

Control-plane components observed:

- UI
- backend microservices
- PostgreSQL
- blob storage
- NATS queue/cache
- OTEL collector
- ingestor
- controller
- image builder
- workflows microservice
- Spark history server

The docs distinguish which components are needed for AI Deployment vs AI Gateway. For example, image builder, controller, workflows microservice, and Spark history server are AI Deployment-specific; OTEL collector and ingestor are AI Gateway-specific.

External integrations connected to the control plane include:

- Docker registries: ECR, GCP Artifact Registry, ACR, Docker Hub, Quay, JFrog, self-hosted registries
- Blob storage: S3, GCS, Azure Storage, MinIO
- external secret managers
- authentication/SSO systems
- notifications: Slack, email, webhooks
- Git repository integrations

### Compute Plane

The compute plane is one or more Kubernetes clusters in the customer's environment. The docs explicitly list EKS, GKE, AKS, OpenShift, Oracle Kubernetes Engine, and standard on-prem Kubernetes as possible compute planes.

The compute plane hosts:

- TrueFoundry infrastructure add-ons
- user services
- jobs
- model deployments
- pipelines/workflows
- notebooks/SSH servers

The `tfy-agent` runs on the compute plane and connects to the control plane over a secure WebSocket. It receives deployment instructions and sends realtime Kubernetes resource updates back to the control plane.

Compute-plane add-ons observed:

- ArgoCD: essential, used to deploy applications to the compute-plane cluster
- Prometheus: essential, used for metrics, autoscaling, autoshutdown, and autopilot
- TFY Agent: essential, connects cluster to control plane
- Istio: optional, used for ingress/service mesh, request-count autoscaling, notebook OAuth auth, intercepts, and endpoint authentication
- Argo Rollouts: optional, powers canary and blue-green rollouts
- Argo Workflows: optional, powers Jobs
- Flyte data plane components: required for workflows
- GPU operator: optional for GPU workloads
- Spark-related components: optional for Spark jobs

For a manifest catalog, this means some manifests can assume only core service/job primitives, while advanced features like endpoint auth, request-count autoscaling, canary rollout, jobs, workflows, and GPU behavior depend on compute-plane add-ons.

### Gateway Plane

Gateway plane is one or more deployments of the TrueFoundry AI Gateway.

Key architecture points:

- Gateway is in the critical path of production model/MCP traffic.
- It is designed to be stateless and horizontally scalable.
- Request-path checks for authentication, authorization, rate limits, budget limits, and load balancing are in memory.
- Logs and metrics are written to a queue asynchronously.
- Gateway subscribes to control-plane configuration through NATS.
- If NATS is unavailable, Gateway can fetch configuration from the control-plane backend via HTTP at startup.
- Gateway can continue serving with already-fetched configuration if the control plane is down.

Gateway request flow:

- client sends request with a valid token and a supported API format
- gateway authenticates and authorizes
- gateway checks rate and budget rules
- gateway chooses target based on routing/load-balancing rules
- adapter translates request for the target provider
- gateway forwards response, or retries/falls back when configured
- request/response data is queued for logging and metrics
- aggregation service computes rate, latency, and budget metrics and republishes them for gateway pods

### Data Plane

The data plane stores models and artifacts for AI Engineering. Customers can bring their own blob storage or use a managed option when available.

### Installation / Deployment Modes

Docs describe several platform deployment modes:

- hosted/managed control plane with customer-attached compute/data plane
- self-hosted control plane in customer VPC for enterprise
- managed globally distributed gateway plane
- self-hosted gateway plane
- full control plane + gateway plane deployment
- compute plane deployment in AWS, Azure, GCP, generic Kubernetes, OpenShift, and on-prem setups

For harness deploy, this means the manifests should not assume a specific cloud. They should target TrueFoundry workspace/application specs and leave compute-plane provisioning out of scope.

### Helm, Kubernetes Manifests, And Kustomize

TrueFoundry can deploy Helm charts directly from:

- public/private Helm repositories
- OCI registries
- Git repositories

Helm deployment supports:

- values overrides
- Kustomize patches
- additional manifests
- secrets management
- validation for cluster-scoped objects
- pause/resume

TrueFoundry can also deploy raw Kubernetes manifests from the UI for cases where the higher-level application abstraction is not enough.

Kustomize support lets users:

- patch rendered Kubernetes resources from a TrueFoundry application
- add extra Kubernetes resources such as ConfigMaps, Secrets, or VirtualServices

Kustomize cannot create cluster-scoped resources unless the user has cluster-admin privileges.

This is a fallback path for complex third-party agent harnesses that need sidecars, extra ConfigMaps, custom annotations, or extra K8s resources beyond the standard service spec.

### GitOps And CI/CD

TrueFoundry supports keeping deployment YAML in Git and deploying through `tfy apply`.

CI/CD concepts observed:

- TrueFoundry can generate CI/CD configuration
- supports GitHub Actions, GitLab CI/CD, Bitbucket, Jenkins
- TrueFoundry can build Docker images on its infrastructure
- recommended mode is to keep YAML specs in Git for full configuration versioning
- if YAML is kept in Git, UI config changes can be overwritten by the next deployment

This reinforces that a manifest catalog is a native TrueFoundry workflow, not a workaround.

## AI Engineering Components

The inferred AI Engineering/deploy corpus from `llms.txt` grouped into:

| Area | Pages |
| --- | ---: |
| Services | 36 |
| Infrastructure / integrations | 30 |
| Models / LLMs | 20 |
| Workflows | 18 |
| Jobs | 15 |
| Volumes / storage / secrets | 7 |
| CLI / SDK / APIs | 3 |
| Notebooks / SSH / RStudio | 2 |
| Monitoring / alerts / cost | 2 |
| Other deploy-adjacent concepts | 20 |

The "Other" bucket includes cross-cutting concepts such as deployment guardrails and policies, concurrency limits, queue configuration, resources, GitOps, sticky routing, ML Repo, artifacts, intercepts, and account setup.

## Deploy Product Component Inventory

This is the concrete deploy-product inventory derived from the Platform, AI Engineering, and Apply/API docs.

### Runtime Workload Types

TrueFoundry can represent and operate these workload/runtime types:

- Service: long-running HTTP/gRPC/web app/API process
- Job: finite task that runs and exits
- SparkJob: Spark job workload
- AsyncService: queue-backed processing service
- Workflow: Flyte-based DAG/pipeline
- Notebook: Jupyter environment
- RStudio: RStudio environment
- SSHServer: remote development/debug environment
- Helm: Helm chart deployment
- raw Kubernetes manifest deployment through advanced UI flow
- model deployment generated from model/catalogue specs

### Supporting Resource Types

Supporting resources visible in the docs/API:

- Workspace
- Cluster
- ApplicationSet
- Volume
- SecretGroup
- ProviderAccounts
- VirtualAccount
- Team
- Role
- RoleBinding
- Policy
- AlertConfig
- Environment
- TracingProject
- GatewayConfig
- MCPServer
- Agent
- AgentSkill
- Prompt
- MLRepo
- Artifact
- Model

### Build And Source Types

Observed source/build patterns:

- Git repository source
- local source upload
- prebuilt container image
- Dockerfile / Python buildpack style service builds
- Helm repository source
- OCI Helm chart source
- Git-backed Helm chart source
- Kustomize patches and additional manifests
- model/catalogue generated deployment specs

### Operational Controls

TrueFoundry deploy surfaces include:

- replicas
- resources: CPU, memory, ephemeral storage, GPU, shared memory
- instance families / node pools
- spot/on-demand capacity choices where configured
- environment variables
- secret references
- service accounts
- file mounts
- secret mounts
- volume mounts
- ports and protocols
- internal cluster DNS
- public endpoints/domains
- endpoint authentication
- liveness probes
- readiness probes
- autoscaling
- scale-to-zero
- rollout strategy: rolling, canary, blue-green
- pause/resume
- redeploy
- rollback/promote/update
- manual job trigger
- scheduled job trigger
- retries/timeouts
- concurrency limits
- alerts
- logs
- metrics
- Kubernetes events
- ArgoCD resource status

### Platform Dependencies

Features depend on installed control/compute-plane components:

- ArgoCD for application deployment
- Prometheus for metrics/autoscaling/autoshutdown
- TFY Agent for secure control-plane connection
- Istio for exposed endpoints, service auth, request-count autoscaling, notebook auth, and traffic intercepts
- Argo Rollouts for canary and blue-green rollout
- Argo Workflows for jobs
- Flyte data plane for workflows
- GPU operator for GPU workloads
- external Docker registry integration for images/builds
- blob storage for code uploads, model/artifact storage, and gateway logs/traces
- secret manager for secrets
- Git integration for repository deploy and CI/CD

### Primary Manifest/Automation Surfaces

- UI-generated YAML
- `tfy apply -f <manifest.yaml>`
- `tfy apply --dir <manifest-dir>`
- `tfy apply --dry-run --show-diff`
- `tfy deploy -f <manifest.yaml>` for local source deployment paths where needed
- Python SDK
- REST API
- GitOps with YAML in Git
- generated CI/CD workflows

### Harness Mapping Rules

For third-party agent harness experiments, the useful mapping is:

| Harness need | TrueFoundry surface |
| --- | --- |
| HTTP agent/API | Service |
| Bot/background loop | Service, usually no public port |
| One-shot agent task/eval | Job |
| Long-running queued task | AsyncService |
| Multi-step evaluation or training pipeline | Workflow |
| Local dev/debug environment | Notebook or SSHServer |
| Stateful file home/cache | Volume |
| Static run/model artifacts | Artifact / MLRepo |
| Provider/channel credentials | SecretGroup + secret FQNs |
| Production app identity | VirtualAccount |
| Tool server | Service + MCPServer registration |
| Existing Helm-packaged control plane | Helm |
| Odd Kubernetes resources | Kustomize or raw Kubernetes manifest |
| Gateway-routed model access | GatewayConfig / ProviderAccounts / Virtual Models |
| Native TrueFoundry agent representation | AgentManifest |
| Reusable operating instructions | AgentSkill |

### Service Deployment

Services are long-running workloads for REST, gRPC, Streamlit, Gradio, Flask, FastAPI, and generic HTTP applications.

Relevant service configuration surfaces:

- image or build source
- command
- resources
- replicas
- environment variables
- ports
- exposed endpoints
- endpoint auth
- liveness probe
- readiness probe
- service account
- file mounts
- volume mounts
- rollout strategy
- logs, metrics, and events
- CI/CD
- update, rollback, promote

Service deploy sources:

- GitHub repository
- local machine
- prebuilt image

The docs recommend using the UI to deploy once, then copying generated YAML or Python for programmatic deployment. This is directly relevant to a manifest catalog because TrueFoundry already treats YAML as a first-class deploy artifact.

### Ports, Domains, And Endpoint Auth

Service ports define:

- port number
- protocol, commonly HTTP or gRPC
- whether the port is exposed externally
- endpoint host/path
- authentication strategy

If a port is not exposed, it is reachable inside the cluster at:

```text
servicename-workspacename.svc.cluster.local:port
```

Cluster domains are configured at the cluster level. Wildcard domains allow each service to get a subdomain; non-wildcard domains route services by path. Endpoint collisions are rejected.

Endpoint authentication options include:

- username/password
- JWT via external identity providers such as Cognito, Google, Okta, or Microsoft Entra ID
- Login with TrueFoundry

### Jobs

Jobs are finite-duration workloads that run, complete, and release resources.

Good fits:

- model training
- maintenance and cleanup
- batch inference
- scheduled work
- Spark jobs

Job configuration surfaces include:

- build source / image
- resources
- env vars and secrets
- schedule trigger
- manual trigger
- parameters
- retries and timeout
- concurrency
- cloud service access
- volume mounts
- logs and metrics
- alerts
- clone/update/rollback/promote

Jobs can also be represented as YAML copied from the UI and applied with `tfy apply`.

### Async Services

Async services process messages from queues and optionally write results to output queues.

Good fits:

- large payloads
- long-running request processing
- scale-to-zero workloads
- traffic bursts where queue durability is needed

Supported queue patterns mentioned:

- AWS SQS
- NATS
- Kafka
- Google AMQP

Execution styles:

- Python async service library
- sidecar that consumes queue messages and calls the user's HTTP service

The sidecar pattern is important for agents: many agent harnesses can stay as normal HTTP services while TrueFoundry's async sidecar handles queue ingestion.

### Workflows

Workflows are Flyte-based DAGs for orchestrating data and ML pipelines.

Capabilities:

- task orchestration
- DAG execution
- scheduled workflows
- Python `@workflow` and `@task` decorators
- raw container tasks
- Spark tasks
- Databricks tasks
- Snowflake tasks
- map tasks
- conditional tasks
- failure handling
- retries
- alerts
- local workflow runs

This is probably not the first target for agent harness manifests, but it matters for evaluation pipelines, batch agent jobs, and scheduled retraining or regression checks.

### Notebooks And SSH

TrueFoundry supports Jupyter notebooks and SSH servers on Kubernetes-backed compute.

Notebook capabilities:

- CPU/GPU notebooks
- persistent home storage
- auto shutdown on inactivity
- custom images / build scripts
- storage sizing
- data access from S3 and other cloud stores

This is more of a development/debug surface than a production agent deploy surface.

### Model Registry, ML Repos, And Artifacts

The Model Registry stores and versions models inside ML repos backed by customer storage such as S3, GCS, Azure Blob, or Minio.

Observed concepts:

- ML repos
- model versions
- artifact versions
- tags
- model metadata
- framework-specific logging
- generic file/folder logging
- signed URLs for artifact upload/download
- list files in artifact versions

For agent harnesses, this matters for:

- storing model artifacts
- storing eval outputs
- storing snapshots of agent state
- sharing static assets

It is not the same as live mutable agent state. Live writable state should usually be a mounted volume or external database.

### Volumes

Volumes provide persistent file-system storage to containers.

Good fits:

- shared datasets
- model cache
- checkpoints
- low-latency file access
- file-system semantics

Docs warn against writing to the same path from multiple pods because it can cause data corruption. That is very relevant for stateful agents: single replica is the safe default unless the state model is proven multi-writer safe.

Volumes can be mounted to services and jobs. For services, the docs also cover mounting:

- volumes
- string config files
- secrets as files

### Secrets

TrueFoundry secret management stores secret values in the customer's configured secret manager, not inside TrueFoundry itself.

Supported secret manager direction includes:

- AWS SSM
- GCP Secret Manager
- HashiCorp Vault
- Azure Key Vault
- generic HTTP secret server

Secrets are grouped into secret groups with RBAC:

- Secret Group Admin
- Secret Group Editor
- Secret Group Viewer

Secret FQNs can be used in:

- deployment environment variables
- deployment volume mounts
- integration configuration
- AI Gateway model provider integrations
- YAML / GitOps

This is one of the key reasons manifest-first harness deploy can work cleanly: manifests should reference secret FQNs, not inline credentials.

### Monitoring, Logs, Metrics, Events

For services, TrueFoundry exposes:

- deployment-level logs
- pod-level logs
- deployment-level metrics
- pod-level metrics
- Kubernetes events
- Grafana dashboard export
- integration with external monitoring/logging tools

For API automation, the API reference includes log download and log fetch endpoints for workloads including services, jobs, workflows, job runs, and pods.

### Declarative Apply

`tfy apply` is the first-class declarative path for resource YAML.

Observed capabilities:

- apply a manifest file
- dry-run
- show diff
- apply a directory of manifests
- API reference endpoint for applying resources
- dependency tree resolution
- delete resources from manifests

This is the core reason a harness-deploy project can be a manifest catalog rather than a CLI.

The Apply API confirms that the manifest surface is broad. Parsed manifest types accepted by the `PUT /api/svc/v1/apply` schema include:

- `MLRepoManifest`
- `ArtifactManifest`
- `ModelManifest`
- `ChatPromptManifest`
- `Service`
- `ApplicationSet`
- `ProviderAccounts`
- `ClusterManifest`
- `WorkspaceManifest`
- `Job`
- `Helm`
- `Volume`
- `Notebook`
- `RStudio`
- `Workflow`
- `AsyncService`
- `SSHServer`
- `SparkJob`
- `GatewayConfig`
- `TeamManifest`
- `PolicyManifest`
- `RoleManifest`
- `AlertConfig`
- `VirtualAccountManifest`
- `CommonToolsSettings`
- `AIFeaturesSettings`
- `SecretGroupManifest`
- `AgentManifest`
- `EnvironmentManifest`
- `TracingProjectManifest`
- `MCPServerManifest`
- `RoleBindingManifest`

This matters a lot: a harness catalog can include not only application manifests, but also prerequisite manifests for virtual accounts, secret groups, MCP servers, prompts, skills, volumes, and agents when those are useful.

## AI Gateway Components

AI Gateway is the proxy/control layer between applications and LLM providers, AI model providers, MCP servers, custom HTTP endpoints, and agents. It centralizes authentication, access control, routing, observability, governance, and cost controls.

### LLM Gateway

The LLM Gateway gives applications a unified API for 1000+ LLMs across providers.

Capabilities observed:

- OpenAI-compatible Chat Completions API
- OpenAI Responses API for OpenAI/Azure OpenAI style providers
- Anthropic Messages API for Claude models
- embeddings
- rerank
- moderation
- image generation/edit/variation
- audio transcription/translation/text-to-speech
- files
- fine-tuning
- batch API
- proxy API
- native SDK support

Provider/account model:

- A provider account represents one account with a model provider such as OpenAI, Anthropic, AWS Bedrock, Azure OpenAI, Vertex, etc.
- Multiple provider accounts can exist for the same provider.
- Each provider account can expose multiple models.
- Gateway callers use a TrueFoundry token rather than original provider keys.

Authentication:

- PATs are for developers/local development.
- VATs are for production applications, CI/CD, and shared services.
- Applications call Gateway with a Bearer token.

### Virtual Models

Virtual models give applications one stable model name backed by multiple concrete target models.

Routing strategies:

- weight-based routing
- priority-based routing
- latency-based routing

Extra routing features observed:

- failover
- retries
- health-aware routing
- sticky routing for sessions in weight-based routing
- SLA cutoff

For agent harnesses, virtual models are the clean way to avoid hardcoding direct providers in each manifest. A harness manifest can use one `MODEL_NAME`, while platform teams manage the real routing behind it.

### Access Control

Gateway model access is configured at provider-account level.

Roles observed:

- Provider Account Manager: can modify account settings, add/remove models, and manage access.
- Provider Account User: can use models but not modify settings.

Tenant admins have broad model access by default.

### Guardrails

Guardrails sit in the request path for LLM requests and MCP tool calls.

Guardrail scopes:

- LLM input validation/mutation
- LLM output validation/mutation
- MCP pre-tool validation/mutation
- MCP post-tool validation/mutation

Operation modes:

- validate: inspect and block if needed
- mutate: rewrite and/or block

Risk classes called out in the docs:

- PII leaks
- prompt injection
- unsafe code/tool calls
- healthcare hallucinations
- confidential data leakage

Guardrail types observed in docs index:

- TrueFoundry content moderation
- TrueFoundry PII/PHI
- TrueFoundry prompt injection
- regex pattern matching
- secrets detection
- SQL sanitizer
- code safety linter
- OPA guardrails
- Cedar guardrails
- custom guardrails/plugins
- third-party guardrail integrations such as Azure, Bedrock, CrowdStrike, Enkrypt, Fiddler, Patronus, Palo Alto, TrojAI, etc.

For agent harnesses, this matters most around MCP/tool execution and user-provided prompts.

### Observability, Logs, Metrics, Cost

AI Gateway exposes:

- metrics dashboard
- request logs
- trace inspection
- span attributes
- model metrics API
- MCP metrics API
- OpenTelemetry export
- feedback on traces
- cost tracking
- data access controls for traces/metrics
- data routing to custom storage destinations

External observability integrations seen in the docs index include Arize, Braintrust, ClickStack, Coralogix, Dynatrace, Elastic, Honeycomb, Laminar, Langfuse, Middleware, New Relic, OpenLIT, PromptLayer, Pydantic Logfire, SigNoz, Splunk, Traceloop, and Prometheus/Grafana.

### Caching, Rate Limiting, Budget Limiting

Gateway controls include:

- exact and semantic caching
- rate limiting by users, teams, models, and applications
- budget limiting and cost boundaries
- cost tracking with public/private pricing

For deployed harnesses, these controls sit outside the harness code and should be documented as environment/platform prerequisites rather than embedded in manifests.

### Custom Endpoints

Custom Endpoints let arbitrary HTTP upstream services sit behind AI Gateway.

Gateway behavior:

- transparent proxy
- forwards method, path, query string, headers, and body
- injects upstream credentials/headers from provider account or endpoint integration
- callers only use TrueFoundry API keys
- per-endpoint access control
- tracing

URL pattern:

```text
{GATEWAY_BASE_URL}/proxy-api/{providerAccountName}/{endpointName}/{upstream-path}?{query-params}
```

This is important for harness deploy because a deployed agent service can potentially be registered as a custom endpoint and governed through AI Gateway, even if it is not a native TrueFoundry Agent.

### MCP Gateway And Registry

MCP Gateway centralizes access to MCP servers for agents and IDEs.

Problems it solves:

- fragmented MCP connections
- credential sprawl
- no audit visibility
- no governance over tools
- no central catalog

Observed MCP capabilities:

- central MCP registry
- connect official remote MCP servers
- connect arbitrary remote MCP servers
- create virtual MCP servers
- import OpenAPI specs into MCP
- hosted stdio-based MCP servers
- OAuth2 flows
- API key auth
- token passthrough
- shared credentials
- per-user credentials
- per-subject auth overrides
- collaborator roles
- tool-level governance
- MCP metrics/logging
- guardrails around tool invocation

MCP collaborator roles observed:

- MCP Server Manager
- MCP Server User

For manifest-based harness deploy, likely artifacts:

- deploy an MCP server as a TrueFoundry service
- separately register it in MCP Gateway
- optionally bundle several MCP servers into a virtual MCP server

### Agent Registry / TrueFoundry Agents / Remote Agents

Agent Registry is the place to build, register, discover, and govern AI agents, including both TrueFoundry-native agents and agents running elsewhere.

Observed agent surfaces:

- Remote Agents: register agents running on other platforms or custom infrastructure.
- TrueFoundry Agents: build agents natively with model selection, MCP tools, sandboxed execution, skills, and observability.
- Agent Playground: select model, write instructions, connect MCP servers, attach skills, test, then save versions.
- Agent APIs: app-configured completions and direct agent chat/responses endpoints.

This is the strongest evidence that harness-deploy should not pretend TrueFoundry lacks an agent concept. The manifest catalog should instead focus on third-party harness compatibility and, where possible, bridge deployed harnesses into Agent Registry or AI Gateway.

### Skills Registry

Skills are reusable `SKILL.md` instruction bundles with optional supporting files.

Observed features:

- versioned skills
- stored under a repository
- repository-level RBAC, versioning, and audit log
- usable by TrueFoundry Agents, Claude Code, and Cursor
- UI creation for single-file skills
- `tfy upload skill` for multi-file skills
- `tfy apply` for declarative/GitOps skill publishing

Skill format:

- directory rooted at `SKILL.md`
- YAML frontmatter with `name` and `description`
- optional `references/`, `scripts/`, and `assets/`
- `SKILL.md` body capped at 20 KB / 20,000 characters

This overlaps strongly with a harness manifest catalog: a polished harness folder might include both a deployment manifest and a skill that teaches an agent/operator how to operate that harness.

### Prompt Management

Prompt Management provides a prompt registry for reusable, versioned prompts.

Prompt features observed:

- repository-backed prompt versions
- model selection, including virtual models
- system/user messages
- input variables with `{{variable_name}}`
- logging config
- cache config
- input/output guardrails
- structured output
- metadata
- FQNs for prompt versions
- SDK / Gateway usage snippets

For harnesses, prompt templates can be part of the deployable operating package but probably should not be embedded directly into service manifests.

Needs deeper pass next.

## API Reference Surfaces Seen So Far

From `llms.txt`, the API reference includes these parsed groups:

| API group | Parsed endpoints |
| --- | ---: |
| agent | 9 |
| agent-skills | 7 |
| applications | 12 |
| apply | 3 |
| artifacts | 14 |
| audio | 3 |
| audit-logs | 1 |
| batch | 5 |
| chat | 1 |
| clusters | 6 |
| embeddings | 1 |
| files | 5 |
| fine-tuning | 4 |
| image | 3 |
| jobs | 5 |
| logs | 2 |
| mcp-servers-v2 | 9 |
| messages | 2 |
| mlrepos | 4 |
| model-deployments | 3 |
| models | 10 |
| moderations | 1 |
| personal-access-tokens | 6 |
| prompts | 9 |
| provider-integrations | 1 |
| rerank | 1 |
| responses | 5 |
| scim-v2 | 16 |
| secret-groups | 6 |
| secrets | 5 |
| teams | 5 |
| traces | 1 |
| users | 12 |
| virtual-accounts | 9 |
| workspaces | 5 |

For manifest-based harness deploy, the most immediately relevant API groups are:

- applications
- apply
- jobs
- logs
- clusters
- workspaces
- secret groups
- secrets
- artifacts
- ML repos
- model deployments
- MCP servers
- agents
- virtual accounts
- traces / audit logs, for operational visibility

The less deploy-specific but product-important groups are:

- OpenAI-compatible inference APIs: chat, responses, messages, embeddings, image, audio, files, batch, fine-tuning, moderations, rerank
- registry APIs: prompts, models, artifacts, ML repos
- admin/identity APIs: users, teams, SCIM, personal access tokens, virtual accounts
- platform discovery APIs: provider integrations, model deployment specifications

## API Reference Mapping Notes

### Applications API

Applications are the API surface for deployed workloads.

Observed operations:

- create or update application deployment from manifest
- cancel deployment
- list applications
- get application
- get deployment
- list deployments
- get application resources
- get application live state
- pause application
- resume application
- redeploy application
- delete application

This is the programmatic counterpart to `tfy apply` / deployment UI.

Important request/response details observed:

- `PUT /api/svc/v1/apps` creates or updates an application deployment from a manifest.
- If the application does not exist, it is created; otherwise a new deployment version is created.
- Request options include `dryRun`, `forceDeploy`, and `triggerOnDeploy`.
- `GET /api/svc/v1/x/apps/{id}/state` returns live runtime state, including pod-level details, node placement, restart counts, namespace, cluster ID, and active deployment version.
- `GET /api/svc/v1/x/apps/{id}/resources` returns ArgoCD resources and statuses for an application.

For harness compatibility testing, `state`, `resources`, `logs`, and deployment version APIs are the verification surfaces.

### Apply API

Apply API supports generic manifest operations:

- create/update resources from manifests
- delete resources from manifests
- resolve dependency tree

The docs explicitly list resource types such as provider-account, cluster, workspace, ml-repo, and application in the apply API descriptions.

Important request/response details observed:

- `PUT /api/svc/v1/apply` applies one manifest.
- Request includes `manifest` and optional `dryRun`.
- `POST /api/svc/v1/dependency-tree` resolves dependencies for an array of manifests.

Dependency-tree resolution is useful for a catalog folder that has multiple manifests such as `secret-group.yaml`, `volume.yaml`, `service.yaml`, and `mcp-server.yaml`.

### Logs API

Logs API covers:

- get logs
- download logs

Workload targets include:

- services
- jobs
- workflows
- job runs
- pods

Observed `GET /api/svc/v1/logs` filters include:

- start/end timestamp
- limit
- sort direction
- application ID/FQN
- deployment ID
- job run name

For harness manifests, every recipe should include the expected log query target: application, deployment, job run, or pod.

### Workspaces And Clusters APIs

Workspace API:

- create/update workspace
- get workspace
- list workspaces
- search workspaces
- delete workspace

Cluster API:

- create/update cluster
- get cluster
- list clusters
- cluster connection status
- cluster addons
- delete cluster

Observed create/update behavior:

- workspace create/update matches by workspace name and cluster
- cluster create/update matches by cluster name
- cluster connection status is exposed
- cluster addons are exposed

For harness deploy docs, workspace and cluster creation should usually be prerequisites, not bundled into basic harness manifests.

### Secrets APIs

Secret group APIs:

- create/update secret group
- create secret group
- update secret group
- list secret groups
- get secret group
- delete secret group

Secret APIs:

- list secrets
- get secret
- delete secret
- list active deployments associated with one or more secrets

Observed behavior:

- secret group create/update supports manifest and `dryRun`
- secret group APIs do not return secret values in normal responses
- secret value viewing can be disabled by control-plane config
- APIs can list deployments associated with secrets

For manifest catalogs, examples should use secret FQNs/placeholders and avoid raw secret values.

### Virtual Account APIs

Virtual accounts are the service/application identity surface.

Observed operations:

- create/update virtual account
- check existence
- list virtual accounts
- get virtual account
- get token
- regenerate token
- delete JWT
- delete virtual account
- sync virtual account token to secret store

This matters for production harness manifests: use VATs rather than PATs and sync tokens into the secret store where possible.

Observed create/update behavior:

- create/update virtual account uses `VirtualAccountManifest`
- response can include token data
- virtual accounts must have at least one permission
- expiration date has constraints and cannot be added/updated in some update cases

For deployable harnesses, virtual accounts are the production identity for agents and CI/CD jobs.

### Agent And Agent Skill APIs

Agent APIs:

- create/update agent
- list agents
- get agent
- list agent versions
- delete agent
- fetch agent card
- agent app completions
- agent chat completions
- agent responses

Agent skill APIs:

- create/update skill version
- list skills
- get skill
- list skill versions
- get skill version
- delete skill/version

Observed agent create/update validation:

- agent source/model configuration must be valid
- caller needs `CREATE_AGENT` or `MANAGE_AGENT`
- caller needs `USE_MCP_SERVER` permission for referenced MCP servers
- referenced MCP server names must exist in the tenant

Observed skill version constraints:

- skill name must be lowercase letters/digits/hyphens
- skill name cannot contain `anthropic` or `claude`
- skill version is applied through a manifest

This suggests a mature harness folder could include both:

- an application/service manifest for the runtime
- an agent or skill manifest for the operating instructions/control-plane representation

### MCP Server APIs

MCP server v2 APIs:

- create/update MCP server
- list MCP servers
- get MCP server
- delete MCP server
- get subject auth status
- get consent URL
- disconnect subject
- list user auth overrides
- set per-subject auth override

Observed MCP server create/update behavior:

- `PUT /api/svc/v1/mcp` creates/updates by manifest name
- request supports `dryRun`
- request supports `forceDelete` to acknowledge auth-record deletion on update
- MCP server manifest can be one of remote, virtual, OpenAPI-derived, or stdio-based
- sensitive fields like `auth_data` are redacted on get

For harness deploy, an MCP server may be:

- deployed as a service on TrueFoundry
- registered as a remote MCP server in MCP Gateway
- exposed via a virtual MCP server with a curated tool set

### Artifacts, Models, ML Repos

Artifact APIs cover:

- create/update artifact version
- stage artifact version
- multipart upload
- signed URLs
- list files
- list artifacts / versions
- get artifact / version
- tag artifact version
- delete artifact / version

ML repo APIs cover:

- create/update ML repo
- list/get/delete ML repo

Model deployment APIs cover:

- get deployment specifications
- get fine-tuning specifications
- get Nvidia NIM deployment specifications

### OpenAI-Compatible Gateway APIs

The API reference includes OpenAI-style runtime groups:

- chat completions
- responses
- compact responses
- response retrieval/deletion/input item listing
- messages
- token counting
- embeddings
- files
- batch
- fine-tuning
- image generation/edit/variation
- audio speech/transcription/translation
- moderations
- reranking

For harness deploy, these are not deployment targets by themselves. They are the runtime API surface that deployed agents and harnesses will call through AI Gateway.

Practical implication:

- a harness template should support `OPENAI_BASE_URL` / Gateway base URL
- it should use a TrueFoundry token, ideally a virtual-account token in production
- examples should prefer virtual models or platform-managed model names instead of hard-coding provider-native model IDs
- batch/eval harnesses can use the Gateway batch APIs when they do not need their own queue worker
- fine-tuning and model files are adjacent workflows, not part of the basic agent harness manifest

### Prompt APIs

Prompt APIs cover:

- create/update prompt version
- list prompts and versions
- get prompt and prompt version
- apply tags
- delete prompt or prompt version

Prompts are deployable registry objects rather than Kubernetes workloads. They should be treated as optional companion manifests for harnesses that need shared system prompts, templated instructions, guardrails, model settings, or prompt versioning.

### Model APIs

Model APIs cover:

- create/update model version
- list models and model versions
- get model and model version
- list available models
- apply tags
- delete model or version

For harness deploy, models should be referenced indirectly where possible. The harness package should declare expected model capability and gateway model name, while leaving actual provider/model routing to TrueFoundry Gateway or model deployment configuration.

### Personal Access Token APIs

PAT APIs cover:

- check whether a PAT exists
- create PAT
- get or create PAT
- list PATs
- delete PAT
- revoke all PATs

For harness templates, PATs are appropriate for local development examples but should not be the production default. Production harness recipes should use virtual accounts and secret sync.

### Teams, Users, And SCIM APIs

User APIs cover registration, invite, activation/deactivation, deletion, profile picture update, role updates, password change, registration checks, and user listing.

Team APIs cover create/update, get, delete, team permissions, and listing teams for a user.

SCIM v2 APIs cover enterprise identity provisioning:

- users
- groups
- schemas
- resource types
- service-provider configuration
- create/get/list/update/patch/delete flows

For harness deploy, these are mostly prerequisites and governance surfaces. A deployable harness catalog should not attempt to create users or teams by default, but it can document required roles/permissions and optionally include admin bootstrap manifests or API examples.

### Audit Logs And Traces APIs

Audit logs expose account/platform activity history.

Traces API exposes filtered span data with detailed attributes.

For harness deploy, these are verification and debugging surfaces:

- audit logs tell whether platform-level changes happened
- traces show Gateway/agent execution paths where tracing is enabled
- application logs and application state still remain the primary workload validation path

### Provider Integrations API

Provider integrations API lists configured providers.

For harness deploy, this is a discovery surface. A template can tell the operator which integration is needed, but basic catalog manifests should not assume a specific provider integration exists.

## API Surface Classification For Harness Deploy

| Class | API groups | Harness-deploy role |
| --- | --- | --- |
| Declarative deploy | apply, applications, jobs, workspaces, clusters, volumes via manifests, secret-groups, virtual-accounts | create/update/delete resources from YAML and verify rollout |
| Runtime operations | logs, jobs, applications state/resources, traces, audit-logs | smoke tests, debugging, status reports |
| Agent control plane | agents, agent-skills, mcp-servers-v2, prompts | register the operating layer around deployed harnesses |
| Model/data registries | artifacts, mlrepos, models, model-deployments, files | store or reference model/data artifacts |
| Gateway inference | chat, responses, messages, embeddings, audio, image, batch, fine-tuning, moderations, rerank | APIs that deployed harnesses call, not generally manifests to deploy |
| Identity/governance | users, teams, scim-v2, personal-access-tokens, virtual-accounts, secrets | permissions, service identity, secrets, enterprise provisioning |

The practical product boundary is:

```text
harness-deploy should own manifests, defaults, smoke tests, and compatibility notes.
TrueFoundry should own deployment execution, scheduling, identity, rollout, logs, and runtime APIs.
```

This reinforces the user's point: the first useful version does not need to be a CLI. A well-organized manifest catalog can be enough if it works cleanly with `tfy apply -f <manifest.yaml>`.

## Early Implications For Harness Deploy

The project should not invent deployment mechanics. TrueFoundry already has those.

The useful artifact is a catalog of deployable manifests plus notes for agent harnesses:

- service manifests for HTTP agents
- job manifests for one-shot or scheduled agent runs
- async service manifests for queue-backed agents
- volume patterns for stateful agents
- secret reference patterns for provider/channel credentials
- optional MCP server deployment manifests
- optional AI Gateway integration notes
- smoke-test instructions
- known limitations per harness

Because we do not yet know which agent harnesses will work cleanly on TrueFoundry, the first version should optimize for comparison and iteration:

- keep each harness in a separate folder
- make each folder deployable with `tfy apply -f` or `tfy apply --dir`
- include a short compatibility note explaining what worked, what failed, and what still needs a platform primitive or external dependency
- prefer existing upstream Docker images or Git sources when possible
- avoid wrapping everything in a custom CLI until the manifest patterns stabilize
- add generated tooling only around repeated operations such as filling placeholders, running dry-run/diff, applying, and smoke testing

This makes the project closer to a "deployment recipe catalog" than a new deploy platform.

### Proposed Harness Folder Shape

```text
harnesses/
  hermes-agent/
    README.md
    manifest.yaml
    secrets.example.yaml
    smoke-test.md
    compatibility.md
  deep-agents/
    README.md
    service.yaml
    secret-group.example.yaml
    mcp-server.yaml
    smoke-test.md
    compatibility.md
  pi-agent/
    README.md
    manifest.yaml
    compatibility.md
```

Optional later additions:

- `values.yaml` for user-editable parameters
- environment overlays such as `dev.yaml`, `prod.yaml`, or `gpu.yaml`
- `tfy apply --dry-run --show-diff` wrapper script
- smoke-test runner that calls the deployed endpoint and checks logs/state

### Manifest-First MVP Scope

The first useful MVP could be:

1. One validated Service-based agent harness.
2. One background/worker-style harness with no public endpoint.
3. One MCP server harness deployed as a Service and registered through MCP Gateway.
4. One harness that needs durable file state using a Volume.
5. A common README explaining prerequisites: workspace, secrets, Gateway base URL, model name, and deploy command.

That is enough to learn whether the real friction is:

- missing manifest examples
- image/build issues
- sandbox/runtime requirements
- lack of WebSockets
- missing persistent storage
- missing queues
- auth/secrets complexity
- TrueFoundry add-on assumptions
- upstream harness design choices

The central question per harness is:

```text
Which TrueFoundry workload primitive does this harness map to?
```

Common mapping:

- HTTP API agent -> Service
- background loop / bot -> Service with no public port, or worker-style service
- one-shot eval / batch task -> Job
- long-running high-latency request processor -> Async Service
- multi-step ML/data process -> Workflow
- MCP server -> Service plus MCP Gateway registration
- model-backed API -> Model Deployment or Service
- durable file state -> Volume
- durable structured state -> external DB, or platform-managed service if available
- immutable run outputs -> Artifact / ML repo
