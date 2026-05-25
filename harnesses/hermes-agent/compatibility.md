# Hermes Agent Compatibility

Status: `unknown`

Expected fit: strong.

Known caveats:

- Hermes can use Docker/SSH/Modal/Daytona/Vercel sandbox backends. Do not assume nested Docker works inside TrueFoundry.
- The dashboard should not be public without auth.
- First boot creates config under `/opt/data`; persist this with a volume.
- Some messaging integrations need external webhook/public URL setup.

