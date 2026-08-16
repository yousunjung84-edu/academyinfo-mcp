# Why some zeros are withheld

`get_university_metrics` and `compare_universities` do not serve an exact `0` in a
rate, ratio, or per-student indicator. Such a cell arrives in `missing_metrics`
with `value: null`, `reason: "zero_not_aggregatable"`, and the source text kept in
`raw_value`. This records why.

## The question

Dataset `15118998` writes an unavailable cell as `-`. Those cells are classified
as missing and reported as `blank_in_source`. Separately, many cells contain a
literal `0`. Whether such a `0` is a measurement or a placeholder decides whether
it may enter an average, and the two cannot be told apart from the value alone.

## What the source states

The publisher documents the formulas ([대학알리미 지표 설명](https://m.academyinfo.go.kr/empty/search/keyIndicator.do)):

> 학생 1인당 교육비 = **총교육비 / 재학생수**
> 총교육비(국공립) = 대학회계 + 발전기금회계 + 산학협력단회계 + 도서구입비 + 기계기구매입비
> 학생 1인당 도서자료수 = **(국내서 + 국외서) / 재학생 수**

Both numerators are institution-level accounting and holdings figures. Both
denominators are enrolment.

**No coding rule for `0` was found.** Checked: the
[data.go.kr metadata for 15118998](https://www.data.go.kr/data/15118998/fileData.do),
the indicator descriptions above, and
[KCUE's disclosure-operations page](https://www.kcue.or.kr/work/sub08/sub01.php).
None states what a `0` means. That gap is why the reason code names an observable
property — the value cannot be aggregated — rather than a cause.

## What the bundle shows

Zeros appear in all seventeen indicators, but not evenly. Across the twelve
rate/ratio/amount indicators:

| campus type | institutions | numeric cells | zeros | zero rate |
|---|---:|---:|---:|---:|
| 본교 (main) | 452 | 5,334 | 431 | 8.08% |
| 제2캠퍼스 | 24 | 288 | 113 | 39.24% |
| 제3캠퍼스 | 5 | 60 | 29 | 48.33% |
| 제4캠퍼스 | 2 | 24 | 13 | 54.17% |
| 분교 (legal branch) | 5 | 60 | 0 | 0.00% |

Main campuses are 92.6% of institutions but hold 73.5% of the zeros, so they are
under-represented. Counting institutions instead of shares reverses the intuition
that zeros cluster at main campuses.

`education_expense_per_student` is sharper still: **31 of 31** non-branch secondary
campuses report zero, **0 of 5** legally separate branches do, and main campuses
5.8%.

### One row in full

전남대학교 제2캠퍼스 reports its own figure for fifteen of seventeen indicators:

| indicator | 제2캠퍼스 | 본교 |
|---|---:|---:|
| enrolled_students | 2,808 | 16,391 |
| scholarship_per_student | 3,277,719.7 | 3,314,028.3 |
| avg_tuition | 4,086.9 | 4,222.8 |
| dormitory_capacity_rate | 33.1 | 23.2 |
| employment_rate | 59.2 | 57.6 |
| **education_expense_per_student** | **0** | 26,483.1 |
| **books_per_student** | **0** | 86.7 |

Scholarship and tuition are per-student amounts and are campus-specific.
Dormitory capacity is a campus facility and is campus-specific. Only the two
indicators whose numerators are institution-level accounting and library holdings
are zero — for a campus with 2,808 enrolled students. Under the published formula
a true zero would require 총교육비 of exactly zero.

Legally separate branches keep their own accounts and libraries, and report real
figures. The pattern is consistent, but it remains inference from the bundle: the
publisher has not stated it.

## External practice

KISTEP, reanalysing this dataset, excludes such zeros rather than averaging them
([보고서 RES0220230051](https://www.kistep.re.kr/board.es?mid=a10305010000&bid=0002), p.147):

> 평균값 산출 시에 각 대학 지표 값의 “0”은 결측치인지 또는 해당 값이 0인지 파악이
> 어려워 제외

The judgement this server applies is the one a public research institute already
applies by hand.

## Cross-channel evidence

The publisher runs a second official channel — the 공시데이터 추이 (indicator trend)
download on academyinfo.go.kr — that provides most of these indicators as
multi-year series (not `books_per_student`, which the trend service does not
offer, so no cross-channel statement is possible for it). Measured 2026-08-17
against archived trend files, the two channels encode the cell examined in
"One row in full" above differently:

| channel | 전남대학교 제2캠퍼스 · 학생 1인당 교육비 |
|---|---|
| dataset `15118998` (this server's bundle, 2025 disclosure) | literal `0` |
| indicator trend file (`9-나 … 학생 1인당 교육비`) | three layers: literal `0` for 2012–2015 and 2018–2020 · **no row at all** for 2016–2017 (215–216 other schools do have rows those years) · **blank (missing)** for 2021 onward |

The trend series shows the same campus reporting ordinary figures for enrolment,
scholarship, tuition, and dormitory capacity across those years, while this
indicator is never a positive number. From the 2021 disclosure on, the trend
channel records it as blank where the `15118998` extract still writes `0` — which
*reads as* an encoding change on the trend side, though that is an inference from
the values, not a documented change.

This is strong support for withholding: **for 2021 onward, the publisher's own
other channel treats these cells as missing, not as measured zeros.** It is still
not a written coding rule, so `zero_not_aggregatable` keeps naming the observable
property rather than a cause.

Evidence artifact: [`evidence/cross-channel/0000024-education-expense.json`](../evidence/cross-channel/0000024-education-expense.json)
— the full observation series with the source trend file's name, SHA-256, fetch
date, and reproduction steps. The measurement lives in the sibling
`academyinfo-timeseries` project (which builds from the same archived files);
re-measurements should update both.

## The decision

An exact zero is withheld where the indicator cannot produce one, and served where
it can.

- **Withheld** — the twelve rate, ratio, and per-student indicators. Serving `0`
  lets it enter an average unnoticed, and a warning does not stop a client that
  reads values.
- **Served, annotated** — the five headcount indicators (`admission_quota`,
  `graduates_count`, `fulltime_faculty_count`, `enrolled_students`,
  `international_students`). An institution can genuinely have none. They carry a
  note because several rows report zero faculty beside a positive enrolment.

Membership follows what an indicator measures, not its unit: `books_per_student`
is counted in 권 and `students_per_fulltime_faculty` in 명, but both are per-capita
ratios and are withheld.

Affects 586 of 8,206 observations (7.1%) across 150 institutions; 223 headcount
zeros are served with the note.

## Open

The publisher's own rule is still unconfirmed in writing. Resolving it means asking
대학정보공시센터 (02-6919-3881) whether a secondary campus reporting `0` for
per-student education spend means a measured zero or a figure aggregated to the
main campus. The cross-channel evidence shows these cells are not measured zeros;
which *reason* applies — aggregation to the main campus, suppression, or
non-collection — is suggested by the accounting-structure pattern in "One row in
full", not settled by it. An answer would still be what lets the reason code
become more specific than "not aggregatable".
