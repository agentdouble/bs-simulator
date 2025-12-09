# BS Simulator

MVP d'un simulateur d'entreprise où les employés sont modélisés comme des effectifs (personnes). Le projet est découpé en deux dossiers :

- `backend/` : API FastAPI (Python, gérée avec `uv`).
- `frontend/` : app React Native (Expo) pour piloter le dashboard.
- `infra/supabase/` : schéma initial pour stocker les parties dans Supabase.

## Lancer le backend

```bash
cd backend
uv run uvicorn backend.app:app --reload --port 8055
```

Variables d'environnement attendues (voir `backend/.env`):
- `OPENAI_API_KEY` (obligatoire pour le LLM OpenAI)
- `OPENAI_MODEL` (optionnel, défaut `gpt-4o-mini`)
- `SUPABASE_URL`, `SUPABASE_KEY` (optionnels)

Le script `start.sh` charge automatiquement `backend/.env` s'il existe.

Ou via le script racine (lance backend + front) :

```bash
./start.sh
```

Endpoints principaux :
- `POST /game/start` : crée une partie et génère les premiers effectifs.
- `POST /game/action` : applique les décisions du gérant pour le jour en cours et retourne l'état du jour.
- `GET /game/state/{game_id}` : récupère l'état courant.

LLM : le backend utilise exclusivement l'API OpenAI (modèle `gpt-4o-mini` par défaut). Fournis une clé via `OPENAI_API_KEY` avant de lancer le serveur.

Tests backend :

```bash
cd backend
uv run pytest
```

## Lancer le frontend (Expo)

```bash
cd frontend
npm start
```

L'app appelle l'API en `http://localhost:8055` par défaut. Pour cibler un autre backend, définir `EXPO_PUBLIC_API_URL` avant de démarrer Expo.
Le script `start.sh` lance Expo en mode web (front accessible sur `http://localhost:8056`).  
L'interface web est pensée pour tenir sur une seule page, découpée en sections avec onglets (Synthèse, Effectifs, Finance, Rapport), sans scroll infini.

## Supabase

Le backend persiste dans Supabase dès que `SUPABASE_URL` et `SUPABASE_KEY` sont fournis (sinon stockage en mémoire, cela est loggué au démarrage). Les tables attendues sont décrites dans `infra/supabase/schema.sql` (`companies`, `agents`, `game_states`, `manager_actions`). Applique ce script sur ton projet (SQL Editor Supabase ou CLI/`psql` selon ta stack).

- Variables côté backend : `SUPABASE_URL` (API URL) et `SUPABASE_KEY` (clé service ou anon selon tes règles).
- Sauvegardes effectuées : état de partie dans `game_states` (rapport inclus), synchro de l'entreprise et des agents, journal des actions manager dans `manager_actions` avec le jour concerné.

## Structure

- `backend/src/backend/service.py` : moteur de jeu (génération d'agents, application des actions, calcul des résultats).
- `backend/src/backend/llm.py` : interface LLM connectée à l'API OpenAI.
- `frontend/App.tsx` : écrans dashboard + actions rapides sur les effectifs (personnes).
