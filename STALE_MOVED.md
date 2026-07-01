# ⛔ STALE — 이 폴더는 더 이상 사용하지 마세요 (2026-07-01)

이 `academyinfo-mcp` 사본은 **폐기(stale)** 되었습니다.
Google Drive 안에서 node 프로젝트를 개발하면 동기화가 `node_modules`를 손상시킵니다
(실제로 `node_modules.broken-*` 발생). 그래서 코드 개발·lazycodex 실행을 여기서 하지 않습니다.

## 새 정본 위치 (canonical)
- **GitHub (private, 동기화 다리)**: https://github.com/yousunjung84-edu/academyinfo-mcp
- **맥 로컬(리뷰/PM)**: `~/projects/academyinfo-mcp`
- **학교 PC(lazycodex 실행)**: Drive 밖 로컬 경로에 `git clone` 후 거기서 실행

## 하지 말 것
- 이 Drive 폴더에서 `npm install` / `lazycodex` / git 작업 ❌ (손상 재발)
- 이 폴더를 코드 정본으로 취급 ❌

## 동기화 규칙
- 머신 간 동기화는 **git push/pull(GitHub)** 로만. Drive로 코드 동기화 ❌
- Drive는 소스맵·핸드오프 문서 보관용으로만 사용

## 학교 PC 이관 절차
```bash
# Drive 밖 로컬 경로에서
git clone https://github.com/yousunjung84-edu/academyinfo-mcp.git
cd academyinfo-mcp
npm install && npm run build && npm test
# 이후 lazycodex는 이 경로에서 실행, 결과는 git commit + push
```

⚠️ clone 전, 이 Drive 사본에 GitHub에 아직 안 올라간 최신 작업이 있는지 확인하세요.
있으면 학교 PC 원본과 대조 후 반영.
