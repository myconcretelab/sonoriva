export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: Record<string, unknown>) { super(message); }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = init?.body !== undefined && init.body !== null && !(init.body instanceof FormData);
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: hasJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/api/auth/login') && typeof window !== 'undefined') window.dispatchEvent(new Event('sonoriva:session-revoked'));
    const body = await response.json().catch(() => ({ error: 'La requête a échoué.' }));
    throw new ApiError(body.error ?? 'La requête a échoué.', response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
