export const APP_URL = "https://trydevin.ai";

export function isDevin() {
  return process.env.IS_DEVIN === "true";
}

export function getAppName() {
  return "Try Devin";
}
