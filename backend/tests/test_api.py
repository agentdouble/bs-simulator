import os

from fastapi.testclient import TestClient

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from backend import app as app_module
from backend.llm import LLMEngine


class StubLLMEngine(LLMEngine):
    def generate_recommendations(self, state, report):
        return ["Recommandation via stub"]

    def generate_persona_prompt(self, agent, company_name):
        return f"Persona {agent.name}"

    def simulate_interview(self, agent, messages, company_name):
        return f"Réponse stub entretien pour {agent.name}"


app_module.llm_engine = StubLLMEngine()
app_module.service.llm_engine = app_module.llm_engine
client = TestClient(app_module.app)


def test_start_and_fetch_state_via_api():
    response = client.post("/game/start", json={"company_name": "Test Co"})
    assert response.status_code == 200
    data = response.json()
    game_id = data["state"]["game_id"]
    assert data["state"]["agents"][0]["persona_prompt"].startswith("Persona")

    fetch = client.get(f"/game/state/{game_id}")
    assert fetch.status_code == 200
    fetched_state = fetch.json()["state"]
    assert fetched_state["company"]["name"] == "Test Co"


def test_action_endpoint_returns_report():
    start = client.post("/game/start", json={"company_name": "Action Co"})
    game_id = start.json()["state"]["game_id"]
    agent_id = start.json()["state"]["agents"][0]["id"]

    payload = {"game_id": game_id, "actions": [{"agent_id": agent_id, "action": "support"}]}
    res = client.post("/game/action", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["report"]["day"] == 2
    assert body["report"]["results"]["revenue"] >= 0


def test_preflight_options_game_start():
    res = client.options(
        "/game/start",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "*"


def test_recruitment_endpoints_flow():
    start = client.post("/game/start", json={"company_name": "Hiring Co"})
    assert start.status_code == 200
    initial_agents = len(start.json()["state"]["agents"])
    game_id = start.json()["state"]["game_id"]

    candidates_res = client.post("/recruitment/candidates", json={"game_id": game_id, "count": 2})
    assert candidates_res.status_code == 200
    candidates_body = candidates_res.json()
    assert len(candidates_body["candidates"]) == 2
    candidate = candidates_body["candidates"][0]

    interview_res = client.post(
        "/recruitment/interview",
        json={
            "game_id": game_id,
            "candidate": candidate,
            "messages": [{"sender": "manager", "content": "Parlez-moi de vous"}],
        },
    )
    assert interview_res.status_code == 200
    assert "Réponse stub entretien" in interview_res.json()["reply"]

    hire_res = client.post("/recruitment/hire", json={"game_id": game_id, "candidate": candidate})
    assert hire_res.status_code == 200
    final_agents = len(hire_res.json()["state"]["agents"])
    assert final_agents == initial_agents + 1
