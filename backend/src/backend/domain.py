import random
import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


SKILL_NAMES = ["production", "marketing", "finance", "support"]
TRAITS = ["stable", "imprevisible", "logique", "collaboratif", "innovant", "rigoureux"]


class Agent(BaseModel):
    id: str
    name: str
    role: str
    skills: Dict[str, int]
    strengths: List[str]
    weaknesses: List[str]
    productivity: float
    salary: int
    autonomy: str
    traits: List[str]
    motivation: float = Field(ge=0, le=100, default=65)
    stability: float = Field(ge=0, le=100, default=70)

    def copy_with_updates(self, **kwargs: object) -> "Agent":
        data = self.model_dump()
        data.update(kwargs)
        return Agent(**data)


class Company(BaseModel):
    name: str
    cash: float
    revenue: float
    costs: float


class BusinessResults(BaseModel):
    revenue: float
    costs: float
    net: float
    clients: int
    errors: int
    innovations: int


class AgentInsight(BaseModel):
    agent_id: str
    name: str
    motivation: float
    stability: float
    productivity: float
    note: Optional[str] = None


class DayReport(BaseModel):
    day: int
    agent_situation: List[AgentInsight]
    results: BusinessResults
    decisions_impact: List[str]
    recommendations: List[str]


class GameState(BaseModel):
    game_id: str
    day: int
    company: Company
    agents: List[Agent]
    last_report: Optional[DayReport] = None


def _random_name(rng: random.Random) -> str:
    first = ["Nova", "Atlas", "Vega", "Orion", "Lumen", "Echo"]
    last = ["Core", "Pulse", "Stack", "Logic", "Prime", "Grid"]
    return f"{rng.choice(first)} {rng.choice(last)}"


def _random_role(rng: random.Random) -> str:
    roles = ["Ops", "Marketing", "Finance", "Support", "R&D"]
    return rng.choice(roles)


def _random_autonomy(rng: random.Random) -> str:
    levels = ["low", "medium", "high"]
    return rng.choice(levels)


def _random_skills(rng: random.Random) -> Dict[str, int]:
    return {skill: rng.randint(40, 90) for skill in SKILL_NAMES}


def _random_traits(rng: random.Random) -> List[str]:
    return rng.sample(TRAITS, k=3)


def generate_agent(rng: Optional[random.Random] = None) -> Agent:
    rng = rng or random.Random()
    strengths = rng.sample(SKILL_NAMES, k=2)
    weaknesses = [s for s in SKILL_NAMES if s not in strengths][:1]
    productivity = round(rng.uniform(0.6, 1.1), 2)
    salary = rng.randint(55000, 110000)
    return Agent(
        id=str(uuid.uuid4()),
        name=_random_name(rng),
        role=_random_role(rng),
        skills=_random_skills(rng),
        strengths=strengths,
        weaknesses=weaknesses,
        productivity=productivity,
        salary=salary,
        autonomy=_random_autonomy(rng),
        traits=_random_traits(rng),
    )


def initial_company(name: str) -> Company:
    return Company(name=name, cash=120_000.0, revenue=0.0, costs=0.0)


def create_initial_state(company_name: str, rng: Optional[random.Random] = None) -> GameState:
    rng = rng or random.Random()
    agents = [generate_agent(rng) for _ in range(3)]
    return GameState(
        game_id=str(uuid.uuid4()),
        day=1,
        company=initial_company(company_name),
        agents=agents,
        last_report=None,
    )
