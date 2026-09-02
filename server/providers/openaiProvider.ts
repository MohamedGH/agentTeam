import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from './types';

export class OpenAIProvider implements IAIProvider {
  public readonly id: AIProviderId = 'openai';
  public readonly name = 'OpenAI';
  public readonly defaultModel = 'gpt-4o-mini';
  public readonly sourceType = 'OpenAI API (usage.prompt_tokens & usage.completion_tokens)';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'gpt-4o', displayName: 'GPT-4o (Flagship)', contextWindow: 128000, supportsTools: true, costTier: 'pro', providerId: 'openai' },
    { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini (High Speed)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'openai' },
    { name: 'o3-mini', displayName: 'o3-mini (Reasoning)', contextWindow: 200000, supportsTools: true, costTier: 'ultra', providerId: 'openai' },
  ];

  public isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const { model, prompt, fallbackText } = options;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || fallbackText;
    const usage = data.usage;

    const promptTokens = usage?.prompt_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
    const completionTokens = usage?.completion_tokens ?? Math.max(1, Math.ceil(text.length / 4));
    const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      provider: 'openai',
      model,
      isRealProviderUsage: Boolean(usage),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }
}
