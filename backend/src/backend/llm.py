from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

import logging
from openai import OpenAI

from .config import Settings
from .domain import DayReport, GameState

logger = logging.getLogger(__name__)


class LLMEngine(ABC):
    @abstractmethod
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        raise NotImplementedError


class ApiLLMEngine(LLMEngine):
    def __init__(self, api_key: str, model: str) -> None:
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        prompt = self._build_prompt(state, report)
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Tu es directeur des opérations d'une startup SaaS. "
                            "Produis des recommandations tactiques, courtes et actionnables en français."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.35,
                max_tokens=320,
            )
        except Exception as exc:  # openai library already normalises errors
            logger.exception("Echec lors de l'appel LLM externe")
            raise RuntimeError("Echec de génération de recommandations via l'API LLM") from exc

        message = response.choices[0].message.content if response.choices else None
        if not message:
            raise RuntimeError("Réponse LLM vide")

        recommendations = [line.lstrip("-• ").strip() for line in message.splitlines() if line.strip()]
        if not recommendations:
            raise RuntimeError("Aucune recommandation exploitable renvoyée par le LLM")

        logger.info("Recommandations LLM générées pour le jour %s", report.day)
        return recommendations[:4]

    def _build_prompt(self, state: GameState, report: DayReport) -> str:
        agent_lines = []
        for agent in state.agents:
            skills = ", ".join(f"{name}:{score}" for name, score in sorted(agent.skills.items()))
            agent_lines.append(
                f"- {agent.name} ({agent.role}) prod {agent.productivity}, mot {agent.motivation}/100, "
                f"stab {agent.stability}/100, auto {agent.autonomy}, skills {skills}, traits: {', '.join(agent.traits)}"
            )

        return (
            f"Entreprise: {state.company.name} | Jour {report.day}\n"
            f"Cash: {state.company.cash:.0f} | Revenu: {report.results.revenue:.0f} | "
            f"Coûts: {report.results.costs:.0f} | Net: {report.results.net:.0f}\n"
            f"Clients: {report.results.clients} | Innovations: {report.results.innovations} | Incidents: {report.results.errors}\n"
            f"Décisions précédentes: {', '.join(report.decisions_impact)}\n"
            "Equipe:\n"
            + "\n".join(agent_lines)
            + "\n"
            "Retourne 3 recommandations opérationnelles concises en liste à puces (phrase courte), ciblées sur des actions concrètes pour le prochain jour."
        )


def get_llm_engine(settings: Settings) -> LLMEngine:
    return ApiLLMEngine(api_key=settings.openai_api_key, model=settings.openai_model)
