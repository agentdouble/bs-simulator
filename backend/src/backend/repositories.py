from __future__ import annotations

from typing import Dict, List, Protocol

from fastapi import HTTPException, status

from .domain import Agent, Company, DayReport, GameState, COMPETENCY_NAMES
from .schemas import ManagerAction

try:
    import httpx
    from supabase import Client, create_client
    from supabase.client import ClientOptions
except ImportError:  # pragma: no cover - handled via dependency management
    httpx = None  # type: ignore
    Client = None  # type: ignore
    create_client = None  # type: ignore
    ClientOptions = None  # type: ignore


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

    def __init__(self, supabase_url: str, supabase_key: str, verify_ssl: bool = True) -> None:
        if Client is None or create_client is None or httpx is None or ClientOptions is None:
            raise RuntimeError("Le client Supabase est manquant; installe supabase via uv.")
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL et SUPABASE_KEY sont requis pour activer SupabaseGameRepository")

        options = ClientOptions(httpx_client=httpx.Client(verify=verify_ssl))
        self.client: Client = create_client(supabase_url, supabase_key, options=options)
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

    def _upsert_competencies(self, company_id: str, agents: List[Agent]) -> None:
        if not agents:
            return
        self._ensure_competency_table()
        payload = []
        for agent in agents:
            entry = {"company_id": company_id, "agent_id": agent.id}
            for name in COMPETENCY_NAMES:
                entry[name] = int(agent.competencies.get(name, 1))
            payload.append(entry)
        self._execute(self.client.table("agent_competencies").upsert(payload), "sauvegarde compétences agents")

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

    def _fetch_agent_competencies(self, company_id: str) -> Dict[str, Dict[str, int]]:
        self._ensure_competency_table()
        response = self._execute(
            self.client.table("agent_competencies").select("*").eq("company_id", company_id),
            "lecture compétences agents",
        )
        rows = response.data or []
        result: Dict[str, Dict[str, int]] = {}
        for row in rows:
            comp = {name: int(row.get(name, 1)) for name in COMPETENCY_NAMES}
            result[str(row["agent_id"])] = comp
        return result

    def _ensure_competency_table(self) -> None:
        if self._competency_table_ready:
            return
        try:
            self.client.table("agent_competencies").select("agent_id").limit(1).execute()
        except Exception as exc:  # pragma: no cover - depends on Supabase runtime
            message = str(exc)
            if "agent_competencies" in message or "404" in message or "does not exist" in message:
                self._bootstrap_competency_table()
            else:
                raise
        self._competency_table_ready = True

    def _bootstrap_competency_table(self) -> None:
        sql = (
            "create table if not exists public.agent_competencies (\n"
            "  agent_id uuid references public.agents(id) on delete cascade,\n"
            "  company_id uuid references public.companies(id) on delete cascade,\n"
            "  technical int not null default 1,\n"
            "  creativity int not null default 1,\n"
            "  communication int not null default 1,\n"
            "  organisation int not null default 1,\n"
            "  autonomy int not null default 1,\n"
            "  primary key(agent_id)\n"
            ");"
        )
        try:
            self._execute_pg_meta_query(sql)
        except Exception as exc:  # pragma: no cover - Supabase connectivity/runtime dependent
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Impossible de créer automatiquement la table agent_competencies via Supabase pg_meta. "
                    "Exécute manuellement le SQL suivant (avec la clé service ou via le dashboard Supabase):\n"
                    f"{sql}"
                ),
            ) from exc

    def _execute_pg_meta_query(self, sql: str) -> None:
        pg_meta_url = f"{self._supabase_url}/rest/v1/pg_meta/query"
        headers = {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        with httpx.Client(verify=self._verify_ssl, timeout=10) as client:
            response = client.post(pg_meta_url, headers=headers, json={"query": sql})
        if response.status_code >= 300:
            raise RuntimeError(f"pg_meta renvoie {response.status_code}: {response.text}")

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

    def _deserialize_agent(self, row: dict, competencies: Dict[str, int] | None) -> Agent:
        default_competencies = {name: 1 for name in COMPETENCY_NAMES}
        if competencies:
            default_competencies.update({name: int(value) for name, value in competencies.items()})
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
            competencies=default_competencies,
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
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Echec Supabase pendant {context}: {exc}"
            ) from exc
        error = getattr(response, "error", None)
        if error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Erreur Supabase pendant {context}: {error}"
            )
        return response
