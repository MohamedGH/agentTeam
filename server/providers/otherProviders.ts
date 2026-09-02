import { IAIProvider, AIProviderId, ProviderModelConfig, GenerateOptions, GenerationUsageResult, TokenCountResult } from './types';

export class GroqProvider implements IAIProvider {
  public readonly id: AIProviderId = 'groq';
  public readonly name = 'Groq Cloud';
  public readonly defaultModel = 'llama-3.3-70b-versatile';
  public readonly sourceType = 'Groq LPU Inference (Real-Time Usage)';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B (Versatile)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
    { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Instant)', contextWindow: 128000, supportsTools: true, costTier: 'flash', providerId: 'groq' },
    { name: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B', contextWindow: 32768, supportsTools: true, costTier: 'flash', providerId: 'groq' },
  ];

  public isConfigured(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key is not configured');
    }

    const { model, prompt, fallbackText } = options;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
      throw new Error(`Groq API error (${res.status}): ${errText}`);
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
      provider: 'groq',
      model,
      isRealProviderUsage: Boolean(usage),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }
}

export class DeepSeekProvider implements IAIProvider {
  public readonly id: AIProviderId = 'deepseek';
  public readonly name = 'DeepSeek';
  public readonly defaultModel = 'deepseek-chat';
  public readonly sourceType = 'DeepSeek API (Usage Metadata)';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    { name: 'deepseek-chat', displayName: 'DeepSeek-V3', contextWindow: 64000, supportsTools: true, costTier: 'flash', providerId: 'deepseek' },
    { name: 'deepseek-reasoner', displayName: 'DeepSeek-R1 (Reasoning)', contextWindow: 64000, supportsTools: true, costTier: 'pro', providerId: 'deepseek' },
  ];

  public isConfigured(): boolean {
    return Boolean(process.env.DEEPSEEK_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    const { model, prompt, fallbackText } = options;
    const res = await fetch('https://api.deepseek.com/chat/completions', {
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
      throw new Error(`DeepSeek API error (${res.status}): ${errText}`);
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
      provider: 'deepseek',
      model,
      isRealProviderUsage: Boolean(usage),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }
}

export class CustomProvider implements IAIProvider {
  public readonly id: AIProviderId = 'custom';
  public readonly name = 'Custom / Local (Ollama)';
  public readonly defaultModel = process.env.CUSTOM_AI_MODEL || 'llama3:latest';
  public readonly sourceType = 'Self-Hosted / Local OpenAI-Compatible Endpoint';
  public readonly tokenCounterSupported = true;

  public readonly models: ProviderModelConfig[] = [
    {
      name: process.env.CUSTOM_AI_MODEL || 'llama3:latest',
      displayName: 'Custom Model Endpoint',
      contextWindow: 32768,
      supportsTools: true,
      costTier: 'custom',
      providerId: 'custom',
    },
  ];

  public isConfigured(): boolean {
    return Boolean(process.env.CUSTOM_AI_BASE_URL || process.env.CUSTOM_AI_API_KEY);
  }

  public async generateContent(options: GenerateOptions): Promise<GenerationUsageResult> {
    const baseUrl = process.env.CUSTOM_AI_BASE_URL || 'http://localhost:11434/v1';
    const apiKey = process.env.CUSTOM_AI_API_KEY || 'ollama';

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
      throw new Error(`Custom AI endpoint error (${res.status}): ${errText}`);
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
      provider: 'custom',
      model,
      isRealProviderUsage: Boolean(usage),
    };
  }

  public async countTokens(model: string, text: string): Promise<TokenCountResult> {
    return { tokenCount: Math.max(1, Math.ceil(text.length / 4)), isRealProvider: false };
  }
}
