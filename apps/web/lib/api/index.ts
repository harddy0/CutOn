export { api, ApiError } from "./client";
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
} from "./study";
export type { ListStudySessionsParams } from "./study";

export { searchQuery } from "./query";
export type { QueryRequest, QueryResponse, QueryResultItem } from "./dto/query";
