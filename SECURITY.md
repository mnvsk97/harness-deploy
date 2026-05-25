# Security Policy

This repository contains experimental deployment manifests and thin gateway
wrappers for agent harnesses. Treat every deployed harness as security-sensitive:
coding agents can read files, write files, run tools, and call model providers.

## Reporting Issues

Please report security issues privately to the repository maintainers. Do not
open a public issue for secrets exposure, authentication bypass, sandbox escape,
or credential-handling problems.

If a private reporting channel has not been configured for your fork, email the
owner of the repository or use your organization's normal vulnerability intake
process.

## Supported Scope

Security review currently covers:

- committed manifests and examples
- gateway wrapper code in `harnesses/*/gateway`
- secret-reference patterns
- documented deployment flows

It does not cover the full upstream harness implementations, external sandbox
providers, model providers, or TrueFoundry tenant configuration.

## Deployment Safety

- Do not expose a harness gateway without a bearer token or equivalent platform
  authentication.
- Do not put raw provider keys in manifests. Use TrueFoundry Secret Groups.
- Do not use these manifests for untrusted workloads without an isolated sandbox
  provider such as Daytona, E2B, Runloop, Modal, or a comparable boundary.
- Prefer pinned harness versions and image digests for production deployments.
