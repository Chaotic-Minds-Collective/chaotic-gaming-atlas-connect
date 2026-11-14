const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const MESSAGE_TYPES = new Set(["global", "grid", "tribe", "announcement"]);
const PLATFORMS = new Set(["atlas", "discord"]);
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_RELAY_HOPS = 2;

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function identifier(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseTimestamp(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be an ISO date-time with timezone`);
  }
  const match = ISO_DATE_TIME.exec(value);
  if (!match) {
    throw new TypeError(`${field} must be an ISO date-time with timezone`);
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
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }
  return new Date(parsed).toISOString();
}

function normalizeTarget(value, field) {
  record(value, field);
  const platform = identifier(value.platform, `${field}.platform`);
  if (!PLATFORMS.has(platform)) {
    throw new TypeError(`${field}.platform must be atlas or discord`);
  }
  return Object.freeze({
    platform,
    channelId: identifier(value.channelId, `${field}.channelId`)
  });
}

function sameTarget(left, right) {
  return left.platform === right.platform && left.channelId === right.channelId;
}

/**
 * Normalize a public Connect message. Direct/private messages are deliberately
 * excluded from this relay contract.
 */
export function normalizeConnectMessage(input) {
  record(input, "message");
  if (input.schemaVersion !== 1) {
    throw new TypeError("schemaVersion must be 1");
  }

  const messageId = identifier(input.messageId, "messageId");
  const occurredAt = parseTimestamp(input.occurredAt, "occurredAt");
  const scopeInput = record(input.scope, "scope");
  const scope = Object.freeze({
    clusterId: identifier(scopeInput.clusterId, "scope.clusterId"),
    gridId: identifier(scopeInput.gridId, "scope.gridId"),
    serverId: identifier(scopeInput.serverId, "scope.serverId")
  });

  const channelInput = record(input.channel, "channel");
  const type = identifier(channelInput.type, "channel.type");
  if (!MESSAGE_TYPES.has(type)) {
    throw new TypeError("channel.type must be global, grid, tribe, or announcement");
  }
  const providerTribeId = channelInput.providerTribeId === null ||
    channelInput.providerTribeId === undefined
    ? null
    : identifier(channelInput.providerTribeId, "channel.providerTribeId");
  if (type === "tribe" && providerTribeId === null) {
    throw new TypeError("channel.providerTribeId is required for tribe messages");
  }
  if (type !== "tribe" && providerTribeId !== null) {
    throw new TypeError("channel.providerTribeId is only valid for tribe messages");
  }

  const origin = normalizeTarget(input.origin, "origin");
  const content = input.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new TypeError("content must be a non-empty string");
  }
  const normalizedContent = content.trim();
  if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
    throw new RangeError(`content must not exceed ${MAX_MESSAGE_LENGTH} characters`);
  }
  if (normalizedContent.includes("\u0000")) {
    throw new TypeError("content must not contain NUL characters");
  }

  const correlationId = input.correlationId === null ||
    input.correlationId === undefined
    ? null
    : identifier(input.correlationId, "correlationId");

  const relayPathInput = input.relayPath ?? [];
  if (!Array.isArray(relayPathInput)) {
    throw new TypeError("relayPath must be an array");
  }
  if (relayPathInput.length > MAX_RELAY_HOPS) {
    throw new RangeError(`relayPath must contain at most ${MAX_RELAY_HOPS} destinations`);
  }

  const seenTargets = [origin];
  const relayPath = relayPathInput.map((target, index) => {
    const normalized = normalizeTarget(target, `relayPath[${index}]`);
    if (seenTargets.some((seen) => sameTarget(seen, normalized))) {
      throw new TypeError("relayPath must not repeat the origin or a prior destination");
    }
    seenTargets.push(normalized);
    return normalized;
  });

  return Object.freeze({
    schemaVersion: 1,
    messageId,
    occurredAt,
    scope,
    channel: Object.freeze({ type, providerTribeId }),
    origin,
    content: normalizedContent,
    correlationId,
    relayPath: Object.freeze(relayPath)
  });
}

/**
 * Check a proposed relay against an explicit destination allowlist and the
 * message's origin/relay history. This function never sends a message.
 */
export function evaluateConnectRelay(message, destination, allowedDestinations) {
  const normalizedMessage = normalizeConnectMessage(message);
  const origin = normalizedMessage.origin;
  const target = normalizeTarget(destination, "destination");
  if (!Array.isArray(allowedDestinations)) {
    throw new TypeError("allowedDestinations must be an array");
  }

  const allowed = allowedDestinations.map((entry, index) =>
    normalizeTarget(entry, `allowedDestinations[${index}]`)
  );
  if (!allowed.some((entry) => sameTarget(entry, target))) {
    return Object.freeze({ allowed: false, reason: "destination is not allowlisted" });
  }
  if (sameTarget(origin, target)) {
    return Object.freeze({ allowed: false, reason: "destination is the message origin" });
  }

  const relayPath = normalizedMessage.relayPath;
  if (!Array.isArray(relayPath)) {
    throw new TypeError("message.relayPath must be an array");
  }
  const visited = relayPath.map((entry, index) =>
    normalizeTarget(entry, `message.relayPath[${index}]`)
  );
  if (visited.some((entry) => sameTarget(entry, target))) {
    return Object.freeze({ allowed: false, reason: "destination already received this message" });
  }
  if (visited.length >= MAX_RELAY_HOPS) {
    return Object.freeze({ allowed: false, reason: "relay hop limit reached" });
  }

  return Object.freeze({ allowed: true, reason: "destination is allowlisted and not previously visited" });
}

export const CONNECT_MESSAGE_DEFAULTS = Object.freeze({
  maxMessageLength: MAX_MESSAGE_LENGTH,
  maxRelayHops: MAX_RELAY_HOPS
});

/**
 * Return an updated envelope after the caller has successfully delivered to
 * an allowlisted destination. Callers are responsible for persisting this
 * returned relay trace with their durable delivery record.
 */
export function recordConnectRelayDelivery(message, destination, allowedDestinations) {
  const normalizedMessage = normalizeConnectMessage(message);
  const target = normalizeTarget(destination, "destination");
  const eligibility = evaluateConnectRelay(
    normalizedMessage,
    target,
    allowedDestinations
  );
  if (!eligibility.allowed) {
    throw new Error(`relay delivery cannot be recorded: ${eligibility.reason}`);
  }

  return normalizeConnectMessage({
    ...normalizedMessage,
    relayPath: [...normalizedMessage.relayPath, target]
  });
}
