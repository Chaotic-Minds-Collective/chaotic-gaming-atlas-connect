const CHAT_EVENT_TYPES = new Set(["chat.global", "chat.tribe"]);
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(field + " must be an object");
  }
  return value;
}
function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(field + " must be a non-empty string");
  }
  return value;
}
function optionalString(value, field) {
  if (value === undefined || value === null) return null;
  return requiredString(value, field);
}
function normalizeTimestamp(value) {
  const match = typeof value === "string" ? ISO_DATE_TIME.exec(value) : null;
  if (!match) {
    throw new TypeError("payload.occurredAt must be an ISO date-time with timezone");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new TypeError("payload.occurredAt must be a valid ISO date-time with timezone");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError("payload.occurredAt must be a valid ISO date-time with timezone");
  }
  return new Date(parsed).toISOString();
}
function immutableJsonObject(value, field) {
  record(value, field);
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError(field + " must contain JSON-serializable data");
  }
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) {
    throw new TypeError(field + " must be a JSON object");
  }
  return deepFreeze(copy);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Normalize the documented Core game.event.received outbox wrapper for
 * public chat event types. The inner provider payload remains opaque because
 * Core's published contract does not define a canonical chat-body schema.
 */
export function normalizeCoreChatEvent(input) {
  const envelope = record(input, "event");
  if (envelope.eventType !== "game.event.received") {
    throw new TypeError("event.eventType must be game.event.received");
  }
  const event = record(envelope.payload, "event.payload");
  if (event.game !== "atlas") throw new TypeError("payload.game must be atlas");
  if (!CHAT_EVENT_TYPES.has(event.eventType)) {
    throw new TypeError("payload.eventType must be chat.global or chat.tribe");
  }

  const scope = Object.freeze({
    clusterId: requiredString(event.clusterId, "payload.clusterId"),
    gridId: optionalString(event.gridId, "payload.gridId"),
    serverId: requiredString(event.serverId, "payload.serverId")
  });
  const normalizedPayload = immutableJsonObject(event.payload, "payload.payload");

  return Object.freeze({
    schemaVersion: 1,
    eventRecordId: requiredString(event.eventRecordId, "payload.eventRecordId"),
    sourceEventId: requiredString(event.eventId, "payload.eventId"),
    eventType: event.eventType,
    occurredAt: normalizeTimestamp(event.occurredAt),
    correlationId: optionalString(event.correlationId, "payload.correlationId"),
    scope,
    payload: normalizedPayload
  });
}
