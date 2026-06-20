// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface GenerateQuizRequest {
  topic_id?: string | null;
  query?: string | null;
  num_questions?: number; // default: 10
  mode?: string; // "blind_spot" | "topic_review"
}

export interface AnswerSubmission {
  question_id: string;
  selected_option_id: string;
}

export interface SubmitAttemptRequest {
  answers: AnswerSubmission[];
}

// ---------------------------------------------------------------------------
// Responses — Lighter version for list views
// ---------------------------------------------------------------------------

export interface QuizSummaryResponse {
  id: string;
  topic_id: string;
  title: string;
  mode: string; // "blind_spot" | "topic_review"
  question_count: number;
  generated_at: string; // ISO datetime
  blind_spot_count: number;
  has_journal_data: boolean;
  created_at: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Full quiz with all questions
// ---------------------------------------------------------------------------

export interface QuizOptionResponse {
  id: string;
  text: string;
}

export interface QuizQuestionResponse {
  id: string;
  type: string; // e.g. "multiple_choice"
  question: string;
  options: QuizOptionResponse[];
  source_type: string; // "document_chunk" | "journal_entry"
  source_reference: string;
}

export interface QuizResponse {
  id: string;
  topic_id: string;
  title: string;
  mode: string;
  generated_at: string;
  questions: QuizQuestionResponse[];
  blind_spot_count: number;
  has_journal_data: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export interface GradedAnswerResponse {
  question_id: string;
  selected_option_id: string;
  correct_option_id: string;
  is_correct: boolean;
}

export interface QuizAttemptResponse {
  id: string;
  quiz_id: string;
  topic_id: string;
  score: number;
  max_score: number;
  passed: boolean;
  answers: GradedAnswerResponse[];
  completed_at: string; // ISO datetime
}
