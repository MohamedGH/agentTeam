import fs from 'fs';
import path from 'path';
import { ImprovementPlan, ExecutionResult, FileModificationRecord } from './types';

export interface FileBackup {
  backupId: string;
  timestamp: string;
  files: Map<string, string | null>; // null indicates file did not exist before
}

export class ImprovementExecutor {
  private backups: Map<string, FileBackup> = new Map();
  private backupBaseDir: string;

  constructor(backupBaseDir?: string) {
    this.backupBaseDir =
      backupBaseDir || path.join(process.cwd(), 'data', 'self_improvement_backups');
  }

  /**
   * Validate that the target path does not escape the allowed workspace (Path Traversal Protection).
   */
  public validatePathSafety(workingDirectory: string, relativePath: string): string {
    const resolvedBase = path.resolve(workingDirectory);
    const resolvedTarget = path.resolve(resolvedBase, relativePath);

    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      throw new Error(
        `Path traversal detected: '${relativePath}' escapes workspace '${workingDirectory}'`
      );
    }

    if (relativePath.includes('..')) {
      // double check
      const normalized = path.normalize(relativePath);
      if (normalized.startsWith('..')) {
        throw new Error(`Path traversal attempt detected with parent directory: '${relativePath}'`);
      }
    }

    return resolvedTarget;
  }

  /**
   * Execute an improvement plan within the specified working directory.
   */
  public async execute(
    plan: ImprovementPlan,
    workingDirectory: string = process.cwd(),
    customModifier?: (file: string, content: string) => Promise<string> | string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const resolvedDir = path.resolve(workingDirectory);

    if (!fs.existsSync(resolvedDir)) {
      return {
        success: false,
        planId: plan.id,
        appliedSteps: 0,
        totalSteps: plan.steps.length,
        modifiedFiles: [],
        backupId,
        error: `Workspace does not exist: ${workingDirectory}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Verify safety of all target files & create backup snapshot
    const backup: FileBackup = {
      backupId,
      timestamp: new Date().toISOString(),
      files: new Map(),
    };

    try {
      for (const file of plan.targetFiles) {
        const fullPath = this.validatePathSafety(resolvedDir, file);
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            backup.files.set(file, content);
          } catch {
            backup.files.set(file, null);
          }
        } else {
          backup.files.set(file, null);
        }
      }
    } catch (pathErr: any) {
      return {
        success: false,
        planId: plan.id,
        appliedSteps: 0,
        totalSteps: plan.steps.length,
        modifiedFiles: [],
        backupId,
        error: pathErr.message,
        durationMs: Date.now() - startTime,
      };
    }

    this.backups.set(backupId, backup);

    const modifiedFiles: FileModificationRecord[] = [];
    let appliedSteps = 0;

    try {
      for (const step of plan.steps) {
        const fullPath = this.validatePathSafety(resolvedDir, step.targetFile);
        const fileDir = path.dirname(fullPath);

        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        if (step.action === 'DELETE') {
          if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { force: true });
            modifiedFiles.push({ file: step.targetFile, action: 'DELETED' });
          }
        } else if (step.action === 'CREATE') {
          const content =
            step.contentOrPatch ||
            `// Created by SelfImprovementEngine: ${step.description}\n`;
          fs.writeFileSync(fullPath, content, 'utf8');
          modifiedFiles.push({ file: step.targetFile, action: 'CREATED' });
        } else {
          // MODIFY or PATCH
          const original = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
          let newContent = original;

          if (customModifier) {
            newContent = await customModifier(step.targetFile, original);
          } else if (step.contentOrPatch) {
            newContent = step.contentOrPatch;
          } else {
            // Default sanitize / patch action
            newContent = this.applyDefaultSanitization(step.targetFile, original, plan);
          }

          if (newContent !== original) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
            modifiedFiles.push({
              file: step.targetFile,
              action: original ? 'MODIFIED' : 'CREATED',
            });
          }
        }

        appliedSteps++;
      }

      return {
        success: true,
        planId: plan.id,
        appliedSteps,
        totalSteps: plan.steps.length,
        modifiedFiles,
        backupId,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      // If error occurs, automatically trigger rollback
      await this.rollback(backupId, resolvedDir);

      return {
        success: false,
        planId: plan.id,
        appliedSteps,
        totalSteps: plan.steps.length,
        modifiedFiles: [],
        backupId,
        error: `Execution failed: ${err.message}. Changes rolled back.`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Revert all changes associated with a backup snapshot.
   */
  public async rollback(
    backupId: string,
    workingDirectory: string = process.cwd()
  ): Promise<boolean> {
    const backup = this.backups.get(backupId);
    if (!backup) return false;

    const resolvedDir = path.resolve(workingDirectory);

    for (const [file, originalContent] of backup.files.entries()) {
      try {
        const fullPath = this.validatePathSafety(resolvedDir, file);

        if (originalContent === null) {
          // File did not exist before; remove it
          if (fs.existsSync(fullPath)) {
            try {
              fs.rmSync(fullPath, { force: true });
            } catch {
              // ignore
            }
          }
        } else {
          // Restore original content
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, originalContent, 'utf8');
        }
      } catch {
        // Continue restoring other files
      }
    }

    return true;
  }

  public getBackup(backupId: string): FileBackup | undefined {
    return this.backups.get(backupId);
  }

  private applyDefaultSanitization(
    file: string,
    content: string,
    plan: ImprovementPlan
  ): string {
    // If security issue with hardcoded token, sanitize
    if (
      plan.problemTitle.toLowerCase().includes('secret') ||
      plan.problemTitle.toLowerCase().includes('credential')
    ) {
      return content.replace(
        /(?:api[_-]?key|secret[_-]?key|private[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{16,}['"]/gi,
        (match) => {
          const prefix = match.split(/[:=]/)[0];
          return `${prefix}: process.env.API_KEY || ''`;
        }
      );
    }

    // Default: append improvement comment header if not already present
    if (!content.includes('Auto-Improved by SelfImprovementEngine')) {
      return `// [Auto-Improved by SelfImprovementEngine: ${plan.title}]\n${content}`;
    }

    return content;
  }
}

export const improvementExecutor = new ImprovementExecutor();
