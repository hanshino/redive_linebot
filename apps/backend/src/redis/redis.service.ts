import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>("redis.url");
    this.client = new Redis(redisUrl || "redis://localhost:6379");
  }

  async onModuleInit() {
    // Connection is established lazily by ioredis
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Get the underlying Redis client
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Health check - ping Redis server
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set a value in Redis
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Add member to set
   */
  async sadd(key: string, member: string): Promise<number> {
    return this.client.sadd(key, member);
  }

  /**
   * Get all members of set
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }
}
