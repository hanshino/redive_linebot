import { SetMetadata } from "@nestjs/common";
import type { CommandOptions } from "../interfaces/command-options.interface";
import { COMMAND_METADATA } from "./metadata.keys";

export const Command = (
  options: CommandOptions | string | RegExp
): MethodDecorator => {
  const normalizedOptions: CommandOptions =
    typeof options === "string" || options instanceof RegExp
      ? { command: options }
      : options;

  return SetMetadata(COMMAND_METADATA, normalizedOptions);
};
