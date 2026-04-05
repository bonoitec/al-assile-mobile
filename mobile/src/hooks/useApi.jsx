import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export function useApi() {
  const navigate = useNavigate();

  const getToken = () => localStorage.getItem('mobile_token');

  const request = useCallback(async (method, path, body = undefined) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(path, options);

    if (res.status === 401) {
      localStorage.removeItem('mobile_token');
      localStorage.removeItem('mobile_user');
      navigate('/login');
      throw new Error('Session expired. Please log in again.');
    }

    // Handle no-content responses
    if (res.status === 204) return null;

    const json = await res.json();

    if (!res.ok || json.success === false) {
      const message = json?.error || json?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }

    // Unwrap { success: true, data: ... } envelope — return payload directly
    return json.data !== undefined ? json.data : json;
  }, [navigate]);

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}
