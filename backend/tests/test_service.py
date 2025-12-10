from backend.llm import LLMEngine
from backend.repositories import InMemoryGameRepository
from backend.schemas import ActionRequest, ManagerAction, StartGameRequest
from backend.service import GameService


class StubLLMEngine(LLMEngine):
    def generate_recommendations(self, state, report):
        return ["Recommandation test"]

    def generate_persona_prompt(self, agent, company_name):
        return f"Persona {agent.name}"


def test_start_game_creates_state():
    service = GameService(InMemoryGameRepository(), StubLLMEngine())
    state = service.start_game(StartGameRequest(company_name="Nova Corp"))

    assert state.game_id
    assert state.day == 1
    assert len(state.agents) >= 3
    assert state.last_report is not None
    assert state.company.name == "Nova Corp"
    assert all(agent.persona_prompt for agent in state.agents)


def test_apply_actions_updates_day_and_agents():
    service = GameService(InMemoryGameRepository(), StubLLMEngine())
    state = service.start_game(StartGameRequest(company_name="Nova Corp"))

    target_agent = state.agents[0]
    request = ActionRequest(
        game_id=state.game_id,
        actions=[ManagerAction(agent_id=target_agent.id, action="train", focus="marketing")],
    )

    next_state, report = service.apply_actions(request)

    assert next_state.day == 2
    assert report.day == 2
    updated_agent = next(a for a in next_state.agents if a.id == target_agent.id)
    assert updated_agent.motivation >= target_agent.motivation
    assert next_state.company.cash != state.company.cash
