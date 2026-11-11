export class ApiError extends Error {
  constructor(message: string, public issues: { path: string; message: string }[] = [], public status = 0) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the PromptVault server. Is it running (npm run dev)?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  // A 401 on anything but the login call means the session expired: the app shows the login screen.
  if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event('pv:unauthorized'));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.issues, res.status);
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, b?: unknown) => req<T>('POST', p, b ?? {}),
  put: <T>(p: string, b: unknown) => req<T>('PUT', p, b),
  del: (p: string) => req<void>('DELETE', p),
};
