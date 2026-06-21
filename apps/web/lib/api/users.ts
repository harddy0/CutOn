import { api } from "./client";
import type { UserResponse, CreateUserRequest, UpdateUserRequest } from "./dto";

// ---------------------------------------------------------------------------
// List users (admin)
// ---------------------------------------------------------------------------

export interface ListUsersParams {
  skip?: number;
  limit?: number;
}

export async function listUsers(params?: ListUsersParams): Promise<UserResponse[]> {
  return api.get<UserResponse[]>("/api/v1/users/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Create user (admin)
// ---------------------------------------------------------------------------

export async function createUser(data: CreateUserRequest): Promise<UserResponse> {
  return api.post<UserResponse>("/api/v1/users/", {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Get single user (admin or own)
// ---------------------------------------------------------------------------

export async function getUser(userId: string): Promise<UserResponse> {
  return api.get<UserResponse>(`/api/v1/users/${userId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Update user (admin or own)
// ---------------------------------------------------------------------------

export async function updateUser(userId: string, data: UpdateUserRequest): Promise<UserResponse> {
  return api.patch<UserResponse>(`/api/v1/users/${userId}`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Deactivate user (admin only)
// ---------------------------------------------------------------------------

export async function deactivateUser(userId: string): Promise<UserResponse> {
  return api.post<UserResponse>(`/api/v1/users/${userId}/deactivate`, { auth: true });
}
