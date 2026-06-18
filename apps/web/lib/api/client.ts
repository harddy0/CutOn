import { API_BASE_URL, getAccessToken } from "./config";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

interface RequestOptions {
  /** Query params appended to the URL */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** AbortSignal for cancelling the request */
  signal?: AbortSignal;
}

interface JsonRequestOptions extends RequestOptions {
  body?: unknown;
}

interface MultipartRequestOptions extends RequestOptions {
  body: FormData;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== null && val !== undefined) url.searchParams.set(key, String(val));
    });
  }
  return url.toString();
}

function buildHeaders(auth?: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: unknown;
    try {
      const body = await response.json();
      detail = body.detail ?? body;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }
  // 204 No Content
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API — reusable fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Reusable fetch wrapper.
 *
 * Supports:
 * - JSON requests  — use `api.get / post / patch / delete_`
 * - Multipart/form — use `api.multipart`
 * - Query params   — pass `params` in opts
 * - Auth injection — pass `auth: true` to attach Bearer token
 *
 * Config (base URL, token storage) is managed centrally in `config.ts`.
 * Individual API callers (e.g. `auth.ts`) never touch env vars directly.
 */
export const api = {
  // -- JSON ---------------------------------------------------------------

  async get<T = unknown>(path: string, opts: RequestOptions & { auth?: boolean } = {}): Promise<T> {
    const url = buildUrl(path, opts.params);
    const response = await fetch(url, {
      method: "GET",
      headers: { ...buildHeaders(opts.auth) },
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, opts: JsonRequestOptions & { auth?: boolean } = {}): Promise<T> {
    const url = buildUrl(path, opts.params);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildHeaders(opts.auth) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async patch<T = unknown>(path: string, opts: JsonRequestOptions & { auth?: boolean } = {}): Promise<T> {
    const url = buildUrl(path, opts.params);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildHeaders(opts.auth) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async delete_<T = unknown>(path: string, opts: RequestOptions & { auth?: boolean } = {}): Promise<T> {
    const url = buildUrl(path, opts.params);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { ...buildHeaders(opts.auth) },
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  // -- Multipart ----------------------------------------------------------

  async multipart<T = unknown>(method: "POST" | "PATCH", path: string, opts: MultipartRequestOptions & { auth?: boolean }): Promise<T> {
    const url = buildUrl(path, opts.params);
    const response = await fetch(url, {
      method,
      headers: { ...buildHeaders(opts.auth) }, // no Content-Type — fetch sets it with boundary
      body: opts.body,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },
};
