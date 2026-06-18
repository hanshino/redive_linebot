const { concat } = require("lodash");
const { format } = require("util");
const config = require("config");
const redis = require("../../util/redis");

const groupSessionKeyTemplate = config.get("redis.keys.groupSession");
const SESSION_TTL = 3600;
const MAX_SESSION_MESSAGES = 20;
const EVENT_SCHEMA = "ai.conversation_event.v1";

function createConversationLog({ redisClient = redis } = {}) {
  return {
    async recordHumanMessage(groupId, input) {
      return recordEvent(redisClient, groupId, createEvent({ ...input, role: "human" }));
    },

    async recordSelfReply(groupId, input) {
      return recordEvent(redisClient, groupId, createEvent({ ...input, role: "self" }));
    },

    async getRecentMessages(groupId) {
      const rawMessages = await redisClient.lRange(sessionKey(groupId), 0, MAX_SESSION_MESSAGES);
      return rawMessages.map(parseEvent).filter(Boolean);
    },

    async reset(groupId) {
      return redisClient.del(sessionKey(groupId));
    },

    buildPromptContext(messages, targetMessage) {
      const targetId = targetMessage && targetMessage.id;
      const contextMessages = messages.filter(message => message.id !== targetId);
      return { targetMessage, contextMessages };
    },
  };
}

function createEvent({
  role,
  speakerId,
  speakerName,
  text,
  timestamp = new Date().toISOString(),
  source = "line",
}) {
  return {
    schema: EVENT_SCHEMA,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    speakerId,
    speakerName,
    text,
    timestamp,
    source,
  };
}

async function recordEvent(redisClient, groupId, event) {
  const key = sessionKey(groupId);
  await redisClient.rPush(key, concat([], serializeEvent(event)));
  await redisClient.lTrim(key, -MAX_SESSION_MESSAGES, -1);
  await redisClient.expire(key, SESSION_TTL);
  return event;
}

function serializeEvent(event) {
  return JSON.stringify(event);
}

function parseEvent(raw) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schema === EVENT_SCHEMA) return parsed;
  } catch {
    // Legacy Redis session entries were plain transcript strings.
  }

  return {
    schema: "legacy.plain_text",
    id: `legacy-${raw}`,
    role: "human",
    speakerName: "某個群友",
    text: String(raw),
    source: "legacy",
  };
}

function sessionKey(groupId) {
  return format(groupSessionKeyTemplate, groupId);
}

module.exports = {
  EVENT_SCHEMA,
  SESSION_TTL,
  MAX_SESSION_MESSAGES,
  createConversationLog,
  createEvent,
  parseEvent,
  serializeEvent,
  defaultConversationLog: createConversationLog(),
};
