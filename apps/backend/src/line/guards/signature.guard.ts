import { validateSignature } from "@line/bot-sdk";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";

/**
 * LINE Signature Guard
 *
 * Validates the X-Line-Signature header using HMAC-SHA256.
 * This guard should be applied to the webhook endpoint to ensure
 * requests are genuinely from the LINE Platform.
 *
 * Usage:
 * ```typescript
 * @UseGuards(SignatureGuard)
 * @Post('webhook')
 * async handleWebhook(@Body() body: WebhookRequestBody) { ... }
 * ```
 */
@Injectable()
export class SignatureGuard implements CanActivate {
  private readonly logger = new Logger(SignatureGuard.name);
  private readonly channelSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>("line.channelSecret");
    if (!secret) {
      throw new Error(
        "LINE_CHANNEL_SECRET is not configured. Set the LINE_CHANNEL_SECRET environment variable."
      );
    }
    this.channelSecret = secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<FastifyRequest>>();

    const signature = request.headers["x-line-signature"];

    if (!signature || typeof signature !== "string") {
      this.logger.warn("Missing X-Line-Signature header");
      throw new UnauthorizedException("Missing X-Line-Signature header");
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      this.logger.error(
        "Raw body not available. Ensure rawBody: true is set in NestFactory.create options."
      );
      throw new UnauthorizedException("Unable to verify signature");
    }

    const bodyString =
      rawBody instanceof Buffer ? rawBody.toString("utf-8") : String(rawBody);

    const isValid = validateSignature(
      bodyString,
      this.channelSecret,
      signature
    );

    if (!isValid) {
      this.logger.warn("Invalid LINE signature - request rejected");
      throw new UnauthorizedException("Invalid signature");
    }

    this.logger.debug("LINE signature validated successfully");
    return true;
  }
}
