import { messagingApi } from "@line/bot-sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * LINE Service
 *
 * Provides a wrapper around the LINE Messaging API client.
 * Handles sending reply messages and push messages.
 */
@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);
  private readonly client: messagingApi.MessagingApiClient;

  constructor(private readonly configService: ConfigService) {
    const channelAccessToken = this.configService.get<string>(
      "line.channelAccessToken"
    );

    if (!channelAccessToken) {
      this.logger.warn(
        "LINE_CHANNEL_ACCESS_TOKEN is not configured. Message sending will not work."
      );
    }

    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: channelAccessToken || "",
    });
  }

  /**
   * Send a reply message using the reply token
   *
   * @param replyToken - The reply token from the webhook event
   * @param messages - Array of message objects to send
   * @returns The API response or null if failed
   */
  async replyMessage(
    replyToken: string,
    messages: messagingApi.Message[]
  ): Promise<messagingApi.ReplyMessageResponse | null> {
    try {
      const response = await this.client.replyMessage({
        replyToken,
        messages,
      });
      this.logger.debug(`Reply message sent successfully`);
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to send reply message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Send a text reply message
   *
   * @param replyToken - The reply token from the webhook event
   * @param text - The text message to send
   * @returns The API response or null if failed
   */
  async replyText(
    replyToken: string,
    text: string
  ): Promise<messagingApi.ReplyMessageResponse | null> {
    return this.replyMessage(replyToken, [{ type: "text", text }]);
  }

  /**
   * Send a push message to a specific user, group, or room
   *
   * @param to - The user ID, group ID, or room ID
   * @param messages - Array of message objects to send
   * @returns The API response or null if failed
   */
  async pushMessage(
    to: string,
    messages: messagingApi.Message[]
  ): Promise<messagingApi.PushMessageResponse | null> {
    try {
      const response = await this.client.pushMessage({
        to,
        messages,
      });
      this.logger.debug(`Push message sent to ${to}`);
      return response;
    } catch (error) {
      this.logger.error(
        `Failed to send push message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Send a text push message
   *
   * @param to - The user ID, group ID, or room ID
   * @param text - The text message to send
   * @returns The API response or null if failed
   */
  async pushText(
    to: string,
    text: string
  ): Promise<messagingApi.PushMessageResponse | null> {
    return this.pushMessage(to, [{ type: "text", text }]);
  }

  /**
   * Get the underlying LINE Messaging API client
   * Use this for advanced operations not covered by wrapper methods
   */
  getClient(): messagingApi.MessagingApiClient {
    return this.client;
  }
}
