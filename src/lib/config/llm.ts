export const LLM_CONFIG = {
  interpretModel: "gpt-5.2",
  planModel: "gpt-5.2",
  draftModel: "gpt-5.2",
  interpretMaxTokens: 4096,
  planMaxTokens: 4096,
  draftMaxTokens: 2048,
  contextTokenBudget: 2000,
  contextMaxRequests: 10,
} as const;
