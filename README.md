# BS Simulator

MVP d'un simulateur d'entreprise où les employés sont des agents IA. Le projet est découpé en deux dossiers :

- `backend/` : API FastAPI (Python, gérée avec `uv`).
- `frontend/` : app React Native (Expo) pour piloter le dashboard.
- `infra/supabase/` : schéma initial pour stocker les parties dans Supabase.

## Lancer le backend

```bash
cd backend
uv run uvicorn backend.app:app --reload
```

Ou via le script racine (lance backend + front) :

```bash
./start.sh
```

Endpoints principaux :
- `POST /game/start` : crée une partie et génère les premiers agents IA.
- `POST /game/action` : applique les décisions du gérant pour le jour en cours et retourne l'état du jour.
- `GET /game/state/{game_id}` : récupère l'état courant.

Modes LLM (choisir via `LLM_MODE`):
- `local` (par défaut) : recommandations heuristiques locales.
- `api` : mode placeholder pour un provider externe (à brancher plus tard).

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

L'app appelle l'API en `http://localhost:8000` par défaut. Pour cibler un autre backend, définir `EXPO_PUBLIC_API_URL` avant de démarrer Expo.

## Supabase

Le schéma minimal se trouve dans `infra/supabase/schema.sql`. Une implémentation `SupabaseGameRepository` est prévue mais non branchée dans le MVP pour rester léger. Configure `SUPABASE_URL` et `SUPABASE_KEY` côté backend quand l'intégration sera activée.

## Structure

- `backend/src/backend/service.py` : moteur de jeu (génération d'agents, application des actions, calcul des résultats).
- `backend/src/backend/llm.py` : interface LLM avec modes `local` et `api`.
- `frontend/App.tsx` : écrans dashboard + actions rapides sur les agents.
