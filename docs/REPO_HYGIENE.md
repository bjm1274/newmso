# Repo hygiene — scratch / handoff / analysis / jscpd

Phase C (#19–22) 정리 정책. 프로덕션 빌드에 포함되지 않는 로컬·디자인 산출물 규칙.

| Path | Commit? | Notes |
|------|---------|--------|
| `/scratch/` | **Never** | 에이전트 일회성 스크립트·DB 프로브. 이미 gitignore |
| `/scratch_zip/` | **Never** | 옛 디자인 zip. live 이모티콘은 `public/emoticon/` |
| `/analysis_artifacts/` | **Never** | 기능부품 스냅샷·스크린샷. 검색/AI 오탐 원인. 전체 ignore |
| `/handoff/` | **Archive OK** | 모바일 redesign live-preview 등 디자인 레퍼런스. 런타임 import 없음. 주석 경로로만 인용 |
| `/tmp/`, `/backups/` | **Never** | 이미 gitignore |
| `/.jscpd-report/`, `/.jscpd-report-fresh/` | **Never** | `npm run dupcheck` 재생성 |

## handoff

- 앱 코드는 `handoff/`를 **import 하지 않는다**.
- 내구성 있는 문서는 `docs/mobile/` 에 둔다.
- git 추적 유지(디자인 아카이브). 제거 시 `git rm -r --cached handoff` + ignore 추가 후 팀 합의.

## analysis_artifacts

- `tsconfig` exclude 대상. 커밋 금지.
- 로컬 삭제: `git ls-files analysis_artifacts` 가 비어 있는지 확인 후 선택적으로 디스크 정리.

## 중복 코드 검사

```bash
npm run dupcheck
```

- 설정: `.jscpd.json` (`app` + `lib`, min-lines 10, min-tokens 50)
- CI: `.github/workflows/hygiene.yml` — **리포트 only** (`continue-on-error`). threshold 15% 초과 시 실패 가능 모드로 전환은 별도 합의.

## 삭제 전 확인

```powershell
git ls-files analysis_artifacts handoff scratch scratch_zip
git check-ignore -v analysis_artifacts
```
