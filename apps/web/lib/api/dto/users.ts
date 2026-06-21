// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface CreateUserRequest {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
}

export interface UpdateUserRequest {
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean | null;
  role?: string | null;
}
