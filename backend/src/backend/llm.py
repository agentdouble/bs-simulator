from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from .domain import DayReport, GameState


class LLMEngine(ABC):
    @abstractmethod
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        raise NotImplementedError


class LocalLLMEngine(LLMEngine):
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        tips: List[str] = []

        if report.results.net < 0:
            tips.append("Réduis les coûts de support et priorise les agents les plus productifs.")
        if any(agent.autonomy == "low" for agent in state.agents):
            tips.append("Augmente l'autonomie des profils fiables pour gagner en vitesse.")
        if report.results.innovations == 0:
            tips.append("Planifie une demi-journée d'innovation encadrée avec les profils R&D.")
        if not tips:
            tips.append("Continue sur cette lancée et sécurise un client pilote supplémentaire.")

        return tips


class ApiLLMEngine(LLMEngine):
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        # Placeholder: later replaced by a call to an external provider.
        base = (
            "Mode API actif. Concentre les efforts marketing sur l'agent le plus stable et "
            "réinvestis 10% du cash dans la formation ciblée."
        )
        return [base]


def get_llm_engine(mode: str) -> LLMEngine:
    if mode == "local":
        return LocalLLMEngine()
    if mode == "api":
        return ApiLLMEngine()
    raise ValueError(f"Unsupported LLM mode: {mode}")
