import { definePlugin } from "emdash";

export function createPlugin(options: { adminEntry: string }) {
  return definePlugin({
    id: "techies-pages", version: "0.1.0",
    admin: { entry: options.adminEntry },
  });
}
