# BS Simulator

MVP d'un simulateur d'entreprise où les employés sont modélisés comme des effectifs (personnes). Le projet est découpé en deux dossiers :

- `backend/` : API FastAPI (Python, gérée avec `uv`).
- `frontend/` : app React Native (Expo) pour piloter le dashboard.

L'interface web adopte un thème terminal noir/blanc (fond blanc, police monospace pixelisée) pour garder un look minimaliste.

## Lancer le backend

```bash
cd backend
uv run uvicorn backend.app:app --reload --port 8055
```

Variables d'environnement attendues (voir `backend/.env`):
- `SUPABASE_URL`, `SUPABASE_KEY` (optionnels)
- `SUPABASE_VERIFY_SSL` (optionnel, défaut `true`, à passer à `false` si un proxy TLS intercepte les certificats)

Note : `backend/.env` n'est pas versionné. Crée-le manuellement et ne commit jamais de clé sensible.

Le script `start.sh` charge automatiquement `backend/.env` s'il existe.

Ou via le script racine (lance backend + front) :

```bash
./start.sh
```

Le script `start.sh` installe automatiquement les dépendances (`uv sync --frozen` côté backend, `npm install` côté frontend) et libère les ports 8055/8056 avant de lancer les services.

Endpoints principaux :
- `POST /game/start` : crée une partie et génère les premiers effectifs.
- `POST /game/action` : applique les décisions du gérant pour le jour en cours et retourne l'état du jour.
- `GET /game/state/{game_id}` : récupère l'état courant.

LLM : le backend embarque désormais un moteur heuristique local pour générer les recommandations, aucun appel API externe n'est effectué.

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
La barre supérieure affiche désormais un compte à rebours de 60 minutes (avec secondes et millisecondes) et un compteur de cash (initialisé à 10 €).

### Vue Effectifs

Chaque agent affiche un histogramme couvrant 5 compétences (Compétence Technique, Créativité, Communication, Organisation, Autonomie).  
Les valeurs vont de 1 à 10 et totalisent 20 points répartis aléatoirement à la création d'un employé; aucune action n'est proposée dans cet onglet, c'est un simple tableau de bord visuel.

### Vue Secteurs

L'onglet **Secteurs** permet de répartir les effectifs entre quatre zones (Développement Produit, Marketing, Service Client, Recherche & Dev).  
Sélectionne un agent (le badge devient noir) puis clique sur un secteur pour l'y affecter. Les quatre secteurs remplissent la partie centrale (grille 2x2 avec scroll interne si nécessaire) et la barre inférieure regroupe les effectifs non assignés pour libérer rapidement un agent.

## Supabase

Le backend persiste dans Supabase dès que `SUPABASE_URL` et `SUPABASE_KEY` sont fournis (sinon stockage en mémoire, cela est loggué au démarrage). Les tables attendues côté base sont : `companies`, `agents`, `game_states`, `manager_actions`. Le schéma est maintenu directement dans ton projet Supabase (plus de fichier SQL dans le repo).

- Variables côté backend : `SUPABASE_URL` (API URL) et `SUPABASE_KEY` (clé service ou anon selon tes règles).
- En environnement filtré/SSL intercepté, tu peux poser `SUPABASE_VERIFY_SSL=false` pour autoriser un certificat non signé (défaut: true).
- Sauvegardes effectuées : état de partie dans `game_states` (rapport inclus), synchro de l'entreprise et des agents, journal des actions manager dans `manager_actions` avec le jour concerné.

## Structure

- `backend/src/backend/service.py` : moteur de jeu (génération d'agents, application des actions, calcul des résultats).
- `backend/src/backend/llm.py` : moteur de recommandations heuristiques (pas d'API externe).
- `frontend/App.tsx` : écrans dashboard + actions rapides sur les effectifs (personnes).
