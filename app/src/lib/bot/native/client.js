const { messagingApi, HTTPFetchError } = require("@line/bot-sdk");

function createLineClient({
  channelAccessToken,
  api = new messagingApi.MessagingApiClient({ channelAccessToken }),
  fetch: fetchContent = globalThis.fetch,
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
    getMessageContent: async messageId => {
      // SDK 11's Web-to-Node stream bridge loses reader rejections. Consume the Web body directly.
      const response = await fetchContent(
        `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${channelAccessToken}` },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!response.ok) {
        // Neither request headers nor the remote response body belongs in this error.
        const error = new Error(`LINE message content request failed (${response.status})`);
        error.status = response.status;
        response.body?.cancel().catch(() => {});
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    },
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
