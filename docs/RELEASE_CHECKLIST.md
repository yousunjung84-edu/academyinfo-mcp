# Release Checklist: academyinfo-mcp

Current state: v0.1 public-transition candidate. `docs/release-audit.md` recommends GitHub public GO; `npm publish` remains on hold.

## Completed pre-public gates

- [x] Package version set to `0.1.0`.
- [x] Runtime decision made: keep built-in `node:sqlite`.
- [x] Node engine set to `>=24.15.0`.
- [x] Code license set to `MIT`.
- [x] Code license and bundled data license documented separately.
- [x] Runtime and dev dependencies use explicit semver ranges with caret notation.
- [x] README polished for public readers: quickstart, no-key operation, client config, non-affiliation disclaimer, KOGL-1 attribution, data vintage, and data refresh policy.
- [x] Closed-school or no-data zero-value caveat documented.
- [x] `npm pack --dry-run` package posture reviewed: raw files, `.env`, `.omo/ulw-loop`, service keys, private paths, `.insane-review`, and `15139279` data artifacts excluded.
- [x] Git-history secret/private-path scan externally verified with 0 hits.
- [x] `git ls-files .insane-review` verified empty.
- [x] `.insane-review/` is gitignored.
- [x] `data/raw` and `.env` externally verified as never tracked.
- [x] Release audit updated for public transition.

## Open before flipping GitHub public

- [ ] Flip private to public in GitHub settings.
- [ ] Verify README rendering, repository description, and repository topics after visibility change.
- [ ] Optional: decide whether to run a history scrub before public transition. Current audit does not treat this as a blocker.

## Open after GitHub public

- [ ] Run an external-user smoke test from a clean environment: clone or install, configure a real MCP client, and run a comparison.
- [ ] Monitor issues and feedback for the first 1-2 days.
- [ ] Keep `npm publish` on hold until clean-environment install, MCP client smoke test, npm account/package-name checks, and owner approval pass.
- [ ] Optional: register in MCP directories after public smoke testing.

## Maintenance

- [ ] Keep the data refresh SOP current: download source XLSX, rerun evidence lock, rebuild seed, update manifest and checksum, rerun package audit.
- [ ] Verify header-change detection on every refresh.
- [ ] Track `node:sqlite` stabilization and maintain the Node version requirement.
- [ ] Keep KOGL-1 attribution intact.
- [ ] Burn down v0.2 backlog items separately.
- [ ] Keep v0.3 OpenAPI and `15139279` granular employment work outside v0.1.
