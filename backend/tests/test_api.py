import os

from fastapi.testclient import TestClient

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from backend import app as app_module
from backend.llm import LLMEngine


class StubLLMEngine(LLMEngine):
    def generate_recommendations(self, state, report):
        return ["Recommandation via stub"]


app_module.llm_engine = StubLLMEngine()
app_module.service.llm_engine = app_module.llm_engine
client = TestClient(app_module.app)


def test_start_and_fetch_state_via_api():
    response = client.post("/game/start", json={"company_name": "Test Co"})
    assert response.status_code == 200
    data = response.json()
    game_id = data["state"]["game_id"]

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
