from fastapi import APIRouter, Depends, HTTPException

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.topics.dto import CreateTopicRequest, UpdateTopicRequest, TopicResponse
from app.modules.topics.service import TopicsService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/topics", tags=["topics"])


def get_topics_service() -> TopicsService:
    return TopicsService(DatabaseClient)


@router.post("/", response_model=TopicResponse, status_code=201)
async def create_topic(
    payload: CreateTopicRequest,
    service: TopicsService = Depends(get_topics_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.create(current_user.id, payload)


@router.get("/", response_model=list[TopicResponse])
async def list_topics(
    skip: int = 0,
    limit: int = 100,
    service: TopicsService = Depends(get_topics_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.list_by_user(current_user.id, skip, limit)


@router.get("/{topic_id}", response_model=TopicResponse)
async def get_topic(
    topic_id: str,
    service: TopicsService = Depends(get_topics_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.find_by_id_for_user(topic_id, current_user.id)


@router.patch("/{topic_id}", response_model=TopicResponse)
async def update_topic(
    topic_id: str,
    payload: UpdateTopicRequest,
    service: TopicsService = Depends(get_topics_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.update(topic_id, current_user.id, payload)


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: str,
    service: TopicsService = Depends(get_topics_service),
    current_user: UserResponse = Depends(require_user),
):
    await service.delete(topic_id, current_user.id)
