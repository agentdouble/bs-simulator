import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .llm import get_llm_engine
from .repositories import InMemoryGameRepository
from .schemas import ActionRequest, ActionResponse, GameStateResponse, StartGameRequest, StartGameResponse
from .service import GameService


logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()
repository = InMemoryGameRepository()
llm_engine = get_llm_engine(settings)
service = GameService(repository, llm_engine)

app = FastAPI(title="BS Simulator API", version="0.1.0")

logger.info("Mode LLM API initialisé avec le modèle %s", settings.openai_model)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/game/start", response_model=StartGameResponse)
def start_game(payload: StartGameRequest) -> StartGameResponse:
    state = service.start_game(payload)
    return StartGameResponse(state=state)


@app.post("/game/action", response_model=ActionResponse)
def apply_action(payload: ActionRequest) -> ActionResponse:
    state, report = service.apply_actions(payload)
    return ActionResponse(state=state, report=report)


@app.get("/game/state/{game_id}", response_model=GameStateResponse)
def get_state(game_id: str) -> GameStateResponse:
    state = service.get_state(game_id)
    return GameStateResponse(state=state)
