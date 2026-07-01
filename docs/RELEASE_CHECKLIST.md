# Release Checklist — academyinfo-mcp

Current state: private v0.1 candidate. Verified five-indicator `15118998` seed.
Public transition and `npm publish` remain separate human-approved steps.

## A. Before public transition (pre-public gate)

- [ ] **Decide package version**: `0.0.0` → `0.1.0` (or `0.1.0-alpha.0` to signal early).
- [ ] **Decide SQLite driver**: resolve the `node:sqlite` experimental warning — either
  (a) accept it, document "requires Node >= 22, experimental sqlite", and pin `engines`,
  or (b) switch to `better-sqlite3` (native, prebuild friction). Pick one and document it.
- [ ] **Decide on `evidence/sample-rows`**: contains real institution rows (public KOGL-1
  data, legally fine) — recommend excluding from the public repo unless useful.
- [ ] **Polish README for public**: one-line pitch · `npx`/clone quickstart working from
  the bundled seed only · Claude Desktop / Cursor config examples · KOGL-1 attribution made
  prominent · non-affiliation disclaimer · **data vintage stated** (2025 disclosure; 등록금
  2026; `seed_is_latest_claim=false` = not the latest).
- [ ] **Closed-school zero note** in README (until the v0.2 warning ships): "0 may mean
  closed / no-data, not a real 0%".
- [ ] **GitHub repo description + topics** (`mcp`, `korea`, `university`, `public-data`, `kogl`).
- [ ] **Final re-audit**: `npm pack --dry-run` excludes raw / `.env` / `.omo/ulw-loop` /
  service keys / `15139279` data; update `docs/release-audit.md`.
- [ ] **Scan git history** for secrets / private paths (public exposes history too).
- [ ] **Final owner approval** before flipping to public.

## B. Immediately after going public (launch)

- [ ] Flip private → public (GitHub settings); verify README render, description, topics.
- [ ] **External-user smoke**: clone / `npx` in a clean environment → install in Claude / Cursor
  → run a comparison, from an outside user's perspective.
- [ ] (Optional) Register in an MCP directory (modelcontextprotocol servers, Smithery, etc.)
  — discoverability drives stars.
- [ ] Watch issues / feedback for 1–2 days and respond.
- [ ] **`npm publish` is a separate later decision** (public GitHub → real-use QA → npm).

## C. Ongoing updates & maintenance

- [ ] ⭐ **Data refresh SOP** (most important — freshness drives trust for a public tool):
  download the new 대학알리미 XLSX → re-run evidence-lock → rebuild seed → update manifest
  year/checksum → re-run release-audit. Record the cadence and procedure as an SOP in docs.
- [ ] **Header-change detection**: if a new file's year / unit / column names change, the
  evidence-lock must fail-closed and catch it (verify every refresh; never remap silently).
- [ ] **Burn down v0.2 backlog**: closed-school zero-value warning · more KCUE disclosure
  datasets + institution identity resolver · richer comparison output.
- [ ] **v0.3**: OpenAPI bridge (reserved service key = freshness) · `15139279` granular
  employment stats.
- [ ] Track `node:sqlite` stabilization · maintain deps / Node version · handle issues & PRs ·
  **keep KOGL-1 attribution intact**.

## Key point

After going public, stars hinge on **data freshness** more than features. The current seed is
2025 disclosure (marked not-latest). Decide the refresh cadence and state it in the README before
public, so the tool is not mistaken for stale data.
