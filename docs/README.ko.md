# academyinfo-mcp (한국어 안내)

> English (canonical): [README.md](../README.md) — 내용이 어긋나는 경우 영어 원문이 우선합니다.

`academyinfo-mcp`는 한국 대학 공시 지표를 사실 그대로 조회·비교하는 **독립·읽기 전용 MCP 서버**입니다.
번들된 로컬 스냅샷을 사용하므로 **API 키도, 실행 중 네트워크 연결도 필요 없습니다.**

> 이 프로젝트는 교육부, 한국대학교육협의회(KCUE), 한국교육개발원(KEDI), data.go.kr,
> academyinfo.go.kr(대학알리미) 및 어떤 대학과도 제휴·승인·후원·운영 관계가 없습니다.

## 빠른 시작

설치도, API 키도, 로그인도 필요 없습니다. 대학알리미 공시 지표의 번들 스냅샷(KOGL 제1유형)을 읽어
AI 비서에서 사실 조회와 나란히 비교를 제공합니다.

### Claude Desktop

`claude_desktop_config.json`(macOS: `~/Library/Application Support/Claude/`)에 추가 후
Claude Desktop을 재시작합니다:

```json
{
  "mcpServers": {
    "academyinfo": {
      "command": "npx",
      "args": ["-y", "academyinfo-mcp"]
    }
  }
}
```

### Cursor

같은 `command`/`args` 형태를 `~/.cursor/mcp.json`(또는 프로젝트의 `.cursor/mcp.json`)에 넣고
MCP 서버 목록을 새로고침합니다.

### 임의의 MCP stdio 클라이언트

```bash
npx -y academyinfo-mcp
```

서버는 stdio로 MCP를 말합니다 (stdout은 JSON-RPC, 진단은 stderr).

### 사용해 보기

AI 비서에게 이렇게 물어보세요:

> "전남대와 부산대의 취업률과 경쟁률을 비교해줘."

서버는 모호한 이름을 **추측하지 않습니다**. "전남대학교"는 캠퍼스 두 곳에 일치하므로 첫
`explore_universities` 호출은 표 대신 `status: "ambiguous"`와 후보 목록을 반환합니다:

```text
전남대학교 → 후보 2건
    전남대학교 / 본교       (국립, 광주)
    전남대학교 / 제2캠퍼스  (국립, 전남)
```

캠퍼스를 골라 다시 물으면 (보통 AI 비서가 이 후속 질의를 알아서 합니다):

> "전남대학교 본교와 부산대학교로 비교해줘."

두 번째 호출은 `status: "ok"`와 함께 기관별 값·출처·연도·단위를 반환합니다 — 예 (2025 번들 스냅샷):

| 대학 | 취업률 | 신입생 경쟁률 |
|---|---:|---:|
| 전남대학교 본교 | 57.6% | 7.4:1 |
| 부산대학교 | 57.5% | 9:1 |

이 2단계 흐름은 실패가 아니라 **설계된 동작**입니다: 모호한 이름은 추측 대신 후보를 돌려주고,
비교는 순위·점수·우열 판정 없이 출처와 함께 숫자를 그대로 제시합니다 — 판단은 사용자의 몫입니다.

## 원격 사용 (claude.ai 웹 · ChatGPT)

