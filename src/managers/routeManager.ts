/**
 * Central Route Manager
 * Manages active application views, query parameters, deep links, and browser hash navigation.
 */

export type AppRoute =
  | 'dashboard'
  | 'build'
  | 'intelligence'
  | 'system'
  | 'activity'
  // Legacy & Deep-link aliases
  | 'studio'
  | 'workspace'
  | 'quota'
  | 'roles'
  | 'jules'
  | 'auto-improve'
  | 'adaptive-llm'
  | 'github-settings';

export interface RouteState {
  currentRoute: AppRoute;
  primaryPage: 'dashboard' | 'build' | 'intelligence' | 'system' | 'activity';
  subTab?: string;
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

  public getPrimaryPage(route: AppRoute): 'dashboard' | 'build' | 'intelligence' | 'system' | 'activity' {
    switch (route) {
      case 'dashboard':
      case 'studio':
        return 'dashboard';
      case 'build':
      case 'workspace':
        return 'build';
      case 'intelligence':
      case 'jules':
      case 'auto-improve':
      case 'adaptive-llm':
        return 'intelligence';
      case 'system':
      case 'quota':
      case 'roles':
      case 'github-settings':
        return 'system';
      case 'activity':
        return 'activity';
      default:
        return 'dashboard';
    }
  }

  private parseCurrentHash(): RouteState {
    if (typeof window === 'undefined') {
      return { currentRoute: 'dashboard', primaryPage: 'dashboard', params: {} };
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

    const validRoutes: AppRoute[] = [
      'dashboard',
      'build',
      'intelligence',
      'system',
      'activity',
      'studio',
      'workspace',
      'quota',
      'roles',
      'jules',
      'auto-improve',
      'adaptive-llm',
      'github-settings',
    ];
    const currentRoute: AppRoute = validRoutes.includes(path as AppRoute)
      ? (path as AppRoute)
      : 'dashboard';

    const primaryPage = this.getPrimaryPage(currentRoute);

    return {
      currentRoute,
      primaryPage,
      subTab: params.subTab || (currentRoute !== primaryPage ? currentRoute : undefined),
      params,
    };
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

    const primaryPage = this.getPrimaryPage(route);
    this.state = {
      currentRoute: route,
      primaryPage,
      subTab: params.subTab || (route !== primaryPage ? route : undefined),
      params,
    };
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
