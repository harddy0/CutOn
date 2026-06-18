// ---------------------------------------------------------------------------
// This is the ONLY module that reads environment variables and storage keys.
// Every other module imports config from here — never process.env directly.
// ---------------------------------------------------------------------------

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL;
const RAW_TOKEN_KEY = "cuton_access_token";

if (!RAW_API_URL) {
  throw new Error(
    "Missing NEXT_PUBLIC_API_URL environment variable. " +
      "Copy .env.example to .env.local and set the backend URL."
  );
}

// ── Exported config ───────────────────────────────────────────────────────

/** Base URL of the CutOn backend API — set via NEXT_PUBLIC_API_URL. */
export const API_BASE_URL: string = RAW_API_URL;

/** localStorage key used to persist the JWT access token. */
export const TOKEN_STORAGE_KEY: string = RAW_TOKEN_KEY;

// ── Token helpers ─────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}
