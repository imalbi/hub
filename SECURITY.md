# Security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/imalbi/hub/security/advisories/new) when it is enabled for this repository. If that option is unavailable, contact the maintainer privately through a contact method on their [GitHub profile](https://github.com/imalbi). Do not post exploit details or personal configuration in public issues.

Include the affected commit, reproduction steps using fake data, expected impact and any proposed fix. Remove tokens, device identifiers and personal data. There is no guaranteed response time or support for older revisions; fixes target the current `main` branch.

## Deployment boundaries

Hub is a personal desktop service, not a multi-user server or an internet-facing service.

- Loopback requests have full desktop privileges. Do not forward remote traffic through a local reverse proxy.
- LAN clients must pair and keep their bearer tokens private. HTTP and WebSocket traffic is unencrypted; use a trusted network. Pairing is authorization, not transport encryption.
- Registered actions validate inputs. Catalog and local modules are trusted executable code in the Hub process, not sandboxed plugins. Review their code and dependencies before installing. `--ignore-scripts` does not change this trust boundary.
- Keep local configuration, databases and private modules out of public reports. The privacy guard is a heuristic and does not inspect image pixels.

Tests use a fake desktop and generic fixtures. Report a bypass of pairing, origin checks, action validation or agent permissions privately, even if it currently requires local access.
