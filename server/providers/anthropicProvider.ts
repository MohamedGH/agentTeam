import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from './types';

export class AnthropicProvider implements IAIProvider {
  public readonly id: AIProviderId = 'anthropic';
  public readonly name = 'Anthropic Claude';
  public readonly defaultModel = 'claude-3-5-sonnet-20241022';
  public readonly sourceType = 'Anthropic Messages API (input_tokens & output_tokens)';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet', contextWindow: 200000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
    { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', contextWindow: 200000, supportsTools: true, costTier: 'pro', providerId: 'anthropic' },
    { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextWindow: 200000, supportsTools: true, costTier: 'flash', providerId: 'anthropic' },
  ];

  public isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';

    if (!apiKey) {
      throw new Error('Anthropic API key is not configured');
    }

    const { model, prompt, fallbackText } = options;
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || fallbackText;
    const usage = data.usage;

    const promptTokens = usage?.input_tokens ?? Math.max(1, Math.ceil(prompt.length / 4));
    const completionTokens = usage?.output_tokens ?? Math.max(1, Math.ceil(text.length / 4));
    const totalTokens = promptTokens + completionTokens;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      provider: 'anthropic',
      model,
      isRealProviderUsage: Boolean(usage),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }
}