npm 패키지 자체는 stdio 전용입니다. 웹/모바일 클라이언트에서 쓰려면 운영자가 체크아웃(또는 컨테이너
이미지)의 Streamable HTTP 진입점을 공개 HTTPS로 호스팅해야 합니다 — 자세한 것은 영어 원문의
[Remote endpoint 절](../README.md#remote-endpoint-streamable-http-checkout-only)을 참고하세요.

호스팅된 엔드포인트 URL(`https://<도메인>/mcp`)을 받았다면:

- **claude.ai (웹/모바일)**: 설정 → 커넥터 → **커스텀 커넥터 추가** → URL에 `https://<도메인>/mcp` 입력.
  (커스텀 커넥터는 유료 플랜에서 제공됩니다 — 세부 플랜 조건은 Anthropic 안내 기준.)
- **ChatGPT**: 설정 → 커넥터에서 **개발자 모드(developer mode)** 를 활성화한 뒤 MCP 서버로
  `https://<도메인>/mcp`를 추가합니다. (플랜·기능 제공 범위는 OpenAI 안내 기준.)
- **Claude Desktop / Claude Code / Cursor**: 원격 URL 없이 위의 `npx` stdio 방식이 가장 간단합니다.

원격 배포본 역시 동일한 시점 고정 스냅샷을 동일한 출처표시·면책 경계로 제공합니다:
실시간 피드가 아니며 최신 데이터를 보장하지 않고, 운영자는 교육부·KCUE·KEDI·data.go.kr·
대학알리미·어떤 대학과도 무관합니다.

## 요구 사항

Node `>=22 <23`을 사용하세요. Node 24 이상은 지원하지 않으며 지원을 주장하지도 않습니다.
공개 지원 매트릭스와 증거 범위는 영어 원문 [Requirements](../README.md#requirements) ·
[Evidence-scoped status](../README.md#evidence-scoped-status) 절이 규범입니다.

## 도구 8종 (정확히 이 범위)

1. `list_sources` — 번들 출처 목록
2. `list_indicators` — 기본 활성 지표 목록
3. `search_university` — 대학 검색 (모호하면 추측하지 않음)
4. `get_university_metrics` — 단일 대학의 검증된 지표
5. `compare_universities` — 복수 대학 지표 비교
6. `explain_indicator` — 지표 설명 + 출처 메타데이터
7. `validate_source_coverage` — 출처 커버리지·정책 검증
8. `explore_universities` — 대학 해석 + 나란히 비교 (통합)

8종 전부 읽기 전용(`readOnlyHint: true`)이며 외부 세계에 영향을 주지 않습니다
(`openWorldHint: false`). 스키마·검증 규칙 세부는 영어 원문
[Exact eight-tool scope](../README.md#exact-eight-tool-scope) 절을 참고하세요.

## 지표와 데이터 경계

번들 데이터셋 `15118998`(교육부_대학알리미_대학주요정보)에서 정확히 17개 지표를 제공합니다:

| 지표 | 이름 | 스냅샷 연도 | 단위 |
|---|---|---:|---|
| `competition_rate` | 신입생 경쟁률 | 2025 | `:1` |
| `fill_rate` | 신입생 충원율 | 2025 | `%` |
| `employment_rate` | 취업률 | 2025 | `%` |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | 2025 | `원` |
| `avg_tuition` | 평균 등록금 | 2026 | `천원` |
| `admission_quota` | 입학정원 | 2025 | `명` |
| `graduates_count` | 졸업생수 | 2025 | `명` |
| `fulltime_faculty_count` | 전임교원수(학부+대학원) | 2025 | `명` |
| `enrolled_students` | 재학생 | 2025 | `명` |
| `international_students` | 외국인 학생 수 | 2025 | `명` |
| `students_per_fulltime_faculty` | 전임교원 1인당 학생 수(학생정원기준)(학부+대학원) | 2025 | `명` |
| `fulltime_faculty_ratio_quota` | 전임교원 확보율(학생정원기준)(학부+대학원) | 2025 | `%` |
| `fulltime_faculty_ratio_enrolled` | 전임 교원 확보율(재학생 기준)(학부+대학원) | 2025 | `%` |
| `fulltime_faculty_lecture_ratio` | 전임교원 강의 담당 비율 | 2025 | `%` |
| `education_expense_per_student` | 학생 1인당 교육비(학부+대학원) | 2025 | `천원` |
| `dormitory_capacity_rate` | 기숙사 수용율(학부+대학원) | 2025 | `%` |
| `books_per_student` | 학생 1인당 도서 자료 수(학부+대학원) | 2025 | `권` |

이 연도는 현재 번들된 **시점 고정 스냅샷**을 설명하는 것이지, 실시간 피드나 최신 데이터 보장이
아닙니다. 데이터셋 `15139279`는 번들·활성화·사용되지 않으며, 실시간 OpenAPI 접근과 스크래핑은
이 릴리스의 범위 밖입니다.

## 릴리스·운영 거버넌스 (영어 원문 규범)

refresh 안전 규칙, 신선도·릴리스 동작, 공개 설치 증명 경계, 관리자 전제 조건은 증거 범위를
엄격하게 서술하는 절이므로 번역본을 두지 않습니다. 영어 원문을 참고하세요:
[Refresh safety summary](../README.md#refresh-safety-summary) ·
[Freshness and release behavior](../README.md#freshness-and-release-behavior) ·
[Public-install proof boundary](../README.md#public-install-proof-boundary) ·
[Administrator prerequisites](../README.md#administrator-prerequisites)

## 라이선스와 프라이버시 경계

- 코드는 MIT 라이선스입니다 (`LICENSE`).
- 번들된 `15118998` 데이터는 KOGL 제1유형(출처표시) 조건의 정규화 파생본입니다
  (`DATA_LICENSE.md`, `NOTICE.md`, `data/seed/LICENSE.15118998.md`). 코드와 데이터의
  라이선스는 별개입니다.
- 릴리스 산출물·로그·오류·예시·MCP 응답에는 자격 증명, 서비스 키, 서명된 쿼리 문자열,
  로컬 사용자명, 기기 식별자, 사설 파일시스템 경로가 포함되면 안 됩니다.

규범 문서: [PROJECT_CHARTER.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/PROJECT_CHARTER.md) ·
[NON_GOALS.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/NON_GOALS.md) ·
[RELEASE_CHECKLIST.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/RELEASE_CHECKLIST.md)
