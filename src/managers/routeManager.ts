/**
 * Central Route Manager
 * Manages active application views, query parameters, deep links, and browser hash navigation.
 */

export type AppRoute = 'studio' | 'workspace' | 'quota' | 'roles' | 'jules';

export interface RouteState {
  currentRoute: AppRoute;
  params: Record<string, string>;
}

type RouteListener = (state: RouteState) => void;

class RouteManager {
  private listeners: Set<RouteListener> = new Set();
  private state: RouteState;

  constructor() {
    this.state = this.parseCurrentHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        this.state = this.parseCurrentHash();
        this.notify();
      });
    }
  }

  private parseCurrentHash(): RouteState {
    if (typeof window === 'undefined') {
      return { currentRoute: 'studio', params: {} };
    }

    const hash = window.location.hash.replace(/^#\/?/, '');
    const [path, queryString] = hash.split('?');
    const params: Record<string, string> = {};

    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      searchParams.forEach((val, key) => {
        params[key] = val;
      });
    }

    const validRoutes: AppRoute[] = ['studio', 'workspace', 'quota', 'roles', 'jules'];
    const currentRoute = validRoutes.includes(path as AppRoute) ? (path as AppRoute) : 'studio';

    return { currentRoute, params };
  }

  public getState(): RouteState {
    return { ...this.state, params: { ...this.state.params } };
  }

  public navigate(route: AppRoute, params: Record<string, string> = {}): void {
    const searchParams = new URLSearchParams(params);
    const paramStr = searchParams.toString();
    const newHash = `#${route}${paramStr ? `?${paramStr}` : ''}`;

    if (typeof window !== 'undefined') {
      window.location.hash = newHash;
    }

    this.state = { currentRoute: route, params };
    this.notify();
  }

  public subscribe(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn(this.getState());
      } catch (e) {
        console.error('Error in route manager listener:', e);
      }
    });
  }
}

export const routeManager = new RouteManager();
