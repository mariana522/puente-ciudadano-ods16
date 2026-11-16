# AGENTS.md

Spanish-language academic platform for ODS 16 (Colombian legal/social orientation). This repo contains **three overlapping stacks plus duplicated file trees**; decide which runtime you are touching before editing.

`README.md` only documents the PHP/XAMPP + Vercel path. The Node and Flask/RAG systems below are not described there; trust the code.

## Runtime surfaces

- **Node HTTP server — `server.js`, port 3001 (`npm start`)**
  Serves static files, Socket.io realtime chat, and REST: `/api/casos`, `/api/mensajes`, `/api/agenda`, `/api/upload`, `/api/attachments/:id`, `/api/daily_room`, `/uploads/*`, `/health`.
  `/api/upload` usa Multer en memoria (10 MB) y `/api/attachments/:id` sirve el archivo desde un almacén acotado en memoria (TTL/cupo); los adjuntos no sobreviven un reinicio. `/uploads/*` queda sólo para archivos heredados en disco.
  Also **proxies `/api/rag/*` to the Flask service** (`RAG_SERVICE_URL`, default `http://127.0.0.1:5000`), so the browser always calls same-origin relative URLs.
  Persists to JSON files under `database/`: `messages_store.json`, `cases_store.json`, plus `agenda_store.json` / `rooms_store.json` at runtime.
- **Flask RAG — `app.py`, port 5000 (`python app.py`)**
  Serves the same UI plus `/api/rag/*`: `estado`, `buscar`, `ingerir`, `orientar`, `peticion/pdf`, `consultas`.
  Uses `puente_rag.db` (SQLite) unless `DATABASE_URL` / MySQL is configured.
- **PHP API — `backend/` and `api/`**
  XAMPP/MySQL alternative consumed by `db.js`; the frontend silently falls back to `LocalStorage`/`PuenteDB` when PHP is unavailable.

## Duplicate files: the main trap

- Root `index.html`, `app.js`, `styles.css`, `db.js`, `assets/` are the **current** frontend (root `index.html` is v10.x and loads `agente_rag.js`; recent commits only touch root). `server.js` serves root files first and falls back to `frontend/`.
- `frontend/` is a **stale copy**, but `vercel.json` rewrites all requests to `frontend/`. Changes made only at root will not appear on Vercel.
- `backend/*.php` and `api/*.php` are byte-identical mirrors. Change both or neither.
- SQL schemas conflict:
  - `database/schema.sql` + `seed.sql` + `puente_ciudadano_dump.sql`: normalized 3FN schema with `vista_casos_resumen` (used by `casos.php` / `mensajes.php`).
  - `database.sql` + `database/backup_puente_ciudadano.sql`: older flat schema with `usuarios.password`, `casos.ciudadano`, `mensajes.caso_codigo` (what `auth.php` reads).
  - No single SQL file satisfies every PHP endpoint. Verify the queries before "aligning" schemas.
  - `database/puente_ciudadano.sqlite` is the committed PHP fallback DB.

## Commands

Node:

- `npm install`
- `npm start` (or `npm run server`) → http://localhost:3001
- `npm run chat` → socket-only server; don't run alongside `npm start` unless you intentionally split traffic.
- No JS lint/format/typecheck/CI exists, and `npm test` is a deliberately failing stub.

RAG / Python:

- `pip install -r requirements.txt`
- `python sembrar_normativa.py` → regenerates `normativas/*.pdf` and seeds `puente_rag.db`. Rerunning appends duplicate documents/fragments; delete the DB to reseed cleanly.
- `python app.py` → http://localhost:5000. With `.env`'s `DB_CONNECTION=mysql` it waits ~2s for MySQL, then falls back to `puente_rag.db`.
- `python test_rag.py` → unit tests, in-memory SQLite, no seed or API key required.
- `python test_integral.py` → integration checks; **requires a seeded `puente_rag.db`** (fresh clones fail at TEST 5) and writes rows to `consultas_agente`.
- `python demo_avance.py` → console demo.

Run `node server.js` and `python app.py` together for the full UI + RAG: when served on port 3001, `server.js` proxies `/api/rag/*` to `http://127.0.0.1:5000`; `agente_rag.js` still targets Flask port 5000 directly on localhost when the page is served from another local port.

## Environment and data gotchas

- `.env` is gitignored; copy `.env.example` on a fresh clone.
- `GEMINI_API_KEY` is read by `agente.py`, `ingesta.py`, and `recuperacion.py` and is documented in `.env.example` (section 7). Without it, embeddings and answers use deterministic/heuristic fallbacks (tests still pass, results are weaker).
- Frontend backend URL comes from inline `window.PUENTE_CONFIG` in `index.html`: localhost → `http://localhost:3001`, any other host → same origin. Override with `window.SERVER_URL`, `window.SOCKET_URL`, or `window.PUENTE_API_BASE`.
- RAG calls in `agente_rag.js` are relative/same-origin (`/api/rag/...`) outside localhost; `server.js` proxies them to `RAG_SERVICE_URL`. On Render the Node service is the public entry point and Flask must be deployed as a separate service — see `DEPLOY_RAG_RENDER.md` and `render.yaml`. Unknown `/api/*` paths now return JSON 404 instead of `index.html`.
- Flask reads `PORT` (Render) and binds `0.0.0.0`; `FLASK_DEBUG` controls debug mode. Production start command: `gunicorn --bind 0.0.0.0:$PORT --timeout 180 --workers 1 app:app` (or `python app.py`).
- Vercel is static-only (`vercel.json`): no Node, PHP, or Flask, so data/auth fall back to browser `LocalStorage`.
- Running the Node app mutates tracked `database/messages_store.json` / `cases_store.json` and `database/uploads/`. Revert test artifacts before committing.
- `puente_rag.db` is gitignored but exists locally with seeded fragments; `test_integral.py` depends on that state.

## Conventions

- Keep user-facing copy, validation errors, and legal/domain terminology in Spanish (Colombia).
- Case codes look like `CAS-00138`; Socket.io rooms normalize them to `case_cas00138`.
- Seed logins use password `password123` (listed in `README.md`); frontend seed state lives in `db.js` (`SEED_USERS`, `SEED_CASES`).
- `normativas/*.pdf` are small generated fixtures from `sembrar_normativa.py`, not official source PDFs.
