import fs from 'fs';
import path from 'path';
import { JulesActivity, JulesSessionState } from './types';

/**
 * StoredCodingSession
 * Persistent representation of an autonomous coding agent session.
 */
export interface StoredCodingSession {
  sessionId: string;
  agentId: string;
  repository: string;
  branch: string;
  task: string;
  status: JulesSessionState;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  prUrl?: string;
  gitBranch?: string;
  title?: string;
  summary?: string;
  activities?: JulesActivity[];
  metadata?: Record<string, any>;
}

/**
 * ICodingAgentSessionStore
 * 
 * Abstract contract for coding agent session persistence.
 * Decouples JulesAgent and CodingAgentManager from storage backends,
 * allowing instant replacement with Redis, SQLite, PostgreSQL, or DynamoDB
 * without changing any agent implementation code.
 */
export interface ICodingAgentSessionStore {
  saveSession(session: StoredCodingSession): Promise<StoredCodingSession>;
  getSession(sessionId: string): Promise<StoredCodingSession | null>;
  updateSession(
    sessionId: string,
    updates: Partial<StoredCodingSession>
  ): Promise<StoredCodingSession | null>;
  listSessions(agentId?: string): Promise<StoredCodingSession[]>;
  saveActivities(sessionId: string, activities: JulesActivity[]): Promise<void>;
  getActivities(sessionId: string, sinceIsoTimestamp?: string): Promise<JulesActivity[]>;
  deleteSession?(sessionId: string): Promise<boolean>;
}

/**
 * FileBackedCodingAgentSessionStore
 * 
 * Production-ready server store combining in-memory low-latency cache
 * with local file durability to guarantee sessions persist across server restarts.
 * Requires NO external database setup or cloud credentials.
 */
export class FileBackedCodingAgentSessionStore implements ICodingAgentSessionStore {
  private cache: Map<string, StoredCodingSession> = new Map();
  private storageFilePath: string;
  private isLoaded = false;

  constructor(customFilePath?: string) {
    const dataDir = path.resolve(process.cwd(), 'data');
    this.storageFilePath = customFilePath || path.join(dataDir, 'coding_agent_sessions.json');
    this.loadFromDisk();
  }

  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err: any) {
        console.warn(`[SessionStore] Could not create directory ${dir}:`, err.message);
      }
    }
  }

  private loadFromDisk(): void {
    if (this.isLoaded) return;
    try {
      this.ensureDirectoryExists(this.storageFilePath);
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        if (raw.trim()) {
          const sessions: StoredCodingSession[] = JSON.parse(raw);
          if (Array.isArray(sessions)) {
            for (const s of sessions) {
              if (s && s.sessionId) {
                this.cache.set(s.sessionId, s);
              }
            }
          }
        }
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.warn(`[SessionStore] Failed to load sessions from ${this.storageFilePath}:`, err.message);
      this.isLoaded = true;
    }
  }

  private flushToDisk(): void {
    try {
      this.ensureDirectoryExists(this.storageFilePath);
      const allSessions = Array.from(this.cache.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(allSessions, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[SessionStore] Failed to flush sessions to ${this.storageFilePath}:`, err.message);
    }
  }

  public async saveSession(session: StoredCodingSession): Promise<StoredCodingSession> {
    this.loadFromDisk();
    const existing = this.cache.get(session.sessionId);
    const merged: StoredCodingSession = {
      ...existing,
      ...session,
      updatedAt: new Date().toISOString(),
      activities: session.activities || existing?.activities || [],
    };
    this.cache.set(session.sessionId, merged);
    this.flushToDisk();
    return merged;
  }

  public async getSession(sessionId: string): Promise<StoredCodingSession | null> {
    this.loadFromDisk();
    const cleanId = sessionId.replace(/^sessions\//, '');
    return this.cache.get(cleanId) || this.cache.get(sessionId) || null;
  }

  public async updateSession(
    sessionId: string,
    updates: Partial<StoredCodingSession>
  ): Promise<StoredCodingSession | null> {
    this.loadFromDisk();
    const cleanId = sessionId.replace(/^sessions\//, '');
    const current = this.cache.get(cleanId) || this.cache.get(sessionId);
    if (!current) {
      return null;
    }

    const updated: StoredCodingSession = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status && updates.status !== current.status) {
      updated.lastActivityAt = new Date().toISOString();
    }

    this.cache.set(current.sessionId, updated);
    this.flushToDisk();
    return updated;
  }

  public async listSessions(agentId?: string): Promise<StoredCodingSession[]> {
    this.loadFromDisk();
    const all = Array.from(this.cache.values());
    const filtered = agentId ? all.filter((s) => s.agentId === agentId) : all;
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async saveActivities(sessionId: string, newActivities: JulesActivity[]): Promise<void> {
    this.loadFromDisk();
    const cleanId = sessionId.replace(/^sessions\//, '');
    const session = this.cache.get(cleanId) || this.cache.get(sessionId);
    if (!session) return;

    const existingActivities = session.activities || [];
    const seenIds = new Set(existingActivities.map((a) => a.id || a.name || `${a.createTime}_${a.description}`));

    for (const act of newActivities) {
      const idKey = act.id || act.name || `${act.createTime}_${act.description}`;
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        existingActivities.push(act);
      }
    }

    // Sort chronologically
    existingActivities.sort((a, b) => {
      const tA = a.createTime ? new Date(a.createTime).getTime() : 0;
      const tB = b.createTime ? new Date(b.createTime).getTime() : 0;
      return tA - tB;
    });

    session.activities = existingActivities;
    if (newActivities.length > 0) {
      session.lastActivityAt = new Date().toISOString();
      session.updatedAt = new Date().toISOString();
    }

    this.cache.set(session.sessionId, session);
    this.flushToDisk();
  }

  public async getActivities(sessionId: string, sinceIsoTimestamp?: string): Promise<JulesActivity[]> {
    this.loadFromDisk();
    const cleanId = sessionId.replace(/^sessions\//, '');
    const session = this.cache.get(cleanId) || this.cache.get(sessionId);
    if (!session || !session.activities) {
      return [];
    }

    if (!sinceIsoTimestamp) {
      return [...session.activities];
    }

    const sinceTime = new Date(sinceIsoTimestamp).getTime();
    return session.activities.filter((a) => {
      if (!a.createTime) return true;
      return new Date(a.createTime).getTime() > sinceTime;
    });
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    this.loadFromDisk();
    const cleanId = sessionId.replace(/^sessions\//, '');
    const existed = this.cache.delete(cleanId) || this.cache.delete(sessionId);
    if (existed) {
      this.flushToDisk();
    }
    return existed;
  }
}
