---
id: FB-0002
date: 2026-08-14
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [developer-experience, environment]
---

# The development workspace starts without the environment required by Card Orb.

## What was said

> .context/attachments/u3YbBw/terminal-selection-2026-08-14T17-53-52.txt fixen?

> Can you fix .context/attachments/u3YbBw/terminal-selection-2026-08-14T17-53-52.txt?

## Context

The development server in the Dallas Conductor workspace reports that every Card Orb environment variable is missing.

## Interpretation

This workspace has not received the gitignored local environment file required to run Card Orb with its configured data and account integrations.

## Action

- [x] Restore the workspace environment from the existing Card Orb workspace, without recording any secret values.

## Related

- Decision: Not needed
- Changelog: [2026-08-14 — Workspace environment restored](../changelog.md#2026-08-14)
