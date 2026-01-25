import { SetMetadata } from "@nestjs/common";
import type { OnEventOptions } from "../interfaces/command-options.interface";
import { EVENT_METADATA } from "./metadata.keys";

export const OnEvent = (type: string | OnEventOptions): MethodDecorator => {
  const normalizedOptions: OnEventOptions =
    typeof type === "string" ? { type } : type;

  return SetMetadata(EVENT_METADATA, normalizedOptions);
};
