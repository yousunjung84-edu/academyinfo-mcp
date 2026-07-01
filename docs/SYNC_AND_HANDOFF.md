# SYNC & HANDOFF — academyinfo-mcp

> ⚠️ **공개 전환 전 이 파일은 제거하거나 sanitize할 것** (내부 개발 워크플로우 문서).
> 릴리스 감사(docs 게이트)에서 이 경고를 확인한다.

머신 간 동기화 다리는 **GitHub(이 repo)** 이다. **Drive로 코드를 동기화하지 않는다.**
Google Drive 안에서 node 프로젝트를 개발하면 동기화가 `node_modules`를 손상시킨다
(`node_modules.broken-*` 실제 발생). 그래서 코드/lazycodex 실행은 **Drive 밖 로컬**에서만 한다.

## 정본 위치
- **GitHub (private, 동기화 정본)**: 이 repo (`origin`)
- **리뷰/PM 머신**: Drive 밖 로컬 clone
- **lazycodex 실행 머신(학교 PC)**: Drive 밖 로컬 clone 후 거기서 실행
- **Drive 옛 사본**: `STALE_MOVED.md` 마커. 코드 X, 문서 보관용만.

---

## 0. clone 전 확인 (데이터 유실 방지)
lazycodex 실행 머신의 Drive 사본에 **아직 push 안 된 최신 작업**이 있는지 확인한다.
있으면 clone을 다른 폴더에 받아 대조한 뒤 반영한다. 확실하면 바로 진행.

## 1. 로컬 셋업 (Drive 밖 경로에서)
```bash
cd C:\projects            # Drive 폴더 밖 아무 로컬 경로
git clone https://github.com/yousunjung84-edu/academyinfo-mcp.git
cd academyinfo-mcp
npm install
npm run build
npm test                  # 13/13 통과해야 정상. 실패 시 멈추고 보고.
```
이후 모든 `$ulw-plan / $start-work / $ulw-loop`는 이 경로에서 실행한다. Drive 사본은 폐기.

## 2. git 위생 (AGENTS.md 준수)
- `git add .` 금지. 다음은 스테이징/커밋/패키지 제외:
  `node_modules`, `node_modules.broken-*`, `.omo`, `.ultrawork`, `dist`,
  `data/raw/**`, `data/external/**`, `.env*`, 모든 `*.xlsx`/`*.csv`, 서비스키, 로컬 절대경로.
- `.gitignore`가 위를 이미 제외. 새 산출물은 `git add <경로>` 선택 추가 → commit → push.
- `package.json` version은 `0.0.0` 유지. 실제 observation seed + 릴리스 시에만 `0.1.0`.
- 코드=MIT(`LICENSE`), 데이터=KOGL-1(`DATA_LICENSE.md`/`NOTICE.md`). 섞지 않는다.

## 3. 현재 상태
릴리스 파이프라인은 통과하나 권고는 **GO-WITH-WARNINGS**.
seed는 metadata-only(검증 observation 없음) — 동작하는 v0.1이 아니라 감사 통과한 scaffold.

## 4. 다음 작업 (사람 선행 단계에 막힘)
1. **원자료 배치**: data.go.kr 데이터셋 **15118998 XLSX**를 사람이 내려받아
   `data/raw/15118998/`에 놓는다. 절대 커밋/패키지 금지.
   ⚠️ 파일명 연도(20221031) ≠ 수정일(2025-05-28) → 실제 연도는 헤더로 확정.
2. **데이터 완성 loop**: "Complete 15118998 evidence lock and real seed DB" `$ulw-loop`.
   성공기준: header/unit/column 실제 검증, 4개 기본지표 observation nonzero,
   `source_column_verified`는 실제 헤더 매칭 시에만 true, 단위 미확정은 `NotVerified`+warning.
3. **최종 release audit `$ulw-loop`** 재실행.

## 5. 불변 제약
- **15139279(취업)**: 동봉 금지, local ingest only, `employment_rate` 기본 disabled.
- **OpenAPI**: v0.1 구현 금지(v0.3 backlog). 발급 서비스키는 v0.3 예약 —
  로컬 `.env`(gitignore)에만, 레포/로그/응답/패키지 어디에도 노출 금지.
- 모든 MCP 응답에 `source/license/year/unit/warnings` 포함. stdio에서 stdout 로깅 금지.
- **public 전환·npm publish 금지**(박사 승인 후 별도 단계).
- 전부 `AGENTS.md`를 따른다. 실제 명령 출력만 증거로 사용.
