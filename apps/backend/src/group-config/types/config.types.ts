export interface GroupConfigData {
  features: {
    welcomeMessage: boolean;
    gacha: boolean;
    character: boolean;
    announce: boolean;
    customCommands: boolean;
    worldBoss: boolean;
    clanBattle: boolean;
    minigames: boolean;
    chatLevel: boolean;
    market: boolean;
    discordWebhook: boolean;
  };
  welcomeMessage?: string;
  commandPrefix: string;
  groupNickname?: string;
  cooldowns?: {
    gacha?: number;
    query?: number;
    minigame?: number;
    customCmd?: number;
  };
}

export const DEFAULT_CONFIG: GroupConfigData = {
  features: {
    welcomeMessage: true,
    gacha: true,
    character: true,
    announce: true,
    customCommands: true,
    worldBoss: false,
    clanBattle: false,
    minigames: false,
    chatLevel: false,
    market: false,
    discordWebhook: false,
  },
  commandPrefix: "#",
  cooldowns: {},
};

export const MIN_COOLDOWNS = {
  gacha: 30,
  query: 10,
  minigame: 30,
  customCmd: 5,
} as const;
