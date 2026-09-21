import { CostSource } from './types';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const KNOWN_MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini
  'gemini-3.7-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-3.6-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-3.5-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-3.1-pro-preview': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  'gemini-3.1-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-2.5-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  'gemini-2.0-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },

  // OpenAI
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'o3-mini': { inputPerMillion: 1.10, outputPerMillion: 4.40 },

  // Anthropic
  'claude-3-7-sonnet-20250219': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.80, outputPerMillion: 4.00 },

  // Groq
  'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  'mixtral-8x7b-32768': { inputPerMillion: 0.24, outputPerMillion: 0.24 },

  // DeepSeek
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19 },

  // Mock
  'mock-fast-model': { inputPerMillion: 0, outputPerMillion: 0 },
  'mock-pro-model': { inputPerMillion: 0, outputPerMillion: 0 },
};

/**
 * Calculates model request cost based on exact model pricing registry.
 * Explicitly identifies the cost source:
 * - REAL_COST: mock models ($0) or explicit provider billed usage
 * - ESTIMATED_COST: calculated from exact model pricing table * actual token counts
 * - UNKNOWN_COST: model not in pricing table and no token data
 */
export function calculateModelCost(
  modelId: string,
  promptTokens?: number,
  completionTokens?: number,
  totalTokens?: number,
  isRealUsage = false
): { cost: number; source: CostSource } {
  // Hermetic mock models cost exactly 0 real dollars
  if (modelId.startsWith('mock-')) {
    return { cost: 0, source: 'REAL_COST' };
  }

  const pricing = KNOWN_MODEL_PRICING[modelId];
  if (!pricing) {
    if (totalTokens && totalTokens > 0) {
      // Industry standard default baseline ($0.50 per million)
      return { cost: Math.round(((totalTokens / 1_000_000) * 0.50) * 1_000_000) / 1_000_000, source: 'ESTIMATED_COST' };
    }
    return { cost: 0, source: 'UNKNOWN_COST' };
  }

  const pTokens = promptTokens ?? (totalTokens ? Math.round(totalTokens * 0.4) : 0);
  const cTokens = completionTokens ?? (totalTokens ? Math.round(totalTokens * 0.6) : 0);

  if (pTokens === 0 && cTokens === 0) {
    return { cost: 0, source: 'UNKNOWN_COST' };
  }

  const cost = (pTokens / 1_000_000) * pricing.inputPerMillion + (cTokens / 1_000_000) * pricing.outputPerMillion;
  return {
    cost: Math.round(cost * 1_000_000) / 1_000_000,
    source: isRealUsage && promptTokens !== undefined && completionTokens !== undefined ? 'REAL_COST' : 'ESTIMATED_COST',
  };
}
