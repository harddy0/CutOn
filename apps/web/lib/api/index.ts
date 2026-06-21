export { api, ApiError, fetchStream } from "./client";
export type { SseEvent } from "./client";
export { getAccessToken, setAccessToken, clearAccessToken } from "./config";
export { login, register, getMe } from "./auth";
export type { LoginResult, RegisterResult } from "./auth";
export type * from "./dto";

export {
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
  deleteTopic,
} from "./topics";
export type { ListTopicsParams } from "./topics";

export {
  listJournalEntries,
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from "./journal";
export type { ListJournalEntriesParams } from "./journal";

export {
  listSources,
  getSource,
  uploadSource,
  deleteSource,
  listChunks,
  getChunkingProgress,
} from "./sources";
export type { ListSourcesParams, UploadSourceData, ListChunksParams } from "./sources";

export {
  listStudySessions,
  createStudySession,
  getStudySession,
  updateStudySession,
  deleteStudySession,
  chatSend,
  confirmJournal,
  chatSendStream,
} from "./study";
export type { ListStudySessionsParams } from "./study";

export {
  getDashboardSummary,
  getDashboardLearning,
  getDashboardQuizzes,
  getDashboardRag,
  getDashboardActivity,
  getDashboardStats,
} from "./dashboard";

export {
  generateQuiz,
  listQuizzes,
  getQuiz,
  deleteQuiz,
  submitAttempt,
  listAttempts,
} from "./quiz";
export type {
  GenerateQuizRequest,
  SubmitAttemptRequest,
  QuizResponse,
  QuizSummaryResponse,
  QuizQuestionResponse,
  QuizOptionResponse,
  QuizAttemptResponse,
  GradedAnswerResponse,
} from "./dto/quiz";

export {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deactivateUser,
} from "./users";
export type { ListUsersParams } from "./users";

export {
  getAdminRagStats,
  listAdminRagEvaluations,
} from "./rag-admin";
export type { RAGStatsResponse, RAGEvaluationResponse, ListAdminRagEvaluationsParams } from "./rag-admin";

export { searchQuery, searchQueryStream } from "./query";
export type { QueryRequest, QueryResponse, QueryResultItem } from "./dto/query";
