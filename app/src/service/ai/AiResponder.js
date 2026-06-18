const { defaultConversationLog } = require("./ConversationLog");
const { defaultGeminiClient } = require("./GeminiClient");

const EMPTY_MENTION_REPLY = "欸特我就為了這點B事?";
const MAX_MENTION_TEXT_LENGTH = 200;
const MAX_PASSIVE_TEXT_LENGTH = 100;

function createAiResponder({
  conversationLog = defaultConversationLog,
  geminiClient = defaultGeminiClient,
} = {}) {
  return {
    async respondToMention(message) {
      if (!message || !message.text) return { action: "next" };
      if (message.text.length > MAX_MENTION_TEXT_LENGTH) return { action: "next" };

      const text = message.text.trim();
      if (text.length === 0) return { action: "reply", text: EMPTY_MENTION_REPLY };

      const targetMessage = await conversationLog.recordHumanMessage(message.groupId, {
        speakerId: message.speakerId,
        speakerName: message.speakerName,
        text,
      });
      const messages = await conversationLog.getRecentMessages(message.groupId);
      const promptContext = conversationLog.buildPromptContext(messages, targetMessage);

      try {
        const replyText = await geminiClient.generateReply(promptContext);
        if (!replyText) return { action: "silent" };

        await conversationLog.recordSelfReply(message.groupId, {
          speakerName: "布丁",
          text: replyText,
        });
        return { action: "reply", text: replyText };
      } catch {
        return { action: "silent" };
      }
    },

    async recordPassiveMessage(message) {
      if (!message || !message.text) return { recorded: false };
      if (message.text.length > MAX_PASSIVE_TEXT_LENGTH) return { recorded: false };

      await conversationLog.recordHumanMessage(message.groupId, {
        speakerId: message.speakerId,
        speakerName: message.speakerName,
        text: message.text,
      });
      return { recorded: true };
    },

    async resetConversation(groupId) {
      await conversationLog.reset(groupId);
    },
  };
}

module.exports = {
  EMPTY_MENTION_REPLY,
  MAX_MENTION_TEXT_LENGTH,
  MAX_PASSIVE_TEXT_LENGTH,
  createAiResponder,
  defaultAiResponder: createAiResponder(),
};
