import fs from 'fs';
import path from 'path';
import { cloudMonitoringQuotaService } from './cloudMonitoring';

export interface QuotaLimitData {
  rpm?: number;
  tpm?: number;
  rpd?: number;
  metric?: string;
  displayName?: string;
}

export interface ModelLimits {
  [tier: string]: QuotaLimitData;
}

export interface ModelState {
  minute_start: number;
  day_start: number;
  day: string;
  rpm_used: number;
  tpm_used: number;
  rpd_used: number;
  errors_429: number;
  cooloff_until: number;
}

/**
 * QuotaManager
 * 
 * Dynamic Quota & Rate-Limit Controller.
 * - Suppresses assumed/fabricated default limits in favor of authoritative Cloud Monitoring metrics and real-time quota descriptors.
 * - Tracks rolling 60-second RPM/TPM and daily RPD per model dynamically.
 * - Enforces backoff cooldowns upon encountering 429 Rate Limits and 503 High Demand spikes.
 */
export class QuotaManager {
  private limits: Record<string, ModelLimits> = {};
  private state: Record<string, ModelState> = {};
  private quotaFilePath: string;
  private stateFilePath: string;

  constructor(quotaFile = 'quota.json', stateFile = 'quota_state.json') {
    this.quotaFilePath = path.resolve(process.cwd(), quotaFile);
    this.stateFilePath = path.resolve(process.cwd(), stateFile);

    this.state = this.loadState();
    this.loadAuthoritativeLimits();
  }

