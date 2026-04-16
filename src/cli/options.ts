import { Command } from "commander";
import type { RootOptions } from "../types/config.js";

export { RootOptions };

export function getRootOptions(cmd: Command): RootOptions {
  return cmd.optsWithGlobals<RootOptions>();
}