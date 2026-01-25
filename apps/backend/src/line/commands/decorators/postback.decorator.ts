import { SetMetadata } from "@nestjs/common";
import type { PostbackOptions } from "../interfaces/command-options.interface";
import { POSTBACK_METADATA } from "./metadata.keys";

export const Postback = (action: string | PostbackOptions): MethodDecorator => {
  const normalizedOptions: PostbackOptions =
    typeof action === "string" ? { action } : action;

  return SetMetadata(POSTBACK_METADATA, normalizedOptions);
};
