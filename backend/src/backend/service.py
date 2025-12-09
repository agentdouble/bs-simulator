from __future__ import annotations

import logging
import random
from typing import List, Tuple

from fastapi import HTTPException, status

from .domain import (
    Agent,
    AgentInsight,
    BusinessResults,
    DayReport,
    GameState,
    create_initial_state,
)
from .llm import LLMEngine
from .repositories import GameRepository
from .schemas import ActionRequest, ManagerAction, StartGameRequest


logger = logging.getLogger(__name__)


def _clamp(value: float, min_value: float = 0.0, max_value: float = 100.0) -> float:
    return max(min_value, min(value, max_value))


class GameService:
    def __init__(self, repository: GameRepository, llm_engine: LLMEngine, rng: random.Random | None = None) -> None:
        self.repository = repository
        self.llm_engine = llm_engine
        self.rng = rng or random.Random()

    def start_game(self, payload: StartGameRequest) -> GameState:
        state = create_initial_state(payload.company_name, rng=self.rng)
        report = self._build_report(state, decisions_impact=["Entreprise créée"], extra_costs=0.0)
        state.last_report = report
        self.repository.create(state)
        logger.info("Nouvelle partie %s pour %s", state.game_id, payload.company_name)
        return state

    def get_state(self, game_id: str) -> GameState:
        return self.repository.get(game_id)

    def apply_actions(self, payload: ActionRequest) -> Tuple[GameState, DayReport]:
        state = self.repository.get(payload.game_id)
        updated_agents, decisions_impact, variable_costs = self._apply_actions(state.agents, payload.actions)
        action_day = state.day

        next_state = GameState(
            game_id=state.game_id,
            day=state.day + 1,
            company=state.company.model_copy(deep=True),
            agents=updated_agents,
            last_report=None,
        )

        report = self._build_report(next_state, decisions_impact=decisions_impact, extra_costs=variable_costs)
        next_state.last_report = report
        self.repository.save(next_state, payload.actions, action_day=action_day)
        logger.info("Etat jour %s enregistré pour %s", report.day, payload.game_id)
        return next_state, report

    def _apply_actions(
        self, agents: List[Agent], actions: List[ManagerAction]
    ) -> Tuple[List[Agent], List[str], float]:
        agent_map = {agent.id: agent for agent in agents}
        decisions_impact: List[str] = []
        extra_costs = 0.0

        for action in actions:
            agent = agent_map.get(action.agent_id)
            if not agent:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent {action.agent_id} introuvable")

            if action.action == "assign_tasks":
                motivation = _clamp(agent.motivation + 5)
                stability = _clamp(agent.stability - 2)
                agent_map[agent.id] = agent.copy_with_updates(motivation=motivation, stability=stability)
                decisions_impact.append(f"Tâches ajustées pour {agent.name}")
            elif action.action == "train":
                focus = action.focus or "production"
                skills = dict(agent.skills)
                if focus in skills:
                    skills[focus] = _clamp(skills[focus] + 5, max_value=100)
                motivation = _clamp(agent.motivation + 6)
                agent_map[agent.id] = agent.copy_with_updates(skills=skills, motivation=motivation)
                decisions_impact.append(f"Formation {focus} pour {agent.name}")
                extra_costs += 800.0
            elif action.action == "promote":
                motivation = _clamp(agent.motivation + 10)
                productivity = round(agent.productivity + 0.05, 2)
                salary = int(agent.salary * 1.1)
                agent_map[agent.id] = agent.copy_with_updates(
                    motivation=motivation, productivity=productivity, salary=salary
                )
                decisions_impact.append(f"Promotion accordée à {agent.name}")
            elif action.action == "fire":
                decisions_impact.append(f"{agent.name} licencié(e)")
                extra_costs += agent.salary * 0.25
                agent_map.pop(agent.id, None)
            elif action.action == "support":
                stability = _clamp(agent.stability + 12)
                motivation = _clamp(agent.motivation + 4)
                agent_map[agent.id] = agent.copy_with_updates(stability=stability, motivation=motivation)
                decisions_impact.append(f"Coaching/soutien pour {agent.name}")
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Action inconnue")

        return list(agent_map.values()), decisions_impact, extra_costs

    def _build_report(self, state: GameState, decisions_impact: List[str], extra_costs: float) -> DayReport:
        results = self._compute_results(state.agents, extra_costs)
        state.company.revenue = results.revenue
        state.company.costs = results.costs
        state.company.cash = round(state.company.cash + results.net, 2)

        agent_insights = [
            AgentInsight(
                agent_id=agent.id,
                name=agent.name,
                motivation=agent.motivation,
                stability=agent.stability,
                productivity=agent.productivity,
                note="Autonome" if agent.autonomy == "high" else None,
            )
            for agent in state.agents
        ]

        report = DayReport(
            day=state.day,
            agent_situation=agent_insights,
            results=results,
            decisions_impact=decisions_impact or ["Pas de décision prise"],
            recommendations=[],
        )

        recommendations = self.llm_engine.generate_recommendations(state, report)
        report.recommendations = recommendations
        return report

    def _compute_results(self, agents: List[Agent], extra_costs: float) -> BusinessResults:
        revenue = 0.0
        for agent in agents:
            skill_factor = sum(agent.skills.values()) / (len(agent.skills) * 100)
            motivation_factor = agent.motivation / 100
            output = skill_factor * agent.productivity * (0.6 + motivation_factor)
            variance = 1 + self.rng.uniform(-0.05, 0.1)
            revenue += output * 1200 * variance

        base_costs = sum(agent.salary / 260 for agent in agents)
        maintenance = 400 + 60 * len(agents)
        costs = base_costs + maintenance + extra_costs

        innovations = int(max(0, self.rng.gauss(len(agents) * 0.2, 0.6)))
        errors = int(max(0, self.rng.gauss(len(agents) * 0.1, 0.4)))
        clients = max(0, int(revenue // 4500))

        revenue = round(revenue, 2)
        costs = round(costs, 2)
        net = round(revenue - costs, 2)

        return BusinessResults(
            revenue=revenue,
            costs=costs,
            net=net,
            clients=clients,
            errors=errors,
            innovations=innovations,
        )
