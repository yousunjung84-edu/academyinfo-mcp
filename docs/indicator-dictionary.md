# Indicator Dictionary

## Authority and evidence boundary

This document describes the seventeen logical indicators in the bundled point-in-time derivative of dataset `15118998`. It does not claim that the snapshot is current or latest, select a public package version or source endpoint, or prove publication, public installation, client execution, promotion, rollback, or administrator approval.

`data/seed/indicators.json` is the sole packaged source-derived catalog. It is closed-schema, KOGL-attributed JSON data, independently cross-checked against the manifest and logical database tables. It is not executable TypeScript/JavaScript, and the runtime has no generated or hard-coded catalog fallback.

## Exact catalog

| Indicator | Korean label | Source dataset | Source column | Year | Unit | Default enabled |
| --- | --- | --- | --- | ---: | --- | --- |
| `competition_rate` | 신입생 경쟁률 | `15118998` | `신입생 경쟁률\n(2025,:1)` | 2025 | `:1` | yes |
| `fill_rate` | 신입생 충원율 | `15118998` | `신입생 충원율\n(2025,%)` | 2025 | `%` | yes |
| `employment_rate` | 취업률 | `15118998` | `취업률\n(2025,%)` | 2025 | `%` | yes |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | `15118998` | `학생 1인당 연간 장학금\n(2025,원)` | 2025 | `원` | yes |
| `avg_tuition` | 평균 등록금 | `15118998` | `평균 등록금\n(2026,천원)` | 2026 | `천원` | yes |
| `admission_quota` | 입학정원 | `15118998` | `입학정원\n(2025,명)` | 2025 | `명` | yes |
| `graduates_count` | 졸업생수 | `15118998` | `졸업생수\n(2025,명)` | 2025 | `명` | yes |
| `fulltime_faculty_count` | 전임교원수(학부+대학원) | `15118998` | `전임교원수(학부+대학원)\n(2025,명)` | 2025 | `명` | yes |
| `enrolled_students` | 재학생 | `15118998` | `재학생\n(2025,명)` | 2025 | `명` | yes |
| `international_students` | 외국인 학생 수 | `15118998` | `외국인 학생 수\n(2025,명)` | 2025 | `명` | yes |
| `students_per_fulltime_faculty` | 전임교원 1인당 학생 수(학생정원기준)(학부+대학원) | `15118998` | `전임교원 1인당 학생 수(학생정원기준)(학부+대학원)\n(2025,명)` | 2025 | `명` | yes |
| `fulltime_faculty_ratio_quota` | 전임교원 확보율(학생정원기준)(학부+대학원) | `15118998` | `전임교원 확보율(학생정원기준)(학부+대학원)\n(2025,%)` | 2025 | `%` | yes |
| `fulltime_faculty_ratio_enrolled` | 전임 교원 확보율(재학생 기준)(학부+대학원) | `15118998` | `전임 교원 확보율(재학생 기준)(학부+대학원)\n(2025,%)` | 2025 | `%` | yes |
| `fulltime_faculty_lecture_ratio` | 전임교원 강의 담당 비율 | `15118998` | `전임교원 강의 담당 비율\n(2025,%)` | 2025 | `%` | yes |
| `education_expense_per_student` | 학생 1인당 교육비(학부+대학원) | `15118998` | `학생 1인당 교육비(학부+대학원)\n(2025,천원)` | 2025 | `천원` | yes |
| `dormitory_capacity_rate` | 기숙사 수용율(학부+대학원) | `15118998` | `기숙사 수용율(학부+대학원)\n(2025,%)` | 2025 | `%` | yes |
| `books_per_student` | 학생 1인당 도서 자료 수(학부+대학원) | `15118998` | `학생 1인당 도서 자료 수(학부+대학원)\n(2025,권)` | 2025 | `권` | yes |

Catalog invariants:

- exactly these seventeen indicators are enabled by default;
- every indicator maps uniquely to one source column in `15118998`;
- `employment_rate` is the school-level value from bundled `15118998` only;
- dataset `15139279` is not bundled, enabled, sampled, normalized, or used for a default result;
- the verified source columns do not state that these indicators are undergraduate-only;
- code is MIT licensed, while this source-derived catalog and bundled data remain separately attributed under KOGL Type 1.

## Value and refresh semantics

A value remains tied to its indicator id, exact source column, year, unit, source/license metadata, and derived/bundled state. Missing source values are explicit and are never inferred. After Node 22 ECMAScript trim, only empty text and ASCII `-` are missing.

Numeric source text must satisfy the approved nonnegative decimal grammar and grouping rules. Valid grouping commas are removed, integer leading zeros and fractional trailing zeros are canonicalized, and zero is represented as `0`. Canonical decimal text—not a rounded floating-point rendering—is semantic authority. Its JavaScript Number conversion must be finite, nonnegative, and survive the exact shortest-Number-to-plain-decimal round trip. Precision loss blocks refresh; values are never rounded.

Annual refresh must preserve one unique logical mapping per indicator, fixed verified units, nondecreasing integer years, indexed raw-cell text, and exact row/classification coverage. Post-download SHA-256 is integrity, change-detection, and audit evidence only; it does not establish source authenticity or approval. A prior-checksum match does not approve a refresh, and a changed checksum does not reject one. There is no fixed row count, institution set, value set, missing-rate, or exact-width requirement. A semantically valid 24-column, 26-column, or other annual workbook shape may pass.

## Runtime context

The catalog is exposed through an exactly eight-tool read-only server:

`list_sources`, `list_indicators`, `search_university`, `get_university_metrics`, `compare_universities`, `explain_indicator`, `validate_source_coverage`, and `explore_universities`.

The runtime contract is Node `>=22 <23` only, with exact `@modelcontextprotocol/sdk` `1.29.0` and `zod` `4.4.3` requirements. Node 24+ is not supported or claimed. The currently integrated SQLite backend remains provisional until the protected single-backend gate passes; release state remains `BLOCKED_PENDING_BACKEND_SELECTION`.

## Explicit non-goals

- No `15139279` raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, derived artifact, or granular/per-department employment feature.
- No live OpenAPI access, scraping, runtime network dependency, service key, data mutation, or source correction.
- No inferred indicator, source column, year, unit, institution, missing marker, value, endpoint, or download link.
- No source-derived executable catalog, hard-coded fallback, or application of MIT code-license terms to bundled KOGL data.
- No scores, weighting, ranks, recommendations, winner/loser labels, or guessed institution resolution.
- No checksum-only, fixed-24-column, rounded-value, or prior-value-equality refresh approval.
- No public-version, publication, public-support, client-execution, promotion, rollback, backend-approval, or latest-data claim.
