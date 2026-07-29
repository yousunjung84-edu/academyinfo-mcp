# Manual data refresh (15118998)

Automated acquisition is configured but cannot complete. This document is the
supported refresh path until that changes.

## Why refresh is manual

Run `30367427230` (2026-07-28, `workflow_dispatch`) executed every acquisition step
and produced a sanitized validation report with:

| field | value |
|---|---|
| `redirect_hops` | `www.data.go.kr/data/15118998/fileData.do` — HTTP `200` |
| `license_observation` | `pass`, `KOGL-1` |
| `metadata_fingerprint_v1` | produced |
| `download` | `null` |
| `failure_code` | `DOWNLOAD_LINK_MISSING` |

The reviewed canonical page is reachable and its license is confirmed, but it exposes
no download link the bounded read-only fetcher can follow. Rule 1 of
[`refresh-release-runbook.md`](refresh-release-runbook.md) forbids guessing an endpoint
or scraping a replacement, so the workbook is retrieved by a person instead.

The weekly schedule on `.github/workflows/refresh-acquire-validate.yml` was removed on
2026-07-28 for this reason. The workflow remains available via manual dispatch, and the
schedule should be restored once acquisition can succeed.

## Prerequisites

- Node 22 (`engines` is `>=22 <23`). `better-sqlite3` binds its ABI to the Node major
  used for install, so run `npm ci` under Node 22 — Node 24 produces
  `NODE_MODULE_VERSION` conflicts in the stdio harness tests.
- Write access to a repository checkout. Nothing here touches npm or the published
  package; publication remains [`manual-publish-runbook.md`](manual-publish-runbook.md).

## Procedure

1. Open the reviewed canonical page and download the official workbook
   `대학주요정보.xlsx`. Use the official page only; do not substitute a mirror,
   aggregator copy, or constructed download URL.
2. Place it at the path the seed writer expects:

   ```
   data/raw/15118998/대학주요정보.xlsx
   ```

3. Rebuild the seed from that workbook:

   ```bash
   npm ci          # under Node 22
   npm run build
   node dist/scripts/seed15118998.js
   ```

   `scripts/seed15118998-config.ts` declares the outputs: the seed database, manifest,
   and indicator catalog under `data/seed/`, plus header-snapshot, sample-row, and
   checksum evidence under `evidence/`.

4. Verify:

   ```bash
   npm test
   ```

5. Review the diff before committing. Raw workbooks are not package contents and must
   not be committed.

## Header-year trap

Indicator source columns carry the snapshot year inside the header text, for example
`"신입생 경쟁률\n(2025,:1)"`. When a new publication year ships, those headers change and
the seed writer will not find the configured columns.

When that happens, update `indicatorSpecs` in `scripts/seed15118998-config.ts`
(`source_column`, `year`) and the snapshot-year table in `README.md` together. The
writer expects sheet `Sheet1`; a valid workbook may carry 24 or 26 columns.

## Scope

Refresh approval stays semantic, as described in
[`refresh-release-runbook.md`](refresh-release-runbook.md): a changed checksum is not a
rejection reason and a matching one does not authenticate a source. Releasing refreshed
data is a separate, unchanged process.
