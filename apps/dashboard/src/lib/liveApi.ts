import { useEffect, useState, useCallback } from 'react';

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('5173')
    ? window.location.origin
    : 'http://localhost:8000');

export function getSessionSecret(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="phoenix-session"]');
  return meta?.getAttribute('content') || '';
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  const sec = getSessionSecret();
  if (sec) h['X-Phoenix-Session'] = sec;
  return h;
}

export class ApiNetworkError extends Error {
  constructor(message = 'Backend unreachable') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { attachSession?: boolean } = {}
): Promise<T> {
  const { attachSession = false, headers, ...rest } = options;
  const mergedHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined)
  };
  if (attachSession) {
    const sec = getSessionSecret();
    if (sec) mergedHeaders['X-Phoenix-Session'] = sec;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers: mergedHeaders });
  } catch (err: any) {
    if (err instanceof TypeError) {
      throw new ApiNetworkError('Backend unreachable');
    }
    throw new ApiNetworkError(err?.message || 'Backend unreachable');
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const txt = await res.text();
      if (txt) {
        try {
          const j = JSON.parse(txt);
          detail = j?.detail ? `HTTP ${res.status}: ${j.detail}` : `HTTP ${res.status}: ${txt}`;
        } catch {
          detail = `HTTP ${res.status}: ${txt}`;
        }
      }
    } catch {}
    throw new ApiHttpError(res.status, detail);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      throw new Error('Invalid JSON response from backend');
    }
  }
  return res as unknown as T;
}

export const liveApi = {
  url(path: string): string {
    const sec = getSessionSecret();
    const sep = path.includes('?') ? '&' : '?';
    return sec ? `${API_BASE}${path}${sep}session=${encodeURIComponent(sec)}` : `${API_BASE}${path}`;
  },

  async get<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { attachSession: true });
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'POST',
      attachSession: true,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  },

  async del<T>(path: string): Promise<T> {
    return apiFetch<T>(path, {
      method: 'DELETE',
      attachSession: true
    });
  }
};

export function useLive<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const d = await liveApi.get<T>(path);
      setData(d);
    } catch (e: any) {
      setError(e?.message || 'Failed to load live data');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let stop = false;
    let es: EventSource | null = null;

    setLoading(true);
    liveApi
      .get<T>(path)
      .then((d) => {
        if (!stop) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: any) => {
        if (!stop) setError(e?.message || 'Failed to load live data');
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });

    try {
      es = new EventSource(liveApi.url('/live/stream'));
      es.addEventListener('snapshot', (e) => {
        if (stop) return;
        try {
          const parsed = JSON.parse((e as MessageEvent).data);
          if (parsed && parsed[path] !== undefined) {
            setData(parsed[path]);
            setError(null);
            setLoading(false);
          }
        } catch {}
      });
    } catch {}

    return () => {
      stop = true;
      es?.close();
    };
  }, [path]);

  return { data, loading, error, refresh };
}
