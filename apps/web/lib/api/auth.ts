import { api } from "./client";
import { setAccessToken } from "./config";
import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  AuthResponse,
  UserResponse,
} from "./dto";

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export interface LoginResult {
  accessToken: string;
  /** The full user object is only available if /auth/me was fetched after login */
  user?: UserResponse;
}

/**
 * Authenticate with email + password.
 * On success the access token is stored in localStorage automatically.
 */
export async function login(data: LoginRequest): Promise<LoginResult> {
  const res = await api.post<TokenResponse>("/api/v1/auth/login", {
    body: data,
  });

  setAccessToken(res.access_token);

  // Try to fetch the user profile immediately
  let user: UserResponse | undefined;
  try {
    user = await getMe();
  } catch {
    // Me endpoint may fail if the token isn't immediately valid on the backend
    // That's fine — the caller still has the token
  }

  return { accessToken: res.access_token, user };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export interface RegisterResult {
  user: AuthResponse;
}

/**
 * Create a new account.
 * On success the access token is stored in localStorage automatically.
 */
export async function register(data: RegisterRequest): Promise<RegisterResult> {
  const res = await api.post<AuthResponse>("/api/v1/auth/register", {
    body: data,
  });

  setAccessToken(res.access_token);

  return { user: res };
}

// ---------------------------------------------------------------------------
// Get current user
// ---------------------------------------------------------------------------

/**
 * Fetch the currently authenticated user's profile.
 * Requires a valid access token in localStorage.
 */
export async function getMe(): Promise<UserResponse> {
  return api.get<UserResponse>("/api/v1/auth/me", { auth: true });
}


// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export interface ForgotPasswordRequest {
  email: string;
  base_url: string;
}

/**
 * Initiate a password reset flow.
 * Sends a reset link to the user's email via Brevo.
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
  return api.post<{ message: string }>("/api/v1/auth/forgot-password", {
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

/**
 * Complete a password reset using the token from the email link.
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
  return api.post<{ message: string }>("/api/v1/auth/reset-password", {
    body: data,
  });
}
