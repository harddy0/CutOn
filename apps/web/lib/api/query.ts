import { api, fetchStream } from "./client";
import type { QueryRequest, QueryResponse, QueryResultItem } from "./dto/query";
import type { SseEvent } from "./client";

// ---------------------------------------------------------------------------
// Hybrid semantic search (JSON response)
// ---------------------------------------------------------------------------

export async function searchQuery(data: QueryRequest): Promise<QueryResponse> {
  return api.post<QueryResponse>("/api/v1/query/", {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Streaming hybrid search (SSE)
// ---------------------------------------------------------------------------

/**
 * Search the knowledge base with a **streaming** LLM synthesis response.
 *
 * The generator yields SSE events:
 * - `"results"` — search results (JSON array of QueryResultItem)
 * - `"token"`   — a single text chunk from the model
 * - `"done"`    — signals completion
 * - `"error"`   — an error occurred (JSON body)
 */
export async function* searchQueryStream(
  data: QueryRequest,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  yield* fetchStream("/api/v1/query/stream", data, signal);
}
