from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

import logging

from .config import Settings
from .domain import DayReport, GameState

logger = logging.getLogger(__name__)


class LLMEngine(ABC):
    @abstractmethod
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        raise NotImplementedError


class RuleBasedLLMEngine(LLMEngine):
    """Simple heuristic engine while the real LLM is disabled."""

    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        results = report.results
        agent_count = len(state.agents)
        avg_motivation = (
            sum(agent.motivation for agent in state.agents) / agent_count if agent_count else 0.0
        )
        avg_stability = (
            sum(agent.stability for agent in state.agents) / agent_count if agent_count else 0.0
        )
        max_errors = max(1, agent_count // 2)
        recommendations: List[str] = []

        def add_reco(message: str) -> None:
            if message not in recommendations:
                recommendations.append(message)

        if results.net < 0:
            add_reco("Stopper les dépenses non essentielles et concentrer l'équipe sur les deals à marge élevée.")

        cash_horizon = results.costs * 2 if results.costs else 20000
        if state.company.cash < cash_horizon:
            add_reco("Sécuriser de la trésorerie (clients prépayés ou prêt court terme) avant la fin du trimestre.")

        if avg_motivation < 60:
            add_reco("Planifier des 1:1 coaching pour remonter la motivation et clarifier les priorités.")

        if avg_stability < 60 or results.errors > max_errors:
            add_reco("Durcir le focus qualité (revues croisées, binômage) pour réduire les incidents clients.")

        if agent_count >= 3 and results.innovations == 0:
            add_reco("Réserver un sprint produit dédié à l'innovation pour préparer les fonctionnalités différenciantes.")

        if results.clients < max(3, agent_count):
            add_reco("Rebooster la prospection: 2 créneaux quotidiens bloqués pour les appels sortants.")

        if not recommendations:
            add_reco("Revoir le plan d'actions du jour suivant avec l'équipe et verrouiller 3 objectifs mesurables.")

        defaults = [
            "Vérifier quotidiennement les indicateurs cash, MRR et incidents avant 10h.",
            "Communiquer un court compte-rendu aux parties prenantes pour garder l'alignement.",
        ]
        for reco in defaults:
            if len(recommendations) >= 4:
                break
            add_reco(reco)

        logger.info("Recommandations heuristiques générées pour le jour %s", report.day)
        return recommendations[:4]


def get_llm_engine(settings: Settings) -> LLMEngine:  # noqa: ARG001 - settings reserved for future config
    return RuleBasedLLMEngine()
