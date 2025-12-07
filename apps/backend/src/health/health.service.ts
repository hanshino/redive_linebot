import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

export interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  services: {
    database: "healthy" | "unhealthy";
    redis: "healthy" | "unhealthy";
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async check(): Promise<HealthResponse> {
    const services = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const status =
      services.database === "healthy" && services.redis === "healthy"
        ? "ok"
        : "error";

    return {
      status,
      timestamp: new Date().toISOString(),
      services,
    };
  }

  private async checkDatabase(): Promise<"healthy" | "unhealthy"> {
    try {
      const isHealthy = await this.prisma.healthCheck();
      return isHealthy ? "healthy" : "unhealthy";
    } catch {
      return "unhealthy";
    }
  }

  private async checkRedis(): Promise<"healthy" | "unhealthy"> {
    try {
      const isHealthy = await this.redis.healthCheck();
      return isHealthy ? "healthy" : "unhealthy";
    } catch {
      return "unhealthy";
    }
  }
}