  private loadState(): Record<string, ModelState> {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.models) {
          const normalized: Record<string, ModelState> = {};
          const now = Date.now() / 1000;
          const today = new Date().toISOString().split('T')[0];
          for (const [m, data] of Object.entries(parsed.models as Record<string, any>)) {
            normalized[m] = {
              minute_start: now,
              day_start: now,
              day: today,
              rpm_used: 0,
              tpm_used: 0,
              rpd_used: data.requests || 0,
              errors_429: data.errors_429 || 0,
              cooloff_until: 0,
            };
          }
          return normalized;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[QuotaManager] Could not load state file:', e);
    }
    return {};
  }

  private saveState() {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[QuotaManager] Could not save state file:', e);
    }
  }

  private loadAuthoritativeLimits() {
    // 1. Try loading from quota_state.json if it has structured authoritative tiers
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.models) {
          for (const [model, info] of Object.entries(parsed.models as Record<string, any>)) {
            if (info.tiers) {
              this.limits[model] = this.limits[model] || {};
              for (const [tier, tData] of Object.entries(info.tiers as Record<string, any>)) {
                this.limits[model][tier] = {
                  rpm: tData.rpm,
                  tpm: tData.tpm,
                  rpd: tData.rpd,
                  metric: tData.metric,
                  displayName: tData.displayName,
                };
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[QuotaManager] Error loading tiers from quota_state.json:', e);
    }

    // 2. Load authoritative Google Service Usage limits from quota.json
    try {
      if (fs.existsSync(this.quotaFilePath)) {
        const raw = fs.readFileSync(this.quotaFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.registerLimits(parsed);
      }
    } catch (e) {
      console.warn('[QuotaManager] Error loading raw quota.json:', e);
    }
  }

  public registerLimits(quotaJson: any) {
    const metrics = quotaJson.metrics || quotaJson.consumerQuotaMetrics || [];

    for (const metric of metrics) {
      const name: string = metric.metric || metric.name || '';
      const display: string = metric.displayName || '';
      const limits = metric.consumerQuotaLimits || [];

      if (!name.includes('generate_content') && !name.includes('generate_requests_per_model')) {
        continue;
      }

      let tier = 'tier_3';
      if (name.includes('paid_tier_3') || display.toLowerCase().includes('paid tier 3')) {
        tier = 'tier_3';
      } else if (name.includes('paid_tier_2') || display.toLowerCase().includes('paid tier 2')) {
        tier = 'tier_2';
      } else if (name.includes('paid_tier') || display.toLowerCase().includes('paid tier 1')) {
        tier = 'tier_1';
      } else if (name.includes('free_tier') || display.toLowerCase().includes('free tier')) {
        tier = 'free';
      }

      for (const limit of limits) {
        const unit: string = limit.unit || '';
        const metricName: string = limit.metric || '';

        let kind: 'rpm' | 'rpd' | 'tpm' | null = null;
        if (unit.includes('/min/')) {
          kind = 'rpm';
        } else if (unit.includes('/d/')) {
          kind = 'rpd';
        } else if (metricName.toLowerCase().includes('token')) {
          kind = 'tpm';
        }

        if (!kind) continue;

        for (const bucket of limit.quotaBuckets || []) {
          const value = bucket.effectiveLimit;
          if (value === undefined || value === null) continue;

          const numValue = parseInt(value, 10);
          if (isNaN(numValue)) continue;

          const model = bucket.dimensions?.model;
          if (!model) continue;

          if (!this.limits[model]) this.limits[model] = {};
          if (!this.limits[model][tier]) this.limits[model][tier] = {};

          const current = this.limits[model][tier][kind];
          if (current === undefined || numValue > current) {
            this.limits[model][tier][kind] = numValue;
          }
        }
      }
    }
  }

  private initModel(model: string) {
    if (!this.state[model]) {
      const now = Date.now() / 1000;
      const today = new Date().toISOString().split('T')[0];

      this.state[model] = {
        minute_start: now,
        day_start: now,
        day: today,
        rpm_used: 0,
        tpm_used: 0,
        rpd_used: 0,
        errors_429: 0,
        cooloff_until: 0,
      };
    }
  }

  private refresh(model: string) {
    this.initModel(model);
    const now = Date.now() / 1000;
    const s = this.state[model];

    // RPM / TPM: 60-second rolling window
    if (now - s.minute_start >= 60) {
      s.minute_start = now;
      s.rpm_used = 0;
      s.tpm_used = 0;
    }

    // RPD: daily reset
    const currentDay = new Date().toISOString().split('T')[0];
    if (s.day !== currentDay) {
      s.day = currentDay;
      s.day_start = now;
      s.rpd_used = 0;
      this.saveState();
    }
  }

  public canUseModel(model: string, tier = 'tier_3', estimatedTokens = 1000): { ok: boolean; reason: string } {
    this.refresh(model);
    const s = this.state[model];
    const now = Date.now() / 1000;

    // Check cooldown state (from 429 or 503)
    if (now < s.cooloff_until) {
      const remainingCooldown = Math.ceil(s.cooloff_until - now);
      return { ok: false, reason: `Cooldown active (${remainingCooldown}s remaining due to 429/503)` };
    }

    const limits = this.limits[model]?.[tier] || this.limits[model]?.['tier_3'];

    // If explicit limits exist from Cloud Monitoring / quota descriptor, enforce them
    if (limits) {
      if (limits.rpm && limits.rpm > 0) {
        if (s.rpm_used >= limits.rpm) {
          return { ok: false, reason: `RPM limit reached (${s.rpm_used}/${limits.rpm})` };
        }
      }

      if (limits.tpm && limits.tpm > 0) {
        if (s.tpm_used + estimatedTokens > limits.tpm) {
          return { ok: false, reason: `Estimated TPM limit exceeded (${s.tpm_used + estimatedTokens}/${limits.tpm})` };
        }
      }

      if (limits.rpd && limits.rpd > 0) {
        if (s.rpd_used >= limits.rpd) {
          return { ok: false, reason: `RPD limit reached (${s.rpd_used}/${limits.rpd})` };
        }
      }
    }

    return { ok: true, reason: 'OK' };
  }

  public selectBestModel(preferredModels: string[], tier = 'tier_3', estimatedTokens = 1000): string | null {
    const candidates: Array<{ model: string; remaining: ReturnType<QuotaManager['getRemainingQuota']> }> = [];

    for (const model of preferredModels) {
      const { ok, reason } = this.canUseModel(model, tier, estimatedTokens);
      if (ok) {
        const remaining = this.getRemainingQuota(model, tier);
        candidates.push({ model, remaining });
      } else {
        console.log(`[QuotaManager] Model ${model} skipped: ${reason}`);
      }
    }

    if (candidates.length === 0) {
      // Return the first preferred model if all candidates are unconfigured
      return preferredModels[0] || null;
    }

    const score = (item: { model: string; remaining: any }) => {
      const q = item.remaining;
      const values = [q.remaining_rpm, q.remaining_tpm, q.remaining_rpd].filter(
        (x) => x !== null && x !== undefined && x >= 0
      );
      return values.length > 0 ? Math.min(...values) : 999999;
    };

    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0].model;
  }

  public recordUsage(model: string, usageMetadata: { totalTokenCount?: number } = {}) {
    this.refresh(model);
    const s = this.state[model];
    const total = usageMetadata.totalTokenCount || 500;

    s.rpm_used += 1;
    s.rpd_used += 1;
    s.tpm_used += total;

    this.saveState();
  }

  public handle429Error(model: string, retryAfterSeconds = 60) {
    this.initModel(model);
    const s = this.state[model];
    s.errors_429 += 1;
    s.cooloff_until = Date.now() / 1000 + retryAfterSeconds;
    this.saveState();
  }

  public handle503Error(model: string, retryAfterSeconds = 30) {
    this.initModel(model);
    const s = this.state[model];
    s.errors_429 += 1;
    s.cooloff_until = Date.now() / 1000 + retryAfterSeconds;
    this.saveState();
  }

  public isModelInCooldown(model: string): boolean {
    if (!this.state[model]) return false;
    return (Date.now() / 1000) < this.state[model].cooloff_until;
  }

  public resetState(model?: string) {
    if (model && this.state[model]) {
      const now = Date.now() / 1000;
      const today = new Date().toISOString().split('T')[0];
      this.state[model] = {
        minute_start: now,
        day_start: now,
        day: today,
        rpm_used: 0,
        tpm_used: 0,
        rpd_used: 0,
        errors_429: 0,
        cooloff_until: 0,
      };
    } else {
      this.state = {};
      for (const m of Object.keys(this.limits)) {
        this.initModel(m);
      }
    }
    this.saveState();
  }

  public getRemainingQuota(model: string, tier = 'tier_3') {
    this.refresh(model);
    const s = this.state[model];
    const limits = this.limits[model]?.[tier] || {};

    const calcRemaining = (kind: 'rpm' | 'tpm' | 'rpd', used: number) => {
      const limit = limits[kind];
      if (limit === undefined || limit < 0) return null;
      return Math.max(0, limit - used);
    };

    return {
      remaining_rpm: calcRemaining('rpm', s.rpm_used),
      remaining_tpm: calcRemaining('tpm', s.tpm_used),
      remaining_rpd: calcRemaining('rpd', s.rpd_used),
    };
  }

  public allStatus(tier = 'tier_3') {
    const result: Record<string, any> = {};
    const now = Date.now() / 1000;
    const allModels = new Set([...Object.keys(this.limits), ...Object.keys(this.state)]);

    for (const model of allModels) {
      this.refresh(model);
      const q = this.getRemainingQuota(model, tier);
      const s = this.state[model];
      const limits = this.limits[model]?.[tier] || {};

      result[model] = {
        model,
        tier,
        rpm_limit: limits.rpm,
        rpm_used: s.rpm_used,
        rpm_remaining: q.remaining_rpm,
        tpm_limit: limits.tpm,
        tpm_used: s.tpm_used,
        tpm_remaining: q.remaining_tpm,
        rpd_limit: limits.rpd,
        rpd_used: s.rpd_used,
        rpd_remaining: q.remaining_rpd,
        errors_429: s.errors_429,
        blocked: now < s.cooloff_until,
        cooloff_until: s.cooloff_until > now ? Math.ceil(s.cooloff_until - now) : 0,
      };
    }

    return result;
  }

  public async syncCloudMonitoring(forceRefresh = false) {
    try {
      const cloudMetrics = await cloudMonitoringQuotaService.fetchRealQuotaMetrics(forceRefresh);
      if (cloudMetrics && cloudMetrics.models) {
        for (const [model, mData] of Object.entries(cloudMetrics.models)) {
          if (!this.limits[model]) this.limits[model] = {};
          if (!this.limits[model]['tier_3']) this.limits[model]['tier_3'] = {};
          if (mData.rpm_limit !== undefined && mData.rpm_limit > 0) {
            this.limits[model]['tier_3'].rpm = mData.rpm_limit;
          }
          if (mData.rpd_limit !== undefined && mData.rpd_limit > 0) {
            this.limits[model]['tier_3'].rpd = mData.rpd_limit;
          }
        }
      }
      return cloudMetrics;
    } catch (e: any) {
      console.warn('[QuotaManager] syncCloudMonitoring warning:', e.message);
      return null;
    }
  }
}

export const quotaManager = new QuotaManager();
