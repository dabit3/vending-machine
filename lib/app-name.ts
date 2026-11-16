export const APP_URL = "https://trydevin.ai";
export const DEFAULT_EVENT_SUPPORT_EMAIL = "support@cognition.ai";

export function isDevin() {
  return process.env.IS_DEVIN === "true";
}

export function getAppName() {
  return "Try Devin";
}
