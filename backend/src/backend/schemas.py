from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .domain import Agent, DayReport, GameState


class StartGameRequest(BaseModel):
    company_name: str = Field(..., min_length=1)


class StartGameResponse(BaseModel):
    state: GameState


class ManagerAction(BaseModel):
    agent_id: str
    action: Literal["assign_tasks", "train", "promote", "fire", "support"]
    focus: Optional[str] = None


class ActionRequest(BaseModel):
    game_id: str
    actions: List[ManagerAction]


class ActionResponse(BaseModel):
    state: GameState
    report: DayReport


class GameStateResponse(BaseModel):
    state: GameState


class RecruitmentRequest(BaseModel):
    game_id: str
    count: int = Field(default=3, ge=1, le=6)


class RecruitmentResponse(BaseModel):
    candidates: List[Agent]


class InterviewMessage(BaseModel):
    sender: Literal["manager", "candidate"]
    content: str = Field(..., min_length=1)


class InterviewRequest(BaseModel):
    game_id: str
    candidate: Agent
    messages: List[InterviewMessage]


class InterviewResponse(BaseModel):
    reply: str


class HireRequest(BaseModel):
    game_id: str
    candidate: Agent


class HireResponse(BaseModel):
    state: GameState
