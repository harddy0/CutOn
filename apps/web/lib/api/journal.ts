import { api } from "./client";
import type { JournalEntryResponse, CreateJournalEntryRequest, UpdateJournalEntryRequest } from "./dto/journal";
import type { PaginatedResponse } from "./dto";

// ---------------------------------------------------------------------------
// List journal entries
// ---------------------------------------------------------------------------

export interface ListJournalEntriesParams {
  topic_id?: string;
  skip?: number;
  limit?: number;
}

export async function listJournalEntries(params?: ListJournalEntriesParams): Promise<PaginatedResponse<JournalEntryResponse>> {
  return api.get<PaginatedResponse<JournalEntryResponse>>("/api/v1/journal-entries/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get single entry
// ---------------------------------------------------------------------------

export async function getJournalEntry(entryId: string): Promise<JournalEntryResponse> {
  return api.get<JournalEntryResponse>(`/api/v1/journal-entries/${entryId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Create journal entry
// ---------------------------------------------------------------------------

export async function createJournalEntry(data: CreateJournalEntryRequest): Promise<JournalEntryResponse> {
  return api.post<JournalEntryResponse>("/api/v1/journal-entries/", {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Update journal entry
// ---------------------------------------------------------------------------

export async function updateJournalEntry(entryId: string, data: UpdateJournalEntryRequest): Promise<JournalEntryResponse> {
  return api.patch<JournalEntryResponse>(`/api/v1/journal-entries/${entryId}`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Delete journal entry
// ---------------------------------------------------------------------------

export async function deleteJournalEntry(entryId: string): Promise<void> {
  return api.delete_<void>(`/api/v1/journal-entries/${entryId}`, { auth: true });
}
