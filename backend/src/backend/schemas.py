from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .domain import DayReport, GameState


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


class RecruitRequest(BaseModel):
    game_id: str


class RecruitResponse(BaseModel):
    state: GameState


class BuyEnergyRequest(BaseModel):
    game_id: str


class BuyEnergyResponse(BaseModel):
    state: GameState


class GameStateResponse(BaseModel):
    state: GameState


class RecruitRequest(BaseModel):
    game_id: str


class RecruitResponse(BaseModel):
    state: GameState


class BuyEnergyRequest(BaseModel):
    game_id: str


class BuyEnergyResponse(BaseModel):
    state: GameState
