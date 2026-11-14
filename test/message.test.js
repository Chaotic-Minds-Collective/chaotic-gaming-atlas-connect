import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateConnectRelay,
  normalizeConnectMessage
} from "../src/message.js";

const base = {
  schemaVersion: 1,
  messageId: "msg-001",
  occurredAt: "2026-11-13T18:00:00.000Z",
  scope: {
    clusterId: "cluster-1",
    gridId: "grid-a",
    serverId: "server-1"
  },
  channel: { type: "global" },
  origin: { platform: "atlas", channelId: "atlas-global" },
  content: "  Server maintenance begins soon.  ",
  correlationId: null,
  relayPath: []
};

function message(overrides = {}) {
  return normalizeConnectMessage({
    ...base,
    ...overrides,
    scope: { ...base.scope, ...overrides.scope },
    channel: { ...base.channel, ...overrides.channel },
    origin: { ...base.origin, ...overrides.origin }
  });
}

test("normalizes a public message into an immutable schema-v1 envelope", () => {
  const result = message();
  assert.equal(result.messageId, "msg-001");
  assert.equal(result.content, "Server maintenance begins soon.");
  assert.equal(result.channel.type, "global");
  assert.deepEqual(result.scope, base.scope);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.scope));
  assert.ok(Object.isFrozen(result.channel));
  assert.ok(Object.isFrozen(result.origin));
  assert.ok(Object.isFrozen(result.relayPath));
});

test("requires a provider tribe ID only for tribe messages", () => {
  const result = message({
    channel: { type: "tribe", providerTribeId: "tribe-42" }
  });
  assert.equal(result.channel.providerTribeId, "tribe-42");
  assert.throws(
    () => message({ channel: { type: "tribe" } }),
    /required for tribe messages/
  );
  assert.throws(
    () => message({ channel: { type: "global", providerTribeId: "tribe-42" } }),
    /only valid for tribe messages/
  );
});

test("excludes private messages from the relay contract", () => {
  assert.throws(
    () => message({ channel: { type: "private" } }),
    /global, grid, tribe, or announcement/
  );
});

test("rejects malformed IDs, timestamps, content and scope", () => {
  assert.throws(() => normalizeConnectMessage(null), /message must be an object/);
  assert.throws(() => message({ schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => message({ messageId: " " }), /messageId/);
  assert.throws(() => message({ occurredAt: "yesterday" }), /occurredAt/);
  assert.throws(() => message({ occurredAt: "2026-02-30T18:00:00Z" }), /occurredAt/);
  assert.throws(() => message({ scope: { ...base.scope, gridId: "" } }), /scope.gridId/);
  assert.throws(() => message({ content: " " }), /content/);
  assert.throws(() => message({ content: "x".repeat(2_001) }), /2,000/);
  assert.throws(() => message({ content: "bad\u0000message" }), /NUL/);
});

test("requires explicit allowlisting before a relay is permitted", () => {
  const result = evaluateConnectRelay(
    message(),
    { platform: "discord", channelId: "discord-announcements" },
    []
  );
  assert.deepEqual(result, {
    allowed: false,
    reason: "destination is not allowlisted"
  });
});

test("allows an allowlisted destination that has not received the message", () => {
  const result = evaluateConnectRelay(
    message(),
    { platform: "discord", channelId: "discord-announcements" },
    [{ platform: "discord", channelId: "discord-announcements" }]
  );
  assert.equal(result.allowed, true);
});

test("blocks relays back to the origin and to previously visited destinations", () => {
  const origin = message();
  assert.equal(evaluateConnectRelay(
    origin,
    { platform: "atlas", channelId: "atlas-global" },
    [{ platform: "atlas", channelId: "atlas-global" }]
  ).allowed, false);

  const relayed = message({
    relayPath: [{ platform: "discord", channelId: "discord-announcements" }]
  });
  assert.deepEqual(evaluateConnectRelay(
    relayed,
    { platform: "discord", channelId: "discord-announcements" },
    [{ platform: "discord", channelId: "discord-announcements" }]
  ), {
    allowed: false,
    reason: "destination already received this message"
  });
});

test("enforces unique relay history and the hop limit", () => {
  assert.throws(() => message({
    relayPath: [
      { platform: "discord", channelId: "discord-a" },
      { platform: "discord", channelId: "discord-a" }
    ]
  }), /must not repeat/);
  assert.throws(() => message({
    relayPath: [
      { platform: "discord", channelId: "discord-a" },
      { platform: "atlas", channelId: "atlas-b" },
      { platform: "discord", channelId: "discord-c" }
    ]
  }), /at most 2/);
  const twoHops = message({
    relayPath: [
      { platform: "discord", channelId: "discord-a" },
      { platform: "atlas", channelId: "atlas-b" }
    ]
  });
  assert.deepEqual(evaluateConnectRelay(
    twoHops,
    { platform: "discord", channelId: "discord-c" },
    [{ platform: "discord", channelId: "discord-c" }]
  ), {
    allowed: false,
    reason: "relay hop limit reached"
  });
});

test("rejects an invalid relay destination and non-array allowlist", () => {
  assert.throws(() => evaluateConnectRelay(message(), {
    platform: "webhook",
    channelId: "hook-1"
  }, []), /atlas or discord/);
  assert.throws(() => evaluateConnectRelay(message(), {
    platform: "discord",
    channelId: "channel-1"
  }, null), /allowedDestinations/);
});
