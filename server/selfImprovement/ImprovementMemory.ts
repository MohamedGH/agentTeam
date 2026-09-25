import fs from 'fs';
import path from 'path';
import {
  ImprovementMemoryRecord,
  DetectedProblem,
  ImprovementPlan,
  FileModificationRecord,
  TestMetric,
  EvaluationResult,
  ObservationSnapshot,
} from './types';

export class ImprovementMemory {
  private memoryFile: string;
  private records: Map<string, ImprovementMemoryRecord> = new Map();

  constructor(memoryFile?: string) {
    this.memoryFile =
      memoryFile || path.join(process.cwd(), 'data', 'self_improvement_memory.json');
    this.load();
  }

  /**
   * Persist a full cycle improvement record to durable memory.
   */
  public record(data: {
    cycleId: string;
    problem: DetectedProblem;
    plan: ImprovementPlan;
    modifiedFiles: FileModificationRecord[];
    tests: TestMetric;
    evaluation: EvaluationResult;
    outcome: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
    rolledBack: boolean;
    metricsBefore: ObservationSnapshot;
    metricsAfter?: ObservationSnapshot;
    gitDelivery?: {
      delivered: boolean;
      commitSha?: string;
      pullRequestUrl?: string;
      branch?: string;
    };
  }): ImprovementMemoryRecord {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rec: ImprovementMemoryRecord = {
      id,
      cycleId: data.cycleId,
      timestamp: new Date().toISOString(),
      problem: data.problem,
      plan: data.plan,
      modifiedFiles: data.modifiedFiles,
      tests: data.tests,
      evaluation: data.evaluation,
      outcome: data.outcome,
      rolledBack: data.rolledBack,
      metricsBefore: data.metricsBefore,
      metricsAfter: data.metricsAfter,
      gitDelivery: data.gitDelivery,
    };

    this.records.set(id, rec);
    this.save();
    return rec;
  }

  /**
   * Check if an improvement with the same problem title or suggested fix was already rejected.
   * Prevents infinite loops of re-proposing the exact same failed fix.
   */
  public isRecentlyRejected(problemTitle: string, suggestedFix?: string, limitCount = 5): boolean {
    const recent = this.getAllRecords().slice(0, limitCount);
    return recent.some((r) => {
      if (r.outcome === 'SUCCESS') return false;
      const titleMatch = r.problem.title.toLowerCase().trim() === problemTitle.toLowerCase().trim();
      if (!suggestedFix) return titleMatch;
      const fixMatch =
        r.problem.suggestedFix.toLowerCase().trim() === suggestedFix.toLowerCase().trim() ||
        r.plan.title.toLowerCase().trim() === suggestedFix.toLowerCase().trim();
      return titleMatch && fixMatch;
    });
  }

  /**
   * Count how many times an improvement for a given problem title has been attempted.
   */
  public getAttemptCount(problemTitle: string): number {
    const normalized = problemTitle.toLowerCase().trim();
    let count = 0;
    for (const r of this.records.values()) {
      if (r.problem.title.toLowerCase().trim() === normalized) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if a problem has reached the maximum permitted attempts.
   */
  public hasExceededMaxAttempts(problemTitle: string, maxAttempts: number = 3): boolean {
    return this.getAttemptCount(problemTitle) >= maxAttempts;
  }

  /**
   * Retrieve all historically successful improvements.
   */
  public findSuccessfulImprovements(): ImprovementMemoryRecord[] {
    return this.getAllRecords().filter((r) => r.outcome === 'SUCCESS');
  }

  /**
   * Retrieve all failed / rolled-back improvements.
   */
  public findFailedImprovements(): ImprovementMemoryRecord[] {
    return this.getAllRecords().filter((r) => r.outcome === 'FAILED' || r.outcome === 'ROLLED_BACK');
  }

  public getRecord(id: string): ImprovementMemoryRecord | undefined {
    return this.records.get(id);
  }

  public getAllRecords(): ImprovementMemoryRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public clearMemory(): void {
    this.records.clear();
    try {
      if (fs.existsSync(this.memoryFile)) {
        fs.unlinkSync(this.memoryFile);
      }
    } catch {
      // ignore
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.memoryFile)) {
        const raw = fs.readFileSync(this.memoryFile, 'utf8');
        const parsed = JSON.parse(raw) as ImprovementMemoryRecord[];
        for (const item of parsed) {
          this.records.set(item.id, item);
        }
      }
    } catch {
      // ignore
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.memoryFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = this.getAllRecords().slice(0, 100);
      fs.writeFileSync(this.memoryFile, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
}

export const improvementMemory = new ImprovementMemory();
