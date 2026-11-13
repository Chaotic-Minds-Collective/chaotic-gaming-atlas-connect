# CG Connect

Cross-grid chat, scheduled announcements, MOTDs, rules, invite links and Discord relays.

This Chaotic Gaming-specific module extends [Chaotic Gaming Core](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-core) and the [ATLAS integration adapter](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas); it does not replace either foundation.

## Feature scope
- Global/grid chat with origin labels
- Tribe chat gated by membership
- Scheduled announcements and maintenance notices
- Login MOTDs, rules and invite links
- Discord relay with allowlists, anti-loop controls and rate limits
- Scoped admin broadcasts and audit

## Architecture and dependencies
- Core identity, scoped RBAC, server registry and outbox
- ATLAS adapter: verified connect/disconnect/chat callbacks
- CG Tribes for membership
- Discord service integration; Discord roles are not Core permissions

Core remains authoritative for shared identity, authorization and platform records. ATLAS-native calls pass through the shared adapter. This module owns its domain state and must not connect directly to PostgreSQL.

## Implementation plan
See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for data ownership, milestones and technical gates.

## Readiness
Planning scaffold only. Native ATLAS compatibility and feature-specific callbacks are not yet verified on an isolated server. No production deployment is implied.
