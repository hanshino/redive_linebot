import { GachaPool, GachaPoolItem, ItemDefinition } from "@prisma/client";

export interface PoolConfig {
  cost: number;
  ceil: number;
  exchangeItems?: number[];
  conversionRate: Record<string, number>;
  pointExpiry?: {
    enabled: boolean;
    rate: number;
  };
}

export interface GachaPoolItemWithDef extends GachaPoolItem {
  item: ItemDefinition;
}

export interface GachaPoolWithItems extends GachaPool {
  items: GachaPoolItemWithDef[];
}

export interface DrawnItem {
  itemDefId: number;
  name: string;
  rarity: number;
  isPickup: boolean;
}

export interface ProcessedDrawResult extends DrawnItem {
  isDuplicate: boolean;
  stoneConverted: number;
}

export interface GachaDrawResult {
  items: ProcessedDrawResult[];
  totalCost: number;
  newCeilingPoints: number;
  remainingJewels: number;
}

export interface CeilingProgress {
  points: number;
  totalDraws: number;
  maxPoints: number;
}
