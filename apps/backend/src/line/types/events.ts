/**
 * LINE Event Types
 *
 * Re-export types from @line/bot-sdk for type-safe event handling.
 * Using the webhook namespace for Webhook-specific event types.
 */
import { webhook } from "@line/bot-sdk";

// Re-export webhook event types
export type WebhookEvent = webhook.Event;
export type MessageEvent = webhook.MessageEvent;
export type FollowEvent = webhook.FollowEvent;
export type UnfollowEvent = webhook.UnfollowEvent;
export type JoinEvent = webhook.JoinEvent;
export type LeaveEvent = webhook.LeaveEvent;
export type MemberJoinEvent = webhook.MemberJoinedEvent;
export type MemberLeaveEvent = webhook.MemberLeftEvent;
export type PostbackEvent = webhook.PostbackEvent;
export type BeaconEvent = webhook.BeaconEvent;
export type AccountLinkEvent = webhook.AccountLinkEvent;

// Re-export source types
export type EventSource = webhook.Source;
export type UserSource = webhook.UserSource;
export type GroupSource = webhook.GroupSource;
export type RoomSource = webhook.RoomSource;

// Message content types
export type MessageContent = webhook.MessageContent;
export type TextMessageContent = webhook.TextMessageContent;
export type ImageMessageContent = webhook.ImageMessageContent;
export type VideoMessageContent = webhook.VideoMessageContent;
export type AudioMessageContent = webhook.AudioMessageContent;
export type FileMessageContent = webhook.FileMessageContent;
export type LocationMessageContent = webhook.LocationMessageContent;
export type StickerMessageContent = webhook.StickerMessageContent;

/**
 * Webhook request body structure from LINE Platform
 */
export interface WebhookRequestBody {
  /**
   * Bot's user ID that the webhook event was sent to
   */
  destination: string;

  /**
   * Array of webhook events
   */
  events: WebhookEvent[];
}
