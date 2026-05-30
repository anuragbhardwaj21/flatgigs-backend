import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!config.secrets.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.secrets.openaiApiKey });
  }
  return client;
}

export function hasOpenAI(): boolean {
  return Boolean(config.secrets.openaiApiKey);
}
