import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
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
