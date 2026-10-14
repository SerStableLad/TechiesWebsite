import { defineMiddleware } from "astro:middleware";
import { memberSettingsMiddleware } from "./plugins/members/settings";

export const onRequest = defineMiddleware(memberSettingsMiddleware);
