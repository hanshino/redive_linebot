const { buffer } = require("node:stream/consumers");
const { messagingApi, HTTPFetchError } = require("@line/bot-sdk");

function createLineClient({
  channelAccessToken,
  api = new messagingApi.MessagingApiClient({ channelAccessToken }),
  blob = new messagingApi.MessagingApiBlobClient({ channelAccessToken }),
}) {
  async function getUserProfile(userId) {
    try {
      return await api.getProfile(userId);
    } catch (error) {
      if (error instanceof HTTPFetchError && error.status === 404) return null;
      throw error;
    }
  }

  const client = {
    getUserProfile,
    getProfile: getUserProfile,
    getGroupMemberProfile: (groupId, userId) => api.getGroupMemberProfile(groupId, userId),
    getRoomMemberProfile: (roomId, userId) => api.getRoomMemberProfile(roomId, userId),
    getGroupSummary: groupId => api.getGroupSummary(groupId),
    getGroupCount: groupId => api.getGroupMemberCount(groupId),
    getGroupMembersCount: async groupId => (await client.getGroupCount(groupId)).count,
    getMessageContent: async messageId => buffer(await blob.getMessageContent(messageId)),
    reply: (replyToken, messages) =>
      client.replyMessage({
        replyToken,
        messages: Array.isArray(messages) ? messages : [messages],
      }),
    replyMessage: request => api.replyMessage(request),
  };
  return client;
}

let lineClient;

function getClient(name) {
  if (name !== "line") throw new Error(`Unknown bot client: ${name}`);
  if (!lineClient) {
    lineClient = createLineClient({ channelAccessToken: process.env.LINE_ACCESS_TOKEN });
  }
  return lineClient;
}

module.exports = { createLineClient, getClient };
