// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string; // default: "bearer"
}

export interface AuthResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  access_token: string;
  token_type?: string; // default: "bearer"
}

export interface UserResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: string; // ISO datetime
  last_login: string | null; // ISO datetime
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}
