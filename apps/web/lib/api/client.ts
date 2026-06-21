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
// ---------------------------------------------------------------------------
// SSE Streaming (POST-based Server-Sent Events)
// ---------------------------------------------------------------------------

/**
 * A single SSE event parsed from the stream.
 */
export interface SseEvent {
  event: string;   // "results" | "token" | "done" | "error" | "metadata"
  data: string;    // raw JSON string for most events, plain text for "token"
}

/**
 * Async generator that reads a POST-based SSE response.
 *
 * Usage:
 * ```ts
 * for await (const event of fetchStream("/api/v1/query/stream", { query: "..." })) {
 *   if (event.event === "token") { /* append token to UI *\/ }
 * }
 * ```
 */
export async function* fetchStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildHeaders(true),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

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

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(0, "Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Flush any remaining partial event after stream ends
      if (currentEvent && currentData !== undefined) {
        yield { event: currentEvent, data: currentData };
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ") || line.startsWith("event:")) {
        currentEvent = line.startsWith("event: ") ? line.slice(7).trim() : line.slice(6).trim();
      } else if (line.startsWith("data: ") || line.startsWith("data:")) {
        currentData = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
      } else if (line === "" && currentEvent) {
        yield { event: currentEvent, data: currentData };
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

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
