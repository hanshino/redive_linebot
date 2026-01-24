import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, QueueOptions } from "bullmq";
import { RedisService } from "../redis/redis.service";

/**
 * Queue Service - BullMQ wrapper
 *
 * Provides a centralized service for creating and managing BullMQ queues.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    this.logger.log("Queue service initialized");
  }

  async onModuleDestroy() {
    // Gracefully close all queues
    const closePromises = Array.from(this.queues.values()).map((queue) =>
      queue.close()
    );
    await Promise.all(closePromises);
    this.logger.log("All queues closed");
  }

  /**
   * Get or create a queue
   */
  getQueue<T = any>(name: string, options?: Partial<QueueOptions>): Queue<T> {
    if (this.queues.has(name)) {
      return this.queues.get(name) as Queue<T>;
    }

    const redisConnection = this.redisService.getClient();
    const defaultOptions: QueueOptions = {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 86400, // 24 hours
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs
          age: 604800, // 7 days
        },
      },
    };

    const queue = new Queue<T>(name, {
      ...defaultOptions,
      ...options,
    });

    this.queues.set(name, queue);
    this.logger.log(`Queue created: ${name}`);

    return queue;
  }

  /**
   * Get queue by name (throws if not exists)
   */
  getExistingQueue<T = any>(name: string): Queue<T> {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue not found: ${name}`);
    }
    return queue as Queue<T>;
  }

  /**
   * Remove a queue
   */
  async removeQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.close();
      this.queues.delete(name);
      this.logger.log(`Queue removed: ${name}`);
    }
  }

  /**
   * Health check - verify queue connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can access Redis
      return await this.redisService.healthCheck();
    } catch (error) {
      this.logger.error("Queue health check failed", error);
      return false;
    }
  }
}
