import { Controller, Injectable } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Command } from "../../src/line/commands/decorators/command.decorator";
import { OnEvent } from "../../src/line/commands/decorators/on-event.decorator";
import { Postback } from "../../src/line/commands/decorators/postback.decorator";
import { CommandDiscoveryService } from "../../src/line/commands/services/command-discovery.service";

@Injectable()
@Controller()
class MockController {
  @Command("test")
  testCommand(): void {}

  @Command({ command: "alias", aliases: ["a", "al"] })
  aliasCommand(): void {}

  @Command(/^regex\s+(.+)$/i)
  regexCommand(): void {}

  @OnEvent("follow")
  followEvent(): void {}

  @OnEvent("join")
  joinEvent(): void {}

  @Postback("buy")
  buyPostback(): void {}

  regularMethod(): void {}
}

@Injectable()
@Controller()
class DuplicateCommandController {
  @Command("test")
  duplicateCommand(): void {}
}

@Injectable()
@Controller()
class DuplicatePostbackController {
  @Postback("buy")
  duplicatePostback(): void {}
}

describe("CommandDiscoveryService", () => {
  let service: CommandDiscoveryService;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;
  let mockController: MockController;

  beforeEach(async () => {
    mockController = new MockController();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandDiscoveryService,
        {
          provide: DiscoveryService,
          useValue: {
            getControllers: vi.fn(),
          },
        },
        {
          provide: MetadataScanner,
          useValue: {
            getAllMethodNames: vi.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    service = module.get<CommandDiscoveryService>(CommandDiscoveryService);
    discoveryService = module.get<DiscoveryService>(DiscoveryService);
    metadataScanner = module.get<MetadataScanner>(MetadataScanner);
    reflector = module.get<Reflector>(Reflector);

    vi.spyOn(discoveryService, "getControllers").mockReturnValue([
      {
        instance: mockController,
      } as any,
    ]);

    vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValue([
      "testCommand",
      "aliasCommand",
      "regexCommand",
      "followEvent",
      "joinEvent",
      "buyPostback",
      "regularMethod",
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("onModuleInit", () => {
    it("should scan and register all handlers", async () => {
      await service.onModuleInit();

      expect(discoveryService.getControllers).toHaveBeenCalled();
      expect(metadataScanner.getAllMethodNames).toHaveBeenCalled();
    });
  });

  describe("findCommandHandler", () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it("should find registered string command", () => {
      const handler = service.findCommandHandler("test");

      expect(handler).toBeDefined();
      expect(handler?.methodName).toBe("testCommand");
      expect(handler?.type).toBe("command");
    });

    it("should find command by alias", () => {
      const handler1 = service.findCommandHandler("a");
      const handler2 = service.findCommandHandler("al");

      expect(handler1?.methodName).toBe("aliasCommand");
      expect(handler2?.methodName).toBe("aliasCommand");
    });

    it("should return null for unknown command", () => {
      const handler = service.findCommandHandler("unknown");

      expect(handler).toBeNull();
    });
  });

  describe("findRegexCommandHandler", () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it("should find matching regex command", () => {
      const result = service.findRegexCommandHandler("regex something");

      expect(result).toBeDefined();
      expect(result?.handler.methodName).toBe("regexCommand");
      expect(result?.match).toBeDefined();
      expect(result?.match[1]).toBe("something");
    });

    it("should return null for non-matching text", () => {
      const result = service.findRegexCommandHandler("other text");

      expect(result).toBeNull();
    });
  });

  describe("findEventHandlers", () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it("should find registered event handlers", () => {
      const followHandlers = service.findEventHandlers("follow");
      const joinHandlers = service.findEventHandlers("join");

      expect(followHandlers).toHaveLength(1);
      expect(followHandlers[0].methodName).toBe("followEvent");

      expect(joinHandlers).toHaveLength(1);
      expect(joinHandlers[0].methodName).toBe("joinEvent");
    });

    it("should return empty array for unknown event type", () => {
      const handlers = service.findEventHandlers("unknown");

      expect(handlers).toEqual([]);
    });

    it("should support multiple handlers for same event", async () => {
      @Injectable()
      @Controller()
      class MultiEventController {
        @OnEvent("follow")
        handler1(): void {}

        @OnEvent("follow")
        handler2(): void {}
      }

      const multiController = new MultiEventController();

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: multiController } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValue([
        "handler1",
        "handler2",
      ]);

      const newService = new CommandDiscoveryService(
        discoveryService,
        metadataScanner,
        reflector
      );
      await newService.onModuleInit();

      const handlers = newService.findEventHandlers("follow");
      expect(handlers).toHaveLength(2);
    });
  });

  describe("findPostbackHandler", () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it("should find registered postback handler", () => {
      const handler = service.findPostbackHandler("buy");

      expect(handler).toBeDefined();
      expect(handler?.methodName).toBe("buyPostback");
      expect(handler?.type).toBe("postback");
    });

    it("should return null for unknown postback action", () => {
      const handler = service.findPostbackHandler("unknown");

      expect(handler).toBeNull();
    });
  });

  describe("duplicate detection", () => {
    it("should throw error on duplicate command registration", async () => {
      const duplicateController = new DuplicateCommandController();

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: mockController } as any,
        { instance: duplicateController } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "testCommand",
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "duplicateCommand",
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /Duplicate command registration: "test"/
      );
    });

    it("should throw error on duplicate postback registration", async () => {
      const duplicateController = new DuplicatePostbackController();

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: mockController } as any,
        { instance: duplicateController } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "buyPostback",
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "duplicatePostback",
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /Duplicate postback registration: "buy"/
      );
    });

    it("should throw error on duplicate alias registration", async () => {
      @Injectable()
      @Controller()
      class ConflictController {
        @Command("a")
        conflictCommand(): void {}
      }

      const conflictController = new ConflictController();

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: mockController } as any,
        { instance: conflictController } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "aliasCommand",
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValueOnce([
        "conflictCommand",
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /Duplicate command registration: "a"/
      );
    });
  });

  describe("edge cases", () => {
    it("should handle controller with no decorated methods", async () => {
      @Injectable()
      @Controller()
      class EmptyController {
        regularMethod(): void {}
      }

      const emptyController = new EmptyController();

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: emptyController } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValue([
        "regularMethod",
      ]);

      const newService = new CommandDiscoveryService(
        discoveryService,
        metadataScanner,
        reflector
      );

      await expect(newService.onModuleInit()).resolves.not.toThrow();

      expect(newService.findCommandHandler("anything")).toBeNull();
    });

    it("should handle controller with null instance", async () => {
      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: null } as any,
      ]);

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it("should handle non-function methods", async () => {
      const controllerWithProperty = {
        constructor: { name: "TestController" },
        someProperty: "value",
      };

      vi.spyOn(discoveryService, "getControllers").mockReturnValue([
        { instance: controllerWithProperty } as any,
      ]);
      vi.spyOn(metadataScanner, "getAllMethodNames").mockReturnValue([
        "someProperty",
      ]);

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });
});
