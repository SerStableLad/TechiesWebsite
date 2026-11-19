import { defineMiddleware, sequence } from "astro:middleware";

import { autoSeoMiddleware } from "./middleware/auto-seo";
import { memberSettingsMiddleware } from "./plugins/members/settings";

export const onRequest = defineMiddleware(sequence(memberSettingsMiddleware, autoSeoMiddleware));
