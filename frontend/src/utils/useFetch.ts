import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../services/api';

export function useFetch<T = any>(url: string | null, params?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify([url, params]);
  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    api.get<T>(url, { params })
      .then((r) => { setData(r.data); setError(''); })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, [key]);
  useEffect(load, [load]);
  return { data, loading, error, reload: load };
}
