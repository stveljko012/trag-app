# Trag

Fleet tracking web app by [ProSparrow](https://prosparrow.io). Trag sits on top of a self-hosted
Traccar server, which stays hidden from end users.

One deployment per client (single-tenant), each on its own subdomain.

## Layout

| Path      | What                                                             |
| --------- | ---------------------------------------------------------------- |
| `web/`    | `@trag/web`: Vite + React SPA (Serbian UI)                       |
| `api/`    | `@trag/api`: Hono API; also serves the built SPA from `./public` |
| `deploy/` | Snippets for the existing `/opt/traccar` compose stack and Caddy |

## Local development

Requires Node 22+ and Docker.

```sh
npm install
docker compose -f dev/compose.yml up -d db   # Postgres 17 with `trag`, `trag_test`, `traccar` DBs
cp .env.example .env                          # set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev                                   # API on :3000, Vite on :5173 (proxies /api to :3000)
```

Open http://localhost:5173 and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

On startup the API runs pending migrations from `api/migrations/` and, if the `users` table is
empty, creates the owner from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. To create it explicitly:
`npm run seed -w @trag/api` (no-op if that email already exists).

`docker compose -f dev/compose.yml up -d` also starts a local Traccar on http://localhost:8082
(device port 5027) for testing the integration.

### Traccar

Trag talks to Traccar only through its REST API (`api/src/traccar/traccar.ts`), as a dedicated
service user:

1. In the Traccar web UI (as admin), create a user, e.g. `trag-service`. For read-only testing
   against a production Traccar, tick **Read-only**; the real service user needs write access
   because Trag manages geofences (Phase 4).
2. Give it access to the devices it should see (Settings, Users, Devices link). In a single-tenant
   deployment that is all of them.
3. Log in as that user (or use the admin's user page) and generate a token:
   Settings, Preferences, Token. Set it as `TRACCAR_TOKEN`. Alternatively set
   `TRACCAR_USER` / `TRACCAR_PASS` for Basic auth.
4. `TRACCAR_URL` is `http://traccar:8082/api` inside the `gps` network, or for local development
   `http://localhost:8082/api` (dev compose) or an SSH tunnel to a server:
   `ssh -N -L 18082:<traccar-container-ip>:8082 user@server`, then `http://localhost:18082/api`.

Types for Traccar's API are generated from its OpenAPI spec into `api/src/traccar/schema.d.ts`:
`npm run gen:traccar -w @trag/api`. It runs openapi-typescript through `npx`, because that tool
still requires TypeScript 5 as a peer while this repo uses 6. The published spec is not complete
(stops actually return `latitude`/`longitude`, events carry `geofenceId`), so `traccar.ts` narrows
and corrects the generated types.

### Database

Trag uses its own database `trag` in the same Postgres instance as Traccar and never touches the
`tc_*` tables. Queries go through [Drizzle ORM](https://orm.drizzle.team); the schema lives in
`api/src/db/schema.ts`.

To change the schema, edit `schema.ts`, then generate a migration and commit it:

```sh
npm run db:generate -w @trag/api -- --name short_description   # writes api/drizzle/NNNN_*.sql
npm run db:migrate -w @trag/api                                 # or just restart the API
```

The API applies pending migrations on startup (under a Postgres advisory lock, so parallel starts
are safe). `npm run db:studio -w @trag/api` opens Drizzle Studio against `DATABASE_URL`.

In the dev stack, `dev/initdb/02-trag-schema.sh` applies the same migrations to `trag` and
`trag_test` when the Postgres volume is first created, so the tables are there for `psql` right
away. Init scripts only run on an empty volume; to rebuild from scratch:
`docker compose -f dev/compose.yml down -v && docker compose -f dev/compose.yml up -d db`.

DB integration tests run only when `TEST_DATABASE_URL` points at a disposable database:

```sh
TEST_DATABASE_URL=postgres://trag:trag@localhost:5432/trag_test npm test
```

| Script              | Purpose                   |
| ------------------- | ------------------------- |
| `npm run dev`       | API + web in watch mode   |
| `npm run build`     | Build web, then API       |
| `npm run lint`      | ESLint                    |
| `npm run format`    | Prettier (write)          |
| `npm run typecheck` | `tsc --noEmit` in both    |
| `npm test`          | Vitest in both workspaces |

## Docker

```sh
docker build -t trag .
docker run --rm -p 8080:3000 --env-file .env \
  -e DATABASE_URL=postgres://trag:trag@host.docker.internal:5432/trag trag
```

The image serves `/api/*`, then static files, then falls back to `index.html` for client routes.
Pushing to `main` builds and pushes `ghcr.io/<owner>/trag` via GitHub Actions.

## Deployment

One Trag per client, next to that client's Traccar stack in `/opt/traccar` (Postgres `db`,
`traccar`, `caddy` on the `gps` Docker network). Pushing to `main` builds
`ghcr.io/<owner>/trag:sha-<commit>` (and `:latest`) via GitHub Actions; no repository secrets are
needed, the workflow uses `GITHUB_TOKEN`.

### New client in 10 steps

1. **DNS:** point the client's subdomain (e.g. `uniquegarden.prosparrow.io`) at the server.
2. **Registry login** (once per server). The image is private; use a classic personal access token
   with only `read:packages`:
   ```sh
   echo <token> | docker login ghcr.io -u <github-user> --password-stdin
   ```
3. **Database:** create Trag's role and database in the existing Postgres (`traccar` is its
   superuser). Trag creates its tables on first start.
   ```sh
   cd /opt/traccar
   docker compose exec db psql -U traccar -d traccar \
     -c "CREATE ROLE trag LOGIN PASSWORD '<strong-password>'" \
     -c "CREATE DATABASE trag OWNER trag"
   ```
4. **Traccar service user:** in the Traccar UI as admin, create a user that is not an
   administrator, with _Device readonly_ and _Limit commands_ on, and give it access to the
   client's devices. Trag writes geofences, driver data stays in Trag.
5. **Token:** log in to Traccar as that user, generate a token (Preferences, Token).
6. **`/opt/traccar/trag.env`** from `.env.example`:
   ```sh
   NODE_ENV=production
   DATABASE_URL=postgres://trag:<strong-password>@db:5432/trag
   TRACCAR_URL=http://traccar:8082/api
   TRACCAR_TOKEN=<token from step 5>
   SESSION_SECRET=<openssl rand -hex 32>
   WEBHOOK_SECRET=<openssl rand -hex 32>
   ADMIN_EMAIL=<owner email>
   ADMIN_PASSWORD=<at least 10 characters>
   ADMIN_NAME=<owner name>
   ```
   The owner is created on first start while the users table is empty.
7. **Compose:** add the `trag` service from `deploy/compose.snippet.yml` to
   `/opt/traccar/compose.yml`, with the image tag you want to run.
8. **Caddy:** add the client block from `deploy/Caddyfile.snippet`, then
   `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
9. **Start:** `docker compose pull trag && docker compose up -d trag`, then check
   `docker compose logs -f trag` for `Applied`/`Created owner`/`listening` and open the subdomain.
10. **Traccar event forwarding** (once the webhook ships): add the `EVENT_FORWARD_*` variables from
    the snippet to the `traccar` service, put `TRAG_WEBHOOK_SECRET` (same as `WEBHOOK_SECRET`) in
    `/opt/traccar/.env`, and `docker compose up -d traccar`. Teltonika devices resend buffered
    records, so the short restart loses no positions.

### Updating and rolling back

Change the `trag` image tag in `compose.yml` to the new `sha-<commit>` and run
`docker compose pull trag && docker compose up -d trag`. Migrations run on startup. To roll back,
set the previous tag; note that a migration that already ran is not undone.
