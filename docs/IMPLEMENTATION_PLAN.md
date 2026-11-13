# CMG ATLAS Connect Plugin — Implementation Plan

## Purpose
Cross-grid chat, scheduled announcements, MOTDs, rules, invite links and Discord relays.

## Feature scope
- Global/grid chat with origin labels
- Tribe chat gated by membership
- Scheduled announcements and maintenance notices
- Login MOTDs, rules and invite links
- Discord relay with allowlists, anti-loop controls and rate limits
- Scoped admin broadcasts and audit

## Dependencies
- Core identity, scoped RBAC, server registry and outbox
- ATLAS adapter: verified connect/disconnect/chat callbacks
- CMG ATLAS Tribes for membership
- Discord service integration; Discord roles are not Core permissions

## Data ownership
Core owns identity, authorization, audit and durable events. Connect owns channels, schedules, templates, receipts, preferences and relay cursors. Preserve cluster/grid/server context.

## Milestones
1. Define message envelope and anti-loop contract
2. Extend Core: current event ingestion does not support chat/announcement events
3. Build read-only adapter with synthetic events
4. Implement announcements/MOTD/rules/invite links, then tribe chat and Discord relay
5. Test reconnects, duplicates, rate limits and cross-grid routing

## Technical gates and risks
- ATLAS chat/login hooks are unverified; no in-game UI claim before isolated tests
- Choose native popup or chat fallback
- Never relay private messages or unapproved channels

## Shared engineering requirements
- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.
- Do not deploy to production or change live server configuration during repository planning.

## Current readiness
Documentation and planning scaffold. Exact ATLAS server build, loader, SDK, callbacks and feature-specific capabilities require isolated reproducible validation.
