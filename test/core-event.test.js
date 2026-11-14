import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCoreChatEvent } from "../src/core-event.js";

function event(overrides = {}) {
  return {
    eventType: "game.event.received",
    payload: {
      eventRecordId: "core-event-record-1",
      eventId: "provider-chat-1",
      game: "atlas",
      eventType: "chat.global",
      occurredAt: "2026-11-13T18:00:00.000Z",
      clusterId: "cluster-1",
      gridId: "grid-a",
      serverId: "server-1",
      correlationId: "chat-trace-1",
      payload: { providerPlayerId: "player-7", text: "Hello, cluster!" },
      ...overrides
    }
  };
}

test("normalizes documented Core outbox wrapper and preserves opaque chat payload", () => {
  const result = normalizeCoreChatEvent(event());
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.eventRecordId, "core-event-record-1");
  assert.equal(result.sourceEventId, "provider-chat-1");
  assert.equal(result.eventType, "chat.global");
  assert.equal(result.scope.clusterId, "cluster-1");
  assert.equal(result.scope.gridId, "grid-a");
  assert.deepEqual(result.payload, { providerPlayerId: "player-7", text: "Hello, cluster!" });
  assert.equal(result.correlationId, "chat-trace-1");
});

test("accepts global and tribe chat only", () => {
  assert.equal(normalizeCoreChatEvent(event({ eventType: "chat.global" })).eventType, "chat.global");
  assert.equal(normalizeCoreChatEvent(event({ eventType: "chat.tribe" })).eventType, "chat.tribe");
  for (const eventType of ["player.chat", "announcement.created", "tribe.member.joined"]) {
    assert.throws(() => normalizeCoreChatEvent(event({ eventType })), /chat.global or chat.tribe/);
  }
});

test("supports legacy events with nullable grid and correlation metadata", () => {
  const result = normalizeCoreChatEvent(event({ gridId: null, correlationId: null }));
  assert.equal(result.scope.gridId, null);
  assert.equal(result.correlationId, null);
});

test("normalizes timestamps and freezes a detached payload copy", () => {
  const input = event({ occurredAt: "2026-11-13T10:00:00-08:00" });
  const before = structuredClone(input);
  const result = normalizeCoreChatEvent(input);
  assert.equal(result.occurredAt, "2026-11-13T18:00:00.000Z");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.scope));
  assert.ok(Object.isFrozen(result.payload));
  assert.deepEqual(input, before);
  assert.notEqual(result.payload, input.payload.payload);
});

test("rejects malformed envelope, unsupported game and missing required metadata", () => {
  assert.throws(() => normalizeCoreChatEvent(null), /event must be an object/);
  assert.throws(() => normalizeCoreChatEvent({ eventType: "chat.global", payload: {} }), /game.event.received/);
  assert.throws(() => normalizeCoreChatEvent(event({ game: "7dtd" })), /game must be atlas/);
  for (const overrides of [
    { eventRecordId: "" }, { eventId: "" }, { clusterId: "" },
    { serverId: "" }, { occurredAt: "yesterday" }, { payload: [] }
  ]) assert.throws(() => normalizeCoreChatEvent(event(overrides)));
});

test("does not infer a message body or fabricate an origin channel", () => {
  const result = normalizeCoreChatEvent(event({ payload: { arbitraryProviderShape: { text: "raw" } } }));
  assert.deepEqual(result.payload, { arbitraryProviderShape: { text: "raw" } });
  assert.equal(Object.hasOwn(result, "content"), false);
  assert.equal(Object.hasOwn(result, "origin"), false);
});
