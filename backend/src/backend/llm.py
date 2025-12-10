from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import List

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .config import Settings
from .domain import Agent, DayReport, GameState
from .schemas import InterviewMessage

logger = logging.getLogger(__name__)


class LLMEngine(ABC):
    @abstractmethod
    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        raise NotImplementedError

    @abstractmethod
    def generate_persona_prompt(self, agent: Agent, company_name: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def simulate_interview(self, agent: Agent, messages: List[InterviewMessage], company_name: str) -> str:
        raise NotImplementedError


class LangChainLLMEngine(LLMEngine):
    def __init__(self, api_key: str, model: str) -> None:
        self.recommendation_chain = self._build_recommendation_chain(api_key, model)
        self.persona_chain = self._build_persona_chain(api_key, model)
        self.interview_model = self._build_interview_model(api_key, model)

    def generate_recommendations(self, state: GameState, report: DayReport) -> List[str]:
        context = self._build_recommendation_context(state, report)
        try:
            message = self.recommendation_chain.invoke({"context": context})
        except Exception as exc:
            logger.exception("Echec LangChain lors de la génération des recommandations")
            raise RuntimeError("Echec de génération de recommandations via LangChain") from exc

        recommendations = [line.lstrip("-• ").strip() for line in message.splitlines() if line.strip()]
        if not recommendations:
            raise RuntimeError("Aucune recommandation exploitable renvoyée par le LLM")

        logger.info("Recommandations LLM générées pour le jour %s", report.day)
        return recommendations[:4]

    def generate_persona_prompt(self, agent: Agent, company_name: str) -> str:
        payload = {
            "company": company_name,
            "name": agent.name,
            "role": agent.role,
            "traits": ", ".join(agent.traits),
            "strengths": ", ".join(agent.strengths),
            "weaknesses": ", ".join(agent.weaknesses),
            "autonomy": agent.autonomy,
            "productivity": f"{agent.productivity:.2f}",
        }
        try:
            prompt = self.persona_chain.invoke(payload).strip()
        except Exception as exc:
            logger.exception("Echec LangChain lors de la création de persona pour %s", agent.id)
            raise RuntimeError("Echec de génération de la personnalité de l'agent") from exc

        if not prompt:
            raise RuntimeError("Prompt de personnalité vide")
        return prompt

    def simulate_interview(self, agent: Agent, messages: List[InterviewMessage], company_name: str) -> str:
        if not agent.persona_prompt:
            raise RuntimeError("Prompt de personnalité manquant pour l'entretien")

        chat_messages: List[SystemMessage | HumanMessage | AIMessage] = [
            SystemMessage(content=agent.persona_prompt),
            SystemMessage(
                content=(
                    f"Tu es en entretien pour un poste {agent.role} chez {company_name}. "
                    "Réponds en français en 2 phrases maximum, ton style reste professionnel et incarné."
                )
            ),
        ]
        for msg in messages:
            if msg.sender == "manager":
                chat_messages.append(HumanMessage(content=msg.content))
            else:
                chat_messages.append(AIMessage(content=msg.content))

        try:
            response = self.interview_model.invoke(chat_messages)
        except Exception as exc:
            logger.exception("Echec LangChain pendant l'entretien avec %s", agent.name)
            raise RuntimeError("Echec de simulation d'entretien via LangChain") from exc

        text = response.content.strip() if hasattr(response, "content") else str(response).strip()
        if not text:
            raise RuntimeError("Réponse d'entretien vide")
        return text

    def _build_recommendation_context(self, state: GameState, report: DayReport) -> str:
        agent_lines = []
        for agent in state.agents:
            skills = ", ".join(f"{name}:{score}" for name, score in sorted(agent.skills.items()))
            agent_lines.append(
                f"- {agent.name} ({agent.role}) prod {agent.productivity}, mot {agent.motivation}/100, "
                f"stab {agent.stability}/100, auto {agent.autonomy}, skills {skills}, traits: {', '.join(agent.traits)}"
            )

        return (
            f"Entreprise: {state.company.name} | Jour {report.day}\n"
            f"Cash: {state.company.cash:.0f} | Revenu: {report.results.revenue:.0f} | "
            f"Coûts: {report.results.costs:.0f} | Net: {report.results.net:.0f}\n"
            f"Clients: {report.results.clients} | Innovations: {report.results.innovations} | Incidents: {report.results.errors}\n"
            f"Décisions précédentes: {', '.join(report.decisions_impact)}\n"
            "Equipe:\n"
            + "\n".join(agent_lines)
        )

    def _build_recommendation_chain(self, api_key: str, model: str):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Tu es directeur des opérations d'une startup SaaS. "
                    "Produis des recommandations tactiques, courtes et actionnables en français.",
                ),
                (
                    "human",
                    "{context}\nRetourne 3 recommandations opérationnelles concises en liste à puces (phrase courte), ciblées sur des actions concrètes pour le prochain jour.",
                ),
            ]
        )
        model_client = ChatOpenAI(api_key=api_key, model=model, temperature=0.35, max_tokens=320)
        return prompt | model_client | StrOutputParser()

    def _build_persona_chain(self, api_key: str, model: str):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Tu es le générateur de personnalités d'une simulation d'entreprise. "
                    "Tu produis un prompt système pour un agent IA qui incarnera un collaborateur. "
                    "Le texte doit être en français, <120 mots, ton professionnel et incarné, sans listes ni puces.",
                ),
                (
                    "human",
                    "Entreprise: {company}\nNom: {name}\nRole: {role}\nTraits: {traits}\nPoints forts: {strengths}\nPoints faibles: {weaknesses}\nAutonomie: {autonomy}\nProductivite: {productivity}\nEcris le prompt final en parlant à la première personne pour ce collaborateur.",
                ),
            ]
        )
        model_client = ChatOpenAI(api_key=api_key, model=model, temperature=0.75, max_tokens=360)
        return prompt | model_client | StrOutputParser()

    def _build_interview_model(self, api_key: str, model: str) -> ChatOpenAI:
        return ChatOpenAI(api_key=api_key, model=model, temperature=0.65, max_tokens=220)


def get_llm_engine(settings: Settings) -> LLMEngine:
    return LangChainLLMEngine(api_key=settings.openai_api_key, model=settings.openai_model)
