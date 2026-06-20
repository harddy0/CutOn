// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface SourceResponse {
  id: string;
  user_id: string;
  topic_id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  total_chunks: number;
  chunking_status: string; // "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  ingested_at: string; // ISO datetime
}

export interface DocumentChunkResponse {
  id: string;
  source_id: string;
  chunk_index: number;
  text: string;
  page_number: number;
  embedding_status: string; // "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  tokens: number | null;
  created_at: string; // ISO datetime
}

export interface ChunkingProgressResponse {
  source_id: string;
  total_chunks: number;
  completed_chunks: number;
  status: string; // "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
}
