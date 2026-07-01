# Indicator Dictionary

This dictionary records the v0.1 default indicators served from bundled dataset `15118998`.

Dataset `15139279` is not bundled in v0.1 and is reserved for v0.3/local-ingest work on granular employment statistics.

| Indicator | Korean label | Source dataset | Source column | Year | Unit | Default enabled |
| --- | --- | --- | --- | --- | --- | --- |
| `competition_rate` | 신입생 경쟁률 | `15118998` | `신입생 경쟁률\n(2025,:1)` | 2025 | `:1` | yes |
| `fill_rate` | 신입생 충원율 | `15118998` | `신입생 충원율\n(2025,%)` | 2025 | `%` | yes |
| `employment_rate` | 취업률 | `15118998` | `취업률\n(2025,%)` | 2025 | `%` | yes |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | `15118998` | `학생 1인당 연간 장학금\n(2025,원)` | 2025 | `원` | yes |
| `avg_tuition` | 평균 등록금 | `15118998` | `평균 등록금\n(2026,천원)` | 2026 | `천원` | yes |

Notes:

- v0.1 has five default indicators.
- `employment_rate` is enabled by default only from bundled dataset `15118998`.
- No v0.1 default indicator uses dataset `15139279`.
- The verified `15118998` source columns do not state that these default indicators are undergraduate-only.
