import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({ logger: true });

  // Enable raw body parsing for LINE signature verification
  // The raw body is needed to verify the HMAC-SHA256 signature
  fastifyAdapter
    .getInstance()
    .addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body: Buffer, done) => {
        // Attach raw body to request for signature verification
        (req as unknown as { rawBody: Buffer }).rawBody = body;
        try {
          const json = JSON.parse(body.toString());
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter
  );

  // Enable CORS for frontend development
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  });

  const port = process.env.BACKEND_PORT ?? 3000;

  // Important: bind to 0.0.0.0 for Docker compatibility
  await app.listen(port, "0.0.0.0");

  console.log(`🚀 Backend is running on: http://localhost:${port}`);
}

bootstrap();
