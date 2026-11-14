# CMG Connect

Cross-grid chat, scheduled announcements, MOTDs, rules, invite links and Discord relays.

This Chaotic Minds Gaming (CMG) module extends [CMG Core](https://github.com/Chaotic-Minds-Collective/cmg-atlas-core-plugin) and the [ATLAS integration adapter](https://github.com/Chaotic-Minds-Collective/cmg-atlas-plugin); it does not replace either foundation.

## Feature scope

- Global/grid chat with origin labels
- Tribe chat gated by membership
- Scheduled announcements and maintenance notices
- Login MOTDs, rules and invite links
- Discord relay with allowlists, anti-loop controls and rate limits
- Scoped admin broadcasts and audit

## Current implementation

The first server-independent milestone is implemented in `src/message.js`:

- Normalizes public global, grid, tribe and announcement messages into an immutable schema-v1 envelope.
- Requires explicit cluster/grid/server scope and origin channel identity.
- Requires a provider tribe ID for tribe messages; display names are not identifiers.
- Excludes private/direct messages from the relay contract.
- Requires an explicit destination allowlist before relay eligibility is granted.
- Blocks relays to the origin or previously visited destinations, caps relay history at two hops, and returns a new envelope to record a successful delivery.
- Validates timestamps, IDs and message length; no message is sent by this policy layer.

This is a pure message and relay-policy contract. It does not connect to Discord, poll ATLAS, persist messages, schedule announcements, or invoke native game callbacks.

## Architecture and dependencies

- Core identity, scoped RBAC, server registry and outbox
- ATLAS adapter: verified connect/disconnect/chat callbacks
- CMG Tribes for membership
- Discord service integration; Discord roles are not Core permissions

Core remains authoritative for shared identity, authorization and platform records. ATLAS-native calls pass through the shared adapter. This module owns its domain state and must not connect directly to PostgreSQL.

## Development

Requires Node.js 22 or newer.

```sh
npm run check
npm test
```

GitHub Actions runs the same checks for pushes and pull requests.

## Safety and compatibility

- Only explicitly allowlisted public destinations may be considered for relay.
- Never relay private messages or unapproved channels.
- Relay history prevents immediate loops; production delivery still needs durable deduplication, bounded retries and reconnect tests.
- Native ATLAS chat/login hooks are unverified; no in-game UI or live relay capability is claimed.
- No production deployment, Discord connection, credential, database access or live server change is included.
