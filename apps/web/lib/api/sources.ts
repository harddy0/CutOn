import { api } from "./client";
import type {
  SourceResponse,
  DocumentChunkResponse,
  ChunkingProgressResponse,
} from "./dto/sources";

// ---------------------------------------------------------------------------
// List sources
// ---------------------------------------------------------------------------

export interface ListSourcesParams {
  topic_id?: string;
  skip?: number;
  limit?: number;
}

export async function listSources(params?: ListSourcesParams): Promise<SourceResponse[]> {
  return api.get<SourceResponse[]>("/api/v1/sources/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get single source
// ---------------------------------------------------------------------------

export async function getSource(sourceId: string): Promise<SourceResponse> {
  return api.get<SourceResponse>(`/api/v1/sources/${sourceId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Upload document
// ---------------------------------------------------------------------------

export interface UploadSourceData {
  topic_id: string;
  file: File;
}

export async function uploadSource(data: UploadSourceData): Promise<SourceResponse> {
  const formData = new FormData();
  formData.append("topic_id", data.topic_id);
  formData.append("file", data.file);

  return api.multipart<SourceResponse>("POST", "/api/v1/sources/upload", {
    auth: true,
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Delete source
// ---------------------------------------------------------------------------

export async function deleteSource(sourceId: string): Promise<void> {
  return api.delete_<void>(`/api/v1/sources/${sourceId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// List chunks for a source
// ---------------------------------------------------------------------------

export interface ListChunksParams {
  skip?: number;
  limit?: number;
}

export async function listChunks(sourceId: string, params?: ListChunksParams): Promise<DocumentChunkResponse[]> {
  return api.get<DocumentChunkResponse[]>(`/api/v1/sources/${sourceId}/chunks`, {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get chunking progress
// ---------------------------------------------------------------------------

export async function getChunkingProgress(sourceId: string): Promise<ChunkingProgressResponse> {
  return api.get<ChunkingProgressResponse>(`/api/v1/sources/${sourceId}/progress`, { auth: true });
}
