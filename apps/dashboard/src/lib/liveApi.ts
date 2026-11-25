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

export const liveApi = {
  url(path: string): string {
    const sec = getSessionSecret();
    const sep = path.includes('?') ? '&' : '?';
    return sec ? `${API_BASE}${path}${sep}session=${encodeURIComponent(sec)}` : `${API_BASE}${path}`;
  },

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? `: ${txt}` : ''}`);
    }
    return res.json();
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? `: ${txt}` : ''}`);
    }
    return res.json();
  },

  async del<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${txt ? `: ${txt}` : ''}`);
    }
    return res.json();
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
