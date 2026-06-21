import { api, fetchStream } from "./client";
import type {
  StudySessionResponse,
  StudySessionDetailResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
  ChatRequest,
  ChatResponse,
  ConfirmJournalResponse,
} from "./dto/study";
import type { SseEvent } from "./client";

// ---------------------------------------------------------------------------
// List study sessions
// ---------------------------------------------------------------------------

export interface ListStudySessionsParams {
  status?: string;
  skip?: number;
  limit?: number;
}

export async function listStudySessions(params?: ListStudySessionsParams): Promise<StudySessionResponse[]> {
  return api.get<StudySessionResponse[]>("/api/v1/study-sessions/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Create study session
// ---------------------------------------------------------------------------

export async function createStudySession(data?: CreateSessionRequest): Promise<StudySessionResponse> {
  return api.post<StudySessionResponse>("/api/v1/study-sessions/", {
    auth: true,
    body: data ?? {},
  });
}

// ---------------------------------------------------------------------------
// Get study session with messages
// ---------------------------------------------------------------------------

export async function getStudySession(sessionId: string): Promise<StudySessionDetailResponse> {
  return api.get<StudySessionDetailResponse>(`/api/v1/study-sessions/${sessionId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Update study session
// ---------------------------------------------------------------------------

export async function updateStudySession(sessionId: string, data: UpdateSessionRequest): Promise<StudySessionResponse> {
  return api.patch<StudySessionResponse>(`/api/v1/study-sessions/${sessionId}`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Delete study session
// ---------------------------------------------------------------------------

export async function deleteStudySession(sessionId: string): Promise<void> {
  return api.delete_<void>(`/api/v1/study-sessions/${sessionId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Send chat message
// ---------------------------------------------------------------------------

export async function chatSend(sessionId: string, data: ChatRequest): Promise<ChatResponse> {
  return api.post<ChatResponse>(`/api/v1/study-sessions/${sessionId}/chat`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Confirm journal suggestion
// ---------------------------------------------------------------------------

export async function confirmJournal(sessionId: string, messageId: string): Promise<ConfirmJournalResponse> {
  return api.post<ConfirmJournalResponse>(
    `/api/v1/study-sessions/${sessionId}/messages/${messageId}/confirm-journal`,
    { auth: true }
  );
}

// ---------------------------------------------------------------------------
// Streaming chat (SSE)
// ---------------------------------------------------------------------------

/**
 * Send a chat message to the Study Buddy and receive a **streaming** response.
 *
 * The generator yields SSE events:
 * - `"token"`     — a single text chunk from the model
 * - `"metadata"`  — journal/quiz suggestion metadata (JSON)
 * - `"done"`      — signals completion
 * - `"error"`     — an error occurred (JSON body)
 */
export async function* chatSendStream(
  sessionId: string,
  data: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  yield* fetchStream(
    `/api/v1/study-sessions/${sessionId}/chat/stream`,
    data,
    signal,
  );
}
