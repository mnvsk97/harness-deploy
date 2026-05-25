# OpenClaw Compatibility

Status: `unknown`

Expected fit: strong.

Known caveats:

- The gateway is local-first and security-sensitive. Public exposure must use a real gateway token and endpoint auth.
- Sandboxing inside OpenClaw can require Docker socket access. That should not be enabled by default on TrueFoundry.
- Multi-channel connectors require external bot/app setup.
- Use one replica unless state isolation is designed.

