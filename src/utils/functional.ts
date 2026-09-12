/**
 * Functional Programming Utilities
 * Pure functions, immutability helpers, and composable pipelines.
 */

export const pipe = <T>(...fns: Array<(arg: T) => T>) => (value: T): T =>
  fns.reduce((acc, fn) => fn(acc), value);

export const compose = <T>(...fns: Array<(arg: T) => T>) => (value: T): T =>
  fns.reduceRight((acc, fn) => fn(acc), value);

export const safeGet = <T, K extends keyof T>(obj: T | null | undefined, key: K, fallback: T[K]): T[K] => {
  if (!obj || obj[key] === undefined || obj[key] === null) {
    return fallback;
  }
  return obj[key];
};

export const formatDurationMs = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const sec = (ms / 1000).toFixed(1);
  if (Number(sec) < 60) return `${sec}s`;
  const mins = Math.floor(Number(sec) / 60);
  const remSec = (Number(sec) % 60).toFixed(0);
  return `${mins}m ${remSec}s`;
};

export const formatDate = (isoString?: string): string => {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
};

export const truncate = (str: string, maxLength = 80): string => {
  if (!str) return '';
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
};

export const normalizeSessionState = (rawState?: string): string => {
  if (!rawState) return 'QUEUED';
  const upper = rawState.toUpperCase();
  if (upper.includes('PLAN') && upper.includes('APPROVAL')) return 'AWAITING_PLAN_APPROVAL';
  if (upper.includes('PROGRESS')) return 'IN_PROGRESS';
  if (upper.includes('COMPLETE')) return 'COMPLETED';
  if (upper.includes('FAIL')) return 'FAILED';
  if (upper.includes('PAUSE')) return 'PAUSED';
  if (upper.includes('QUEUE')) return 'QUEUED';
  return upper;
};

export const sortActivitiesChronologically = <T extends { createTime?: string }>(activities: T[]): T[] => {
  return [...activities].sort((a, b) => {
    const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
    const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
    return timeA - timeB;
  });
};

export const deduplicateById = <T extends { id?: string; name?: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.id || item.name || JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
