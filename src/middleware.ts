import { defineMiddleware, sequence } from "astro:middleware";
import { memberSettingsMiddleware } from "./plugins/members/settings";
import { autoSeoMiddleware } from "./middleware/auto-seo";

export const onRequest = defineMiddleware(sequence(memberSettingsMiddleware, autoSeoMiddleware));
