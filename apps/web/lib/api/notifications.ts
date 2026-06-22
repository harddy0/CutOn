import { api } from "./client";
import type { NotificationResponse } from "./dto";

// ---------------------------------------------------------------------------
// List notifications
// ---------------------------------------------------------------------------

export interface ListNotificationsParams {
  unread_only?: boolean;
  skip?: number;
  limit?: number;
}

/**
 * List notifications for the authenticated user, newest first.
 */
export async function listNotifications(
  params?: ListNotificationsParams
): Promise<NotificationResponse[]> {
  return api.get<NotificationResponse[]>("/api/v1/notifications/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get unread count
// ---------------------------------------------------------------------------

/**
 * Return the number of unread notifications.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  return api.get<number>("/api/v1/notifications/unread-count", { auth: true });
}

// ---------------------------------------------------------------------------
// Mark notification as read
// ---------------------------------------------------------------------------

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string): Promise<NotificationResponse> {
  return api.patch<NotificationResponse>(`/api/v1/notifications/${notificationId}/read`, {
    auth: true,
  });
}

// ---------------------------------------------------------------------------
// Mark all notifications as read
// ---------------------------------------------------------------------------

/**
 * Mark all unread notifications as read.
 */
export async function markAllNotificationsRead(): Promise<{ marked_read: number }> {
  return api.patch<{ marked_read: number }>("/api/v1/notifications/read-all", {
    auth: true,
  });
}

export type { NotificationResponse } from "./dto";
