import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { validateSignature } from "@line/bot-sdk";
import type { FastifyRequestWithRawBody } from "../types/events";

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
      .getRequest<
        {
          headers: Record<string, string | string[] | undefined>;
        } & FastifyRequestWithRawBody
      >();

    // Get the signature from the header
    const signature = request.headers["x-line-signature"];

    if (!signature || typeof signature !== "string") {
      this.logger.warn("Missing X-Line-Signature header");
      throw new UnauthorizedException("Missing X-Line-Signature header");
    }

    // Get the raw body for signature verification
    const rawBody = request.rawBody;

    if (!rawBody) {
      this.logger.error(
        "Raw body not available. Ensure raw body parsing is enabled."
      );
      throw new UnauthorizedException("Unable to verify signature");
    }

    // Convert Buffer to string if necessary
    const bodyString =
      rawBody instanceof Buffer ? rawBody.toString("utf-8") : String(rawBody);

    // Validate the signature using LINE SDK's function
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
