import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";

/**
 * Idempotency Service
 *
 * Prevents duplicate processing of LINE events using Redis.
 * Uses atomic SETNX operation with TTL.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if an event has already been processed
   * If not processed, marks it as processed atomically
   *
   * @param eventId - The unique webhook event ID
   * @returns true if event was already processed, false if it's new
   */
  async isProcessed(eventId: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const key = `line:event:${eventId}`;

    try {
      // SET key value EX ttl NX
      // Returns 'OK' if key was set (new event)
      // Returns null if key already exists (duplicate event)
      const result = await client.set(key, "1", "EX", this.TTL_SECONDS, "NX");
      
      const isDuplicate = result === null;
      
      if (isDuplicate) {
        this.logger.warn(`Duplicate event detected: ${eventId}`);
      }
      
      return isDuplicate;
    } catch (error) {
      this.logger.error(
        `Error checking idempotency for event ${eventId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fail safe: If Redis fails, assume it's NOT processed to ensure delivery
      // Potentially causing duplicate processing but avoiding data loss
      return false;
    }
  }
}
