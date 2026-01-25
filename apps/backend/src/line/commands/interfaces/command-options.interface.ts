/**
 * Options for @Command decorator
 */
export interface CommandOptions {
  /**
   * Command keyword or regex pattern
   * Examples: '抽', /^抽\*(\d+)?$/
   */
  command: string | RegExp;

  /**
   * Command aliases
   * Examples: ['gacha', 'draw']
   */
  aliases?: string[];

  /**
   * Command description (for help command)
   */
  description?: string;

  /**
   * Whether command requires prefix (default: true)
   * If false, command will match without prefix
   */
  prefix?: boolean;

  /**
   * Command priority for conflict resolution
   * Higher priority takes precedence (default: 0)
   */
  priority?: number;
}

/**
 * Options for @OnEvent decorator
 */
export interface OnEventOptions {
  /**
   * LINE event type
   * Examples: 'follow', 'join', 'message'
   */
  type: string;

  /**
   * Event description
   */
  description?: string;
}

/**
 * Options for @Postback decorator
 */
export interface PostbackOptions {
  /**
   * Postback action to match
   * Matches against data="action=value"
   */
  action: string;

  /**
   * Postback description
   */
  description?: string;
}
