from __future__ import annotations

from typing import Dict, List, Protocol

from fastapi import HTTPException, status

from .domain import Agent, Company, DayReport, GameState
from .schemas import ManagerAction

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - handled via dependency management
    Client = None  # type: ignore
    create_client = None  # type: ignore


class GameRepository(Protocol):
    def create(self, state: GameState) -> GameState:
        raise NotImplementedError

    def get(self, game_id: str) -> GameState:
        raise NotImplementedError

    def save(
        self, state: GameState, actions: List[ManagerAction] | None = None, action_day: int | None = None
    ) -> GameState:
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

    def save(
        self, state: GameState, actions: List[ManagerAction] | None = None, action_day: int | None = None
    ) -> GameState:
        self._store[state.game_id] = state
        return state


class SupabaseGameRepository:
    """
    Supabase-backed repository persisting games, companies, agents and actions.
    """

    def __init__(self, supabase_url: str, supabase_key: str) -> None:
        if Client is None or create_client is None:
            raise RuntimeError("Le client Supabase est manquant; installe supabase via uv.")
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL et SUPABASE_KEY sont requis pour activer SupabaseGameRepository")

        self.client: Client = create_client(supabase_url, supabase_key)
        self._game_companies: Dict[str, str] = {}

    def create(self, state: GameState) -> GameState:
        company_id = self._insert_company(state.company)
        self._game_companies[state.game_id] = company_id
        self._upsert_agents(company_id, state.agents)
        self._insert_game_state(state, company_id)
        return state

    def get(self, game_id: str) -> GameState:
        row = self._latest_state_row(game_id)
        company_id = row["company_id"]
        self._game_companies[game_id] = company_id

        company_row = self._fetch_company(company_id)
        agents_rows = self._fetch_agents(company_id)

        company = self._deserialize_company(company_row)
        agents = [self._deserialize_agent(agent_row) for agent_row in agents_rows]
        report = DayReport(**row["report"]) if row.get("report") else None

        return GameState(
            game_id=game_id,
            day=int(row["day"]),
            company=company,
            agents=agents,
            last_report=report,
        )

    def save(
        self, state: GameState, actions: List[ManagerAction] | None = None, action_day: int | None = None
    ) -> GameState:
        company_id = self._get_company_id(state.game_id)
        self._update_company(company_id, state.company)
        self._sync_agents(company_id, state.agents)
        self._insert_game_state(state, company_id)
        if actions:
            self._insert_manager_actions(state.game_id, action_day or state.day, actions)
        return state

    def _get_company_id(self, game_id: str) -> str:
        if game_id in self._game_companies:
            return self._game_companies[game_id]

        row = self._latest_state_row(game_id)
        company_id = row["company_id"]
        self._game_companies[game_id] = company_id
        return company_id

    def _latest_state_row(self, game_id: str) -> dict:
        response = self._execute(
            self.client.table("game_states").select("*").eq("game_id", game_id).order("day", desc=True).limit(1),
            "lecture de l'état de jeu",
        )
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partie introuvable")
        return rows[0]

    def _insert_company(self, company: Company) -> str:
        response = self._execute(
            self.client.table("companies").insert(
                {
                    "name": company.name,
                    "cash": company.cash,
                    "revenue": company.revenue,
                    "costs": company.costs,
                }
            ),
            "création de l'entreprise",
        )
        rows = response.data or []
        if not rows or "id" not in rows[0]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Création entreprise Supabase échouée"
            )
        return str(rows[0]["id"])

    def _update_company(self, company_id: str, company: Company) -> None:
        self._execute(
            self.client.table("companies")
            .update({"cash": company.cash, "revenue": company.revenue, "costs": company.costs})
            .eq("id", company_id),
            "mise à jour de l'entreprise",
        )

    def _fetch_company(self, company_id: str) -> dict:
        response = self._execute(
            self.client.table("companies").select("*").eq("id", company_id).limit(1),
            "lecture entreprise",
        )
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entreprise introuvable pour la partie")
        return rows[0]

    def _upsert_agents(self, company_id: str, agents: List[Agent]) -> None:
        if not agents:
            return
        payload = [self._serialize_agent(agent, company_id) for agent in agents]
        self._execute(self.client.table("agents").upsert(payload), "sauvegarde des agents")

    def _sync_agents(self, company_id: str, agents: List[Agent]) -> None:
        existing = self._execute(
            self.client.table("agents").select("id").eq("company_id", company_id),
            "récupération des agents existants",
        ).data or []
        existing_ids = {row["id"] for row in existing}
        current_ids = {agent.id for agent in agents}
        to_delete = list(existing_ids - current_ids)
        if to_delete:
            self._execute(
                self.client.table("agents").delete().in_("id", to_delete),
                "suppression des agents supprimés",
            )
        self._upsert_agents(company_id, agents)

    def _fetch_agents(self, company_id: str) -> List[dict]:
        response = self._execute(
            self.client.table("agents").select("*").eq("company_id", company_id),
            "lecture agents",
        )
        return response.data or []

    def _insert_game_state(self, state: GameState, company_id: str) -> None:
        report_payload = state.last_report.model_dump() if state.last_report else None
        self._execute(
            self.client.table("game_states").insert(
                {
                    "game_id": state.game_id,
                    "company_id": company_id,
                    "day": state.day,
                    "report": report_payload,
                }
            ),
            "enregistrement de l'état de jeu",
        )

    def _insert_manager_actions(self, game_id: str, action_day: int, actions: List[ManagerAction]) -> None:
        payload = [
            {
                "game_id": game_id,
                "day": action_day,
                "agent_id": action.agent_id,
                "action": action.action,
                "focus": action.focus,
            }
            for action in actions
        ]
        if not payload:
            return
        self._execute(self.client.table("manager_actions").insert(payload), "journalisation des actions manager")

    def _serialize_agent(self, agent: Agent, company_id: str) -> dict:
        return {
            "id": agent.id,
            "company_id": company_id,
            "name": agent.name,
            "role": agent.role,
            "skills": agent.skills,
            "strengths": agent.strengths,
            "weaknesses": agent.weaknesses,
            "productivity": agent.productivity,
            "salary": agent.salary,
            "autonomy": agent.autonomy,
            "traits": agent.traits,
            "motivation": agent.motivation,
            "stability": agent.stability,
        }

    def _deserialize_agent(self, row: dict) -> Agent:
        return Agent(
            id=str(row["id"]),
            name=row["name"],
            role=row["role"],
            skills=row["skills"],
            strengths=row["strengths"],
            weaknesses=row["weaknesses"],
            productivity=float(row["productivity"]),
            salary=int(row["salary"]),
            autonomy=row["autonomy"],
            traits=row["traits"],
            motivation=float(row.get("motivation", 0)),
            stability=float(row.get("stability", 0)),
        )

    def _deserialize_company(self, row: dict) -> Company:
        return Company(
            name=row["name"],
            cash=float(row["cash"]),
            revenue=float(row["revenue"]),
            costs=float(row["costs"]),
        )

    def _execute(self, query, context: str):
        try:
            response = query.execute()
        except Exception as exc:  # pragma: no cover - supabase client raises runtime errors
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Echec Supabase pendant {context}"
            ) from exc
        error = getattr(response, "error", None)
        if error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Erreur Supabase pendant {context}: {error}"
            )
        return response
