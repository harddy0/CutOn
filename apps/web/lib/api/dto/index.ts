export type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  AuthResponse,
  UserResponse,
  ValidationError,
  HTTPValidationError,
} from "./auth";

export type {
  TopicResponse,
  CreateTopicRequest,
  UpdateTopicRequest,
} from "./topics";

export type {
  JournalEntryResponse,
  CreateJournalEntryRequest,
  UpdateJournalEntryRequest,
} from "./journal";

export type {
  SourceResponse,
  DocumentChunkResponse,
  ChunkingProgressResponse,
} from "./sources";

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export type {
  QueryRequest,
  QueryResponse,
  QueryResultItem,
} from "./query";

export type {
  AuditLogResponse,
  DashboardStatsResponse,
} from "./dashboard";

export type {
  StudySessionResponse,
  StudySessionDetailResponse,
  StudyMessageResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
  ChatRequest,
  ChatResponse,
  JournalSuggestion,
  QuizSuggestion,
  ConfirmJournalResponse,
} from "./study";
