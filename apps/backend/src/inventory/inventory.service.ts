import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InventoryItem, ItemDefinition, ItemType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface InventoryItemWithDefinition extends InventoryItem {
  definition: ItemDefinition;
}

export interface InventoryFilters {
  type?: ItemType;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getInventory(
    userId: string,
    filters?: InventoryFilters
  ): Promise<InventoryItemWithDefinition[]> {
    return await this.prisma.inventoryItem.findMany({
      where: {
        userId,
        ...(filters?.type && {
          definition: {
            type: filters.type,
          },
        }),
      },
      include: {
        definition: true,
      },
      orderBy: [
        { definition: { rarity: "desc" } },
        { definition: { name: "asc" } },
      ],
    });
  }

  async addItem(
    userId: string,
    itemDefId: number
  ): Promise<InventoryItemWithDefinition> {
    const itemDef = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefId },
    });

    if (!itemDef) {
      throw new BadRequestException(`Item definition not found: ${itemDefId}`);
    }

    if (itemDef.maxStack > 1) {
      const existingItem = await this.prisma.inventoryItem.findFirst({
        where: { userId, itemDefId },
      });

      if (existingItem) {
        return await this.prisma.inventoryItem.update({
          where: { id: existingItem.id },
          data: { amount: { increment: 1 } },
          include: { definition: true },
        });
      }
    }

    const newItem = await this.prisma.inventoryItem.create({
      data: {
        userId,
        itemDefId,
        amount: 1,
        properties:
          itemDef.type === ItemType.CHARACTER
            ? { level: 1, rank: 1, bond: 0, star: itemDef.rarity }
            : undefined,
      },
      include: { definition: true },
    });

    this.logger.log(
      `Added ${itemDef.name} (${itemDef.type}) to ${userId} inventory`
    );

    return newItem;
  }

  async checkDuplicate(userId: string, itemDefId: number): Promise<boolean> {
    const itemDef = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefId },
      select: { maxStack: true, type: true },
    });

    if (!itemDef || itemDef.type !== ItemType.CHARACTER) {
      return false;
    }

    const existing = await this.prisma.inventoryItem.findFirst({
      where: { userId, itemDefId },
      select: { id: true },
    });

    return !!existing;
  }

  async getCharacters(userId: string): Promise<InventoryItemWithDefinition[]> {
    return await this.getInventory(userId, { type: ItemType.CHARACTER });
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { userId: true },
    });

    if (!item) {
      throw new BadRequestException("Item not found");
    }

    if (item.userId !== userId) {
      throw new BadRequestException("Item does not belong to user");
    }

    await this.prisma.inventoryItem.delete({
      where: { id: itemId },
    });

    this.logger.log(`Removed item ${itemId} from ${userId} inventory`);
  }
}
