import { api } from "./client";
import type { QueryRequest, QueryResponse } from "./dto/query";

// ---------------------------------------------------------------------------
// Hybrid semantic search
// ---------------------------------------------------------------------------

export async function searchQuery(data: QueryRequest): Promise<QueryResponse> {
  return api.post<QueryResponse>("/api/v1/query/", {
    auth: true,
    body: data,
  });
}
