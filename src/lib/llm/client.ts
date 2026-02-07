import Anthropic from "@anthropic-ai/sdk";

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

export class LLMParseError extends LLMError {
  rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "LLMParseError";
    this.rawText = rawText;
  }
}

let client: Anthropic | null = null;

const getClient = () => {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LLMError("ANTHROPIC_API_KEY is not set");
  client = new Anthropic({ apiKey });
  return client;
};

const stripCodeFences = (text: string) => {
  const trimmed = text.trim();
  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
};

const removeTrailingCommas = (text: string) => {
  return text.replace(/,\s*([}\]])/g, "$1");
};

export async function callLLM<T>(options: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: options.model ?? "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens ?? 2048,
    system: options.systemPrompt,
    messages: [{ role: "user", content: options.userMessage }],
  });

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!text) throw new LLMError("LLM returned empty response");

  const cleaned = removeTrailingCommas(stripCodeFences(text));

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new LLMParseError("Failed to parse LLM JSON: " + message, text);
  }
}