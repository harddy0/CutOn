import { api } from "./client";
import type { TopicResponse, CreateTopicRequest, UpdateTopicRequest } from "./dto/topics";

// ---------------------------------------------------------------------------
// List topics
// ---------------------------------------------------------------------------

export interface ListTopicsParams {
  skip?: number;
  limit?: number;
}

export async function listTopics(params?: ListTopicsParams): Promise<TopicResponse[]> {
  return api.get<TopicResponse[]>("/api/v1/topics/", {
    auth: true,
    params: params as Record<string, string | number | boolean | null | undefined>,
  });
}

// ---------------------------------------------------------------------------
// Get single topic
// ---------------------------------------------------------------------------

export async function getTopic(topicId: string): Promise<TopicResponse> {
  return api.get<TopicResponse>(`/api/v1/topics/${topicId}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Create topic
// ---------------------------------------------------------------------------

export async function createTopic(data: CreateTopicRequest): Promise<TopicResponse> {
  return api.post<TopicResponse>("/api/v1/topics/", {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Update topic
// ---------------------------------------------------------------------------

export async function updateTopic(topicId: string, data: UpdateTopicRequest): Promise<TopicResponse> {
  return api.patch<TopicResponse>(`/api/v1/topics/${topicId}`, {
    auth: true,
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Delete topic
// ---------------------------------------------------------------------------

export async function deleteTopic(topicId: string): Promise<void> {
  return api.delete_<void>(`/api/v1/topics/${topicId}`, { auth: true });
}
