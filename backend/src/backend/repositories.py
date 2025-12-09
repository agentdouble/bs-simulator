from __future__ import annotations

from typing import Dict, Protocol

from fastapi import HTTPException, status

from .domain import GameState


class GameRepository(Protocol):
    def create(self, state: GameState) -> GameState:
        raise NotImplementedError

    def get(self, game_id: str) -> GameState:
        raise NotImplementedError

    def save(self, state: GameState) -> GameState:
        raise NotImplementedError


class InMemoryGameRepository:
    def __init__(self) -> None:
        self._store: Dict[str, GameState] = {}

    def create(self, state: GameState) -> GameState:
        self._store[state.game_id] = state
        return state

    def get(self, game_id: str) -> GameState:
        if game_id not in self._store:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partie introuvable")
        return self._store[game_id]

    def save(self, state: GameState) -> GameState:
        self._store[state.game_id] = state
        return state


class SupabaseGameRepository:
    """
    Placeholder for a Supabase-backed repository. It is intentionally not
    wired yet to keep the MVP lean while the schema is validated.
    """

    def __init__(self) -> None:
        raise NotImplementedError("Supabase repository not implemented in the MVP")
