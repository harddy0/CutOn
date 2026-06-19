import { api } from "./client";
import type { DashboardStatsResponse } from "./dto/dashboard";

// ---------------------------------------------------------------------------
// Get dashboard stats — single endpoint replaces 4+ individual list calls
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return api.get<DashboardStatsResponse>("/api/v1/dashboard/stats", {
    auth: true,
  });
}
