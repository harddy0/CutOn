import { api } from "./client";
import type {
  GenerateQuizRequest,
  SubmitAttemptRequest,
  QuizResponse,
  QuizSummaryResponse,
  QuizAttemptResponse,
} from "./dto/quiz";

// ---------------------------------------------------------------------------
// Generate a quiz
// ---------------------------------------------------------------------------

export async function generateQuiz(data: GenerateQuizRequest): Promise<QuizResponse> {
  return api.post<QuizResponse>("/api/v1/quizzes/generate", {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// List quizzes
// ---------------------------------------------------------------------------

export interface ListQuizzesParams {
  topic_id?: string;
  skip?: number;
  limit?: number;
}

export async function listQuizzes(params?: ListQuizzesParams): Promise<QuizSummaryResponse[]> {
  return api.get<QuizSummaryResponse[]>("/api/v1/quizzes/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get a single quiz with all questions
// ---------------------------------------------------------------------------

export async function getQuiz(quizId: string): Promise<QuizResponse> {
  return api.get<QuizResponse>(`/api/v1/quizzes/${quizId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Delete a quiz
// ---------------------------------------------------------------------------

export async function deleteQuiz(quizId: string): Promise<void> {
  return api.delete_<void>(`/api/v1/quizzes/${quizId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Submit answers for a quiz
// ---------------------------------------------------------------------------

export async function submitAttempt(quizId: string, data: SubmitAttemptRequest): Promise<QuizAttemptResponse> {
  return api.post<QuizAttemptResponse>(`/api/v1/quizzes/${quizId}/attempts`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// List attempts for a quiz
// ---------------------------------------------------------------------------

export interface ListAttemptsParams {
  skip?: number;
  limit?: number;
}

export async function listAttempts(quizId: string, params?: ListAttemptsParams): Promise<QuizAttemptResponse[]> {
  return api.get<QuizAttemptResponse[]>(`/api/v1/quizzes/${quizId}/attempts`, {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}
