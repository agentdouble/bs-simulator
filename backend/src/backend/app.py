import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .llm import get_llm_engine
from .repositories import GameRepository, InMemoryGameRepository, SupabaseGameRepository
from .schemas import (
    ActionRequest,
    ActionResponse,
    GameStateResponse,
    HireRequest,
    HireResponse,
    InterviewRequest,
    InterviewResponse,
    RecruitmentRequest,
    RecruitmentResponse,
    StartGameRequest,
    StartGameResponse,
)
from .service import GameService


logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

settings = get_settings()


def _build_repository(settings) -> GameRepository:
    supabase_url, supabase_key = settings.supabase_url, settings.supabase_key
    if supabase_url or supabase_key:
        if not supabase_url or not supabase_key:
            raise ValueError("Configuration Supabase incomplète : fournir SUPABASE_URL et SUPABASE_KEY")
        logger.info("Stockage Supabase activé (verify_ssl=%s)", settings.supabase_verify_ssl)
        return SupabaseGameRepository(supabase_url, supabase_key, verify_ssl=settings.supabase_verify_ssl)

    logger.info("Stockage en mémoire (Supabase non configuré)")
    return InMemoryGameRepository()


repository = _build_repository(settings)
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


@app.post("/recruitment/candidates", response_model=RecruitmentResponse)
def generate_candidates(payload: RecruitmentRequest) -> RecruitmentResponse:
    candidates = service.generate_candidates(payload)
    return RecruitmentResponse(candidates=candidates)


@app.post("/recruitment/interview", response_model=InterviewResponse)
def interview_candidate(payload: InterviewRequest) -> InterviewResponse:
    reply = service.interview_candidate(payload)
    return InterviewResponse(reply=reply)


@app.post("/recruitment/hire", response_model=HireResponse)
def hire_candidate(payload: HireRequest) -> HireResponse:
    state = service.hire_candidate(payload)
    return HireResponse(state=state)
