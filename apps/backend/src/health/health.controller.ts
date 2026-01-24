import { Controller, Get } from "@nestjs/common";
import { HealthResponse, HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    return this.healthService.check();
  }

  @Get("live")
  live(): { status: string } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
