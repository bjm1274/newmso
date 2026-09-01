# 11차 · 04 게시판

> 조사일: 2026-08-31 · 1차 조사(미검증).

보드: 공지사항, 자유게시판, 경조사, 수술일정, MRI일정, 업무가이드.

## 조사 발견

### P0 후보
- **BD-01** PC 목록에 회사 필터 없음. `board_posts.select=PUBLIC`. 수술/MRI 차트번호가 `content`에 평문. 타병원 PHI가 PC에 노출. 모바일 list API는 회사 필터가 있으나 NULL/`전체` 통과, 상세는 id만.
- **BD-02** `board_posts` INSERT는 AUTHENTICATED. `board_*_write`는 UI만. 글작성 카테고리 전환으로 MRI/수술 삽입 가능.
- **BD-03** `poll`/`poll_votes`가 리액션 컬럼이라 타인 투표 JSON·당첨자 덮어쓰기. 익명+경품이 이름을 공개 댓글로.

### P1 후보
- **BD-04** `board_post_reads` PUBLIC_ALL — 타인 읽음 위조/삭제.
- **BD-05** 댓글 INSERT AUTHENTICATED, `author_id` 클라 값.
- **BD-06** 업무가이드 격리는 클라 메모리 필터. null company_id는 전원 매칭.
- **BD-07** GlobalSearch가 board content(차트번호)를 회사/타입 없이 ilike.
- **BD-08** `/api/board/list`는 `canAccessBoard` 미적용. 상세 딥링크 무게이트.
- **BD-09** board/ 첨부 ACL은 authenticated만 (채팅 멤버십과 다름).
- **BD-10** notice-broadcast가 작성자/회사 없이 공지 팬아웃.

### P2
모바일 일정 수정이 PHI 필드를 안 남김, 읽음 시트가 전사 staff, IndexedDB에 환자명 캐시, share로 open_post URL.

`board_posts` 자체 PUBLIC_ALL write는 **아님** (owner 가드 있음). 잔여 구멍은 insert AUTHENTICATED + 리액션 컬럼.
