# Security Policy

Bastion installs a Windows service that runs as `LocalSystem`. We take vulnerabilities in it seriously.

## What counts as a security vulnerability

- Privilege escalation through the service, the named pipe, the native messaging host, or the installer.
- Code execution, file writes, or registry writes driven by a less-privileged process.
- Exposure of a user's data to another user or to the network.
- Tampering with release artifacts or the update channel.

## What is *not* a security vulnerability

**Bypassing strict mode** on your own machine (for example, as an administrator) is a known limitation of any user-space blocker, not a vulnerability. Please report those as public issues with the "Strict mode bypass" form. See [docs/threat-model.md](docs/threat-model.md).

## Supported versions

Until `1.0`, only the latest release receives security fixes.

## Secret scanning

GitHub secret scanning and push protection are enabled in this repository's settings, not by a file in it (checked on 2026-10-30). A push that contains a secret is rejected for the patterns push protection supports, on pushes to this repository, and a secret that secret scanning recognizes in the history raises an alert for the maintainers. Neither covers every kind of secret, so they don't replace reading your diff.

If a push is blocked, remove the secret from your commits instead of bypassing the block. A secret that has reached a public branch is compromised even after you remove it: revoke it first.

## Reporting a vulnerability

Please **do not open a public issue.** Report privately through GitHub's [private vulnerability reporting](https://github.com/CornelioDev/bastion/security/advisories/new).

Include the affected version, steps to reproduce, and impact. We aim to acknowledge within 3 business days and to agree on a disclosure timeline with you. We credit reporters in the advisory unless you prefer otherwise.
