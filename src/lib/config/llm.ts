export const LLM_CONFIG = {
  interpretModel: "claude-sonnet-4-20250514",
  planModel: "claude-sonnet-4-20250514",
  draftModel: "claude-sonnet-4-20250514",
  interpretMaxTokens: 4096,
  planMaxTokens: 4096,
  draftMaxTokens: 2048,
  contextTokenBudget: 2000,
  contextMaxRequests: 10,
} as const;