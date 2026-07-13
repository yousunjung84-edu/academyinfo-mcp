# Manual first-publish runbook — `academyinfo-mcp@0.1.0`

One-page, human-run ceremony. Distilled from the 5-pass release plan (design record:
gajae RALPLAN final, SHA `7a14e7d6...`); the receipt/signature apparatus is intentionally
dropped as disproportionate for a one-time manual publish — see the owner decision of
2026-07-13. Goal: real users can run `npx -y academyinfo-mcp` in Claude Desktop / Cursor.

This is the operative first-publication procedure. It is self-contained: it does not
dispatch any GitHub Actions workflow and does not depend on the receipt chain. The
optional read-only workflow verifiers are covered in the appendix.

**Preconditions**
- [ ] Actions read-only migration merged (no workflow can publish or move dist-tags)
- [ ] `main` green: build / lint / test / package:check / doctor / audit all pass
- [ ] npm account 2FA active with a classic TOTP authenticator (not passkey-only)
- [ ] `npm view academyinfo-mcp` still errors (name unregistered)
- [ ] Node 22.x + npm 11.x (`node -v`, `npm -v`; ceremony was designed on v22.23.1 / 11.5.1)

## Phase A — publish under `candidate` tag (~15 min)

```bash
# 1. Clean room: fresh clone, isolated userconfig, no shell history
cd "$(mktemp -d)" && unset HISTFILE
git clone --depth 1 https://github.com/yousunjung84-edu/academyinfo-mcp.git .
npm ci && npm run build && npm test && npm run package:check
npm pack   # -> academyinfo-mcp-0.1.0.tgz

export NPM_CONFIG_USERCONFIG="$PWD/.npmrc.ceremony"
printf 'registry=https://registry.npmjs.org/\nbrowser=false\n' > "$NPM_CONFIG_USERCONFIG"
chmod 600 "$NPM_CONFIG_USERCONFIG"
```

- [ ] **2. Create token in npm web UI** — granular, **1-day expiry**, permission **read+write**,
      packages **all** (name not registered yet, so package scope is impossible),
      **bypass 2FA unchecked**. Copy once.

```bash
# 3. Token enters the temp userconfig only — never argv, env, or history
read -rs NPM_CEREMONY_TOKEN
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_CEREMONY_TOKEN" >> "$NPM_CONFIG_USERCONFIG"
unset NPM_CEREMONY_TOKEN   # and clear the OS clipboard now

npm whoami --registry=https://registry.npmjs.org/     # must print your username

# 4. THE write — once. Answer the TOTP prompt interactively; never --otp.
npm publish ./academyinfo-mcp-0.1.0.tgz --tag candidate --ignore-scripts --access public --registry=https://registry.npmjs.org/
```

- [ ] **5. Verify anonymously** (different terminal, no token):
      `npm view academyinfo-mcp dist-tags` → `{ candidate: '0.1.0' }`, **no `latest`**.
- [ ] **6. Revoke immediately** — delete the token in npm web UI, then confirm death:
      `npm whoami` (same ceremony terminal) must fail with E401/ENEEDAUTH
      (network/5xx errors don't count — retry until an auth rejection; docs allow up to 1 h).
- [ ] **7. Destroy**: `rm "$NPM_CONFIG_USERCONFIG"` and delete the temp directory.

## Phase B — smoke test as a real user

```bash
npx -y academyinfo-mcp@0.1.0   # fresh shell; should start and speak JSON-RPC on stdio
```
- [ ] Claude Desktop (`claude_desktop_config.json`) with
      `{"command":"npx","args":["-y","academyinfo-mcp@0.1.0"]}` — 8 tools appear,
      `explore_universities` answers a 전남대 query with source/year/unit provenance.

## Phase C — promote to `latest`

Same ceremony as Phase A steps 1(userconfig only)–7, with two differences:
- [ ] New 1-day token, but now scoped to **only the `academyinfo-mcp` package**.
- [ ] The single write is:
```bash
npm dist-tag add academyinfo-mcp@0.1.0 latest --registry=https://registry.npmjs.org/
```
- [ ] Anonymous verify: `dist-tags` → `{ candidate: '0.1.0', latest: '0.1.0' }`, then revoke + destroy as above.

## Phase D — make it adoptable (the actual goal)

- [ ] README top section: Quickstart with `npx -y academyinfo-mcp` + copy-paste config
      blocks for Claude Desktop, Cursor, and generic MCP stdio clients
- [ ] Fresh-machine check: on a machine/account that never built this repo,
      the README quickstart alone gets a working 8-tool server
- [ ] Optional reach: submit to MCP server directories/registries; short KR intro post
      (대학알리미 공시데이터를 AI 비서에서 자연어로 — 무키·무로그인)

## Rules that survive from the full plan

Never: token in argv/env/shell history/clipboard-manager, `--otp` flag, publish from a
directory (tarball only), skip `--ignore-scripts`, automate the ceremony, or **retry a
failed 0.1.0 publish** — any failure means stop, investigate, and fix-forward with 0.1.1.
GitHub Actions stay read-only forever; every registry write is a human at a terminal.

## Appendix — optional read-only workflow verifiers

The repository ships read-only verifier workflows (`candidate-release.yml` tarball
handoff, `public-candidate-verify.yml` three-lane install proof, `client-evidence.yml`
ingest, `promote-release.yml` readiness). They hold no npm credential or OIDC authority
and never mutate the registry. Using them is optional evidence gathering, not a
precondition for this runbook.

Known limitation: their predecessor inputs (`expected_previous_latest`) accept only an
exact SemVer and `promote-release.yml` parses an existing public `dist-tags.latest`, so
these verifiers **cannot run for the first publication while `latest` is absent**. Do
not feed them a sentinel, placeholder, or fabricated SemVer. If workflow-verified
evidence is wanted for first publication, implement absent-`latest` support (a typed
`absent | present` predecessor union) as a separate reviewed change; for subsequent
releases (0.1.1+), the verifiers work as-is because a real previous `latest` exists.
