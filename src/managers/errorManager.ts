/**
 * Central Error Manager
 * Provides unified error classification, friendly recovery suggestions, and telemetry.
 */

export type AppErrorCode =
  | 'API_KEY_MISSING'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_429'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export interface AppError {
  id: string;
  code: AppErrorCode;
  message: string;
  remediation?: string;
  timestamp: string;
  raw?: any;
}

type ErrorListener = (error: AppError) => void;

class ErrorManager {
  private listeners: Set<ErrorListener> = new Set();
  private recentErrors: AppError[] = [];

  public subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public parseError(err: unknown, context?: string): AppError {
    const rawMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
        ? err
        : typeof err === 'object' && err !== null && 'error' in err
        ? String((err as any).error)
        : 'An unexpected error occurred';

    let code: AppErrorCode = 'UNKNOWN';
    let remediation: string | undefined;

    const lower = rawMessage.toLowerCase();
    if (lower.includes('jules_api_key') || lower.includes('api key is missing') || lower.includes('unconfigured')) {
      code = 'API_KEY_MISSING';
      remediation = 'Define JULES_API_KEY in your server environment (.env) to connect directly to the Google Jules cloud.';
    } else if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
      code = 'RATE_LIMIT_429';
      remediation = 'Quota limit reached. Wait a few moments or switch to the hermetic Mock coding agent.';
    } else if (lower.includes('404') || lower.includes('not found')) {
      code = 'SESSION_NOT_FOUND';
      remediation = 'Verify the session ID exists or start a new asynchronous session.';
    } else if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
      code = 'NETWORK_ERROR';
      remediation = 'Check your connection to the AgentTeam backend server.';
    } else if (lower.includes('required') || lower.includes('invalid') || lower.includes('400')) {
      code = 'INVALID_PARAMS';
      remediation = 'Ensure all required fields (repository, task prompt) are filled correctly.';
    }

    const appError: AppError = {
      id: 'err_' + Math.random().toString(36).substring(2, 9),
      code,
      message: context ? `${context}: ${rawMessage}` : rawMessage,
      remediation,
      timestamp: new Date().toISOString(),
      raw: err,
    };

    this.recentErrors = [appError, ...this.recentErrors].slice(0, 50);
    this.notify(appError);
    return appError;
  }

  public getRecentErrors(): AppError[] {
    return [...this.recentErrors];
  }

  public clearErrors(): void {
    this.recentErrors = [];
  }

  private notify(error: AppError): void {
    this.listeners.forEach((fn) => {
      try {
        fn(error);
      } catch (e) {
        console.error('Error in error manager subscriber:', e);
      }
    });
  }
}

export const errorManager = new ErrorManager();
