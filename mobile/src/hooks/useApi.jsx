import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function useApi() {
  const navigate = useNavigate();
  const navigatingToLoginRef = useRef(false);

  const request = useCallback(async (method, path, body = undefined) => {
    const token = localStorage.getItem('mobile_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body !== undefined) options.body = JSON.stringify(body);

    const res = await fetch(path, options);

    if (res.status === 401) {
      // Prevent navigation loop: only navigate once per unauthorized batch
      if (!navigatingToLoginRef.current) {
        navigatingToLoginRef.current = true;
        localStorage.removeItem('mobile_token');
        localStorage.removeItem('mobile_user');
        navigate('/login', { replace: true });
        setTimeout(() => { navigatingToLoginRef.current = false; }, 1000);
      }
      throw new Error('Session expired. Please log in again.');
    }

    if (res.status === 204) return null;

    const json = await res.json();

    if (!res.ok || json.success === false) {
      const message = json?.error || json?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }

    return json.data !== undefined ? json.data : json;
  }, [navigate]);

  // Memoize the returned object so its reference is stable across renders.
  // This prevents effects that depend on `api` from re-running infinitely.
  return useMemo(() => ({
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  }), [request]);
}
