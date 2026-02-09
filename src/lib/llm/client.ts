import OpenAI from "openai";

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

let client: OpenAI | null = null;

const getClient = () => {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LLMError("OPENAI_API_KEY is not set");
  client = new OpenAI({ apiKey });
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
  const openai = getClient();
  const response = await openai.responses.create({
    model: options.model ?? "gpt-5.2",
    instructions: options.systemPrompt,
    input: options.userMessage,
    max_output_tokens: options.maxTokens ?? 2048,
  });

  const text = response.output_text?.trim() ?? "";

  if (!text) throw new LLMError("LLM returned empty response");

  const cleaned = removeTrailingCommas(stripCodeFences(text));

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new LLMParseError("Failed to parse LLM JSON: " + message, text);
  }
}
