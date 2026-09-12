/**
 * Jules State Manager
 * Reactive state store for asynchronous Google Jules coding agent sessions, activities, and interactions.
 */

import { JulesSession, JulesActivity, CodingAgentTask } from '../types';
import { errorManager, AppError } from './errorManager';
import { deduplicateById, sortActivitiesChronologically } from '../utils/functional';

export interface JulesStoreState {
  activeSession: JulesSession | null;
  activities: JulesActivity[];
  recentSessions: JulesSession[];
  isPolling: boolean;
  pollIntervalSeconds: number;
  isStartingSession: boolean;
  isSendingMessage: boolean;
  isApprovingPlan: boolean;
  isFetching: boolean;
  error: AppError | null;
  lastUpdated: string | null;
}

type JulesStateListener = (state: JulesStoreState) => void;

const STORAGE_KEY = 'agentteam_jules_sessions_v1';

class JulesStateManager {
  private listeners: Set<JulesStateListener> = new Set();
  private timer: any = null;

  private state: JulesStoreState = {
    activeSession: null,
    activities: [],
    recentSessions: [],
    isPolling: true,
    pollIntervalSeconds: 3,
    isStartingSession: false,
    isSendingMessage: false,
    isApprovingPlan: false,
    isFetching: false,
    error: null,
    lastUpdated: null,
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.state.recentSessions = parsed.slice(0, 15);
        }
      }
    } catch (e) {
      console.warn('Failed to load Jules sessions from storage', e);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.recentSessions));
    } catch (e) {
      console.warn('Failed to persist Jules sessions', e);
    }
  }

  public getState(): JulesStoreState {
    return { ...this.state };
  }

  public subscribe(listener: JulesStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private update(partial: Partial<JulesStoreState>): void {
    this.state = { ...this.state, ...partial, lastUpdated: new Date().toISOString() };
    this.notify();
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(currentState);
      } catch (e) {
        console.error('Error in Jules state listener:', e);
      }
    });
  }

  /**
   * Start an asynchronous session (non-blocking)
   */
  public async startSession(
    task: CodingAgentTask & { prompt?: string }
  ): Promise<JulesSession | null> {
    this.update({ isStartingSession: true, error: null });

    try {
      const endpoint = task.agent === 'mock' ? '/api/coding-agents/sessions' : '/api/coding-agents/jules/sessions';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const session: JulesSession = data.session || {
        id: data.sessionId,
        name: `sessions/${data.sessionId}`,
        prompt: task.task || task.prompt || '',
        state: data.status || 'QUEUED',
        sourceContext: { source: `sources/github/${task.repository}` },
      };

      // Add to recent sessions
      const updatedRecent = [session, ...this.state.recentSessions.filter((s) => s.id !== session.id)].slice(0, 15);

      this.update({
        activeSession: session,
        recentSessions: updatedRecent,
        activities: [],
        isStartingSession: false,
      });

      this.saveToStorage();
      this.fetchActivities(session.id, task.agent);
      this.startPolling(session.id, task.agent);

      return session;
    } catch (err: any) {
      const parsedErr = errorManager.parseError(err, 'Failed to start Jules session');
      this.update({ isStartingSession: false, error: parsedErr });
      return null;
    }
  }

  /**
   * Fetch session metadata
   */
  public async fetchSession(sessionId: string, agent?: string): Promise<JulesSession | null> {
    if (!sessionId) return null;
    this.update({ isFetching: true });

    try {
      const cleanId = sessionId.replace(/^sessions\//, '');
      const endpoint = `/api/coding-agents/jules/sessions/${encodeURIComponent(cleanId)}`;
      const res = await fetch(endpoint);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const session: JulesSession = data.session || {
        id: data.sessionId || cleanId,
        name: `sessions/${cleanId}`,
        state: data.status,
        prUrl: data.prUrl,
        gitBranch: data.gitBranch,
        resultSummary: data.summary,
        prompt: '',
        sourceContext: { source: '' },
      };

      const updatedRecent = [session, ...this.state.recentSessions.filter((s) => s.id !== session.id)].slice(0, 15);

      this.update({
        activeSession: session,
        recentSessions: updatedRecent,
        isFetching: false,
      });

      this.saveToStorage();
      return session;
    } catch (err: any) {
      const parsedErr = errorManager.parseError(err, `Error fetching session ${sessionId}`);
      this.update({ isFetching: false, error: parsedErr });
      return null;
    }
  }

  /**
   * Fetch activities feed
   */
  public async fetchActivities(sessionId: string, _agent?: string): Promise<JulesActivity[]> {
    if (!sessionId) return [];

    try {
      const cleanId = sessionId.replace(/^sessions\//, '');
      const endpoint = `/api/coding-agents/jules/sessions/${encodeURIComponent(cleanId)}/activities`;
      const res = await fetch(endpoint);

      if (!res.ok) {
        return this.state.activities;
      }

      const data = await res.json();
      const newActs: JulesActivity[] = data.activities || [];
      const combined = sortActivitiesChronologically(deduplicateById([...this.state.activities, ...newActs]));

      this.update({ activities: combined });
      return combined;
    } catch (e) {
      console.warn('Could not fetch activities:', e);
      return this.state.activities;
    }
  }

  /**
   * Send a message to the in-progress Jules session
   */
  public async sendMessage(sessionId: string, message: string): Promise<boolean> {
    if (!sessionId || !message.trim()) return false;
    this.update({ isSendingMessage: true, error: null });

    try {
      const cleanId = sessionId.replace(/^sessions\//, '');
      const endpoint = `/api/coding-agents/jules/sessions/${encodeURIComponent(cleanId)}/message`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Append optimistic user activity
      const userActivity: JulesActivity = {
        id: `local_user_${Date.now()}`,
        originator: 'USER',
        actionType: 'USER_MESSAGE',
        description: message.trim(),
        createTime: new Date().toISOString(),
      };

      this.update({
        activities: [...this.state.activities, userActivity],
        isSendingMessage: false,
      });

      // Trigger immediate refresh of session & activities
      setTimeout(() => {
        this.fetchSession(sessionId);
        this.fetchActivities(sessionId);
      }, 500);

      return true;
    } catch (err: any) {
      const parsedErr = errorManager.parseError(err, 'Failed to send message to Jules');
      this.update({ isSendingMessage: false, error: parsedErr });
      return false;
    }
  }

  /**
   * Approve plan for sessions awaiting approval
   */
  public async approvePlan(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;
    this.update({ isApprovingPlan: true, error: null });

    try {
      const cleanId = sessionId.replace(/^sessions\//, '');
      const endpoint = `/api/coding-agents/jules/sessions/${encodeURIComponent(cleanId)}/approve-plan`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      if (this.state.activeSession) {
        this.update({
          activeSession: { ...this.state.activeSession, state: 'IN_PROGRESS' },
          isApprovingPlan: false,
        });
      } else {
        this.update({ isApprovingPlan: false });
      }

      // Refresh immediately
      setTimeout(() => {
        this.fetchSession(sessionId);
        this.fetchActivities(sessionId);
      }, 500);

      return true;
    } catch (err: any) {
      const parsedErr = errorManager.parseError(err, 'Failed to approve plan');
      this.update({ isApprovingPlan: false, error: parsedErr });
      return false;
    }
  }

  /**
   * Select and inspect an existing session
   */
  public selectSession(sessionId: string): void {
    const existing = this.state.recentSessions.find((s) => s.id === sessionId);
    this.update({
      activeSession: existing || null,
      activities: [],
      error: null,
    });
    this.fetchSession(sessionId);
    this.fetchActivities(sessionId);
    this.startPolling(sessionId);
  }

  public setPolling(enabled: boolean, intervalSeconds = 3): void {
    this.update({ isPolling: enabled, pollIntervalSeconds: intervalSeconds });
    if (!enabled) {
      this.stopPolling();
    } else if (this.state.activeSession) {
      this.startPolling(this.state.activeSession.id);
    }
  }

  public startPolling(sessionId: string, agent?: string): void {
    this.stopPolling();
    if (!this.state.isPolling) return;

    this.timer = setInterval(async () => {
      if (!this.state.activeSession || this.state.activeSession.id !== sessionId) {
        this.stopPolling();
        return;
      }

      await this.fetchSession(sessionId, agent);
      await this.fetchActivities(sessionId, agent);

      const state = this.state.activeSession?.state;
      // Stop polling when terminal
      if (state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED') {
        this.stopPolling();
      }
    }, this.state.pollIntervalSeconds * 1000);
  }

  public stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public clearError(): void {
    this.update({ error: null });
  }
}

export const julesStateManager = new JulesStateManager();
