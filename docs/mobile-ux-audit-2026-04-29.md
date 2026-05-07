# 모바일 UX 점검 보고서 (2026-04-29 KST)

## 요약

- 모바일 smoke 테스트 3개 프로젝트(iPhone Chromium, Android Chromium, iPhone WebKit)에서 모두 10건 중 8건 통과, 2건 실패.
- 실패 2건은 모두 채팅 모바일 화면에서 재현됨.
- 로그인 화면은 인앱 브라우저에서 399px 폭 기준으로 정상 렌더링 확인.
- 이번 스크린샷 기준, 한글이 한 글자씩 세로로 쌓이는 명확한 사례는 확인되지 않았음. 다만 모바일 하단 탭/서브 메뉴는 `truncate`, `whitespace-nowrap`, 수평 스크롤 의존도가 높아 좁은 기기에서 잘림과 발견성 저하 가능성이 있음.
- 초기에는 기존 Next dev 서버의 `.next/dev` 산출물 오류로 `/main`, `/login`이 500을 반환했으나, dev 서버 재시작 후 정상 응답으로 회복됨. 검증 환경 리스크로 별도 기록.

## 점검 범위와 방법

- 대상: Next.js 앱 모바일 렌더링 및 모바일 전용 채팅 회귀 테스트.
- 실행 환경:
  - `http://127.0.0.1:3000`
  - Playwright projects: `mobile-chromium`, `mobile-android-chromium`, `mobile-iphone-webkit`
  - 인앱 브라우저: `/login` 시각 점검
- 실행 명령:
  - `npx playwright test tests/e2e/smoke.mobile.spec.ts --project=mobile-chromium --reporter=list`
  - `npx playwright test tests/e2e/smoke.mobile.spec.ts --project=mobile-android-chromium --reporter=list`
  - `npx playwright test tests/e2e/smoke.mobile.spec.ts --project=mobile-iphone-webkit --reporter=list`

## 주요 발견 사항

### P1. 첨부 이미지 로딩 후 최신 메시지가 화면 아래로 밀림

- 재현: 3개 모바일 프로젝트 모두 실패.
- 테스트: `tests/e2e/smoke.mobile.spec.ts:140`
- 실패 지점: `tests/e2e/smoke.mobile.spec.ts:237`
- 현상:
  - 채팅방 진입 시 최신 메시지는 처음에는 보임.
  - 지연 로딩 이미지 첨부가 렌더링되면 메시지 리스트 높이가 늘어나고, 최신 텍스트 메시지가 composer/하단 탭 뒤쪽으로 밀려 보이지 않음.
  - 사용자는 새 메시지가 더 있는지 모른 채 이미지 첨부 영역 중간에 멈춘 화면을 보게 됨.
- 증거:
  - `test-results/smoke.mobile-mobile-chat-k-efbcb--attachments-finish-loading-mobile-chromium/test-failed-1.png`
  - `test-results/smoke.mobile-mobile-chat-k-efbcb--attachments-finish-loading-mobile-android-chromium/test-failed-1.png`
  - `test-results/smoke.mobile-mobile-chat-k-efbcb--attachments-finish-loading-mobile-iphone-webkit/test-failed-1.png`
- 의심 코드:
  - `app/main/기능부품/MessengerAttachmentPanel.tsx:270` - 이미지 로드 이벤트 전달
  - `app/main/기능부품/MessengerAttachmentPanel.tsx:273` - 모바일 bubble 이미지가 고정 폭 `w-[200px]`
  - `app/main/기능부품/useChatTimelineScroll.ts:333` - media load 시 bottom alignment 처리
  - `app/main/기능부품/useChatTimelineScroll.ts:335` - `shouldKeepBottomAligned()`가 false면 보정 스크롤을 건너뜀
- 권장 조치:
  - 모바일 채팅방 진입 직후 일정 시간 동안은 media load마다 마지막 메시지 기준 anchor를 유지.
  - `isNearBottomRef` 단독 판단 대신, "사용자가 직접 위로 스크롤했는지"와 "레이아웃 shift로 밀렸는지"를 분리.
  - 이미지/비디오 첨부 placeholder와 최종 이미지 높이가 동일한지 보장해 layout shift 자체를 줄임.

### P1. 모바일 채팅에서 multiline 입력 후 전송 버튼을 눌러도 메시지가 전송되지 않음

- 재현: 3개 모바일 프로젝트 모두 실패.
- 테스트: `tests/e2e/smoke.mobile.spec.ts:643`
- 실패 지점: `tests/e2e/smoke.mobile.spec.ts:696`
- 현상:
  - 모바일 composer에서 Enter는 줄바꿈으로 동작함.
  - 이후 전송 버튼 클릭 시 메시지 bubble이 나타나지 않고, 입력창에 텍스트가 그대로 남음.
  - 스크린샷 기준 대화 영역은 "대화 내용이 없습니다." 상태로 남아 있음.
- 증거:
  - `test-results/smoke.mobile-mobile-chat-u-f1bdb-s-only-from-the-send-button-mobile-chromium/test-failed-1.png`
  - `test-results/smoke.mobile-mobile-chat-u-f1bdb-s-only-from-the-send-button-mobile-android-chromium/test-failed-1.png`
  - `test-results/smoke.mobile-mobile-chat-u-f1bdb-s-only-from-the-send-button-mobile-iphone-webkit/test-failed-1.png`
- 의심 코드:
  - `app/main/기능부품/메신저컴포저.tsx:92` - 모바일 Enter는 전송하지 않고 줄바꿈 허용
  - `app/main/기능부품/메신저컴포저.tsx:384` - 전송 버튼 `onSendMessage`
  - `app/main/기능부품/메신저전송훅.ts:115` - content/room guard
  - `app/main/기능부품/메신저전송훅.ts:118` - `visibleRoomIds` guard 실패 시 전송 중단 가능
- 권장 조치:
  - 전송 버튼 클릭 직전 `inputMsgRef.current`와 React state가 같은지 계측.
  - 모바일 테스트 fixture의 room membership과 `visibleRoomIds` 계산 결과를 확인.
  - guard 실패 시 silent return 대신 사용자에게 명확한 toast 또는 disabled 상태를 제공.

### P2. 모바일 하단 탭바는 좁은 화면에서 메뉴 발견성이 떨어질 수 있음

- 현재 회귀 테스트에서는 하단 탭바 표시 자체는 통과.
- 관련 코드:
  - `app/main/기능부품/조직도서브/조직도측면창.tsx:493`
  - `app/main/기능부품/조직도서브/조직도측면창.tsx:498`
  - `app/main/기능부품/조직도서브/조직도측면창.tsx:522`
- 현상/위험:
  - 메뉴가 많고 알림 버튼은 별도 `w-[56px]` 고정 폭.
  - 메뉴 영역은 `overflow-x-auto`, 라벨은 `truncate`.
  - 320px급 기기에서는 일부 메뉴가 화면 밖으로 밀리거나 라벨이 과도하게 잘릴 수 있음.
- 권장 조치:
  - 320x568, 360x740, 390x844에서 하단 탭 첫 화면 노출 메뉴 수와 스크롤 힌트 확인.
  - 자주 쓰는 메뉴 4-5개 + 더보기 패턴 검토.
  - Playwright에 `document.scrollingElement.scrollWidth <= innerWidth`와 주요 fixed 영역 bounding box 검사를 추가.

### P2. 모바일 서브 메뉴는 `nowrap + 수평 스크롤` 의존

- 관련 코드:
  - `app/main/page.tsx:1101`
  - `app/main/page.tsx:1119`
  - `app/main/page.tsx:1136`
- 현상/위험:
  - 서브 메뉴 버튼이 `whitespace-nowrap`, `flex-none`, `overflow-x-auto` 조합으로 렌더링됨.
  - 긴 서브 메뉴명은 한 줄로 유지되어 세로 쌓임은 피하지만, 좁은 화면에서는 버튼이 화면 밖으로 넘어가고 일부 사용자는 수평 스크롤 가능성을 놓칠 수 있음.
- 권장 조치:
  - 모바일 서브 메뉴 양 끝에 fade/scroll affordance 추가.
  - 활성 메뉴가 변경될 때 해당 버튼을 `scrollIntoView({ inline: 'center' })`로 자동 정렬.

### P3. 개발 환경 전용 오버레이가 모바일 하단 탭을 가림

- 실패 스크린샷에 Next.js Dev Tools 원형 버튼이 좌하단에 떠 있어 `내정보` 탭 일부를 덮음.
- 제품 배포 화면 문제는 아니지만, 개발/QA 스크린샷 판독 시 하단 탭 겹침으로 오해를 만들 수 있음.
- 권장 조치:
  - 모바일 스크린샷 회귀 테스트에서는 dev tools overlay 비활성화 또는 영역 제외.

## 확인된 정상 항목

- 모바일 채팅방 목록 진입 후 최신 메시지 위치로 이동: 통과.
- 모바일 채팅 메뉴 탭 진입 시 방 목록 화면 표시: 통과.
- 채팅 탭 재탭 시 방 목록 복귀: 통과.
- 모바일 디바이스 back으로 열린 채팅방 닫기: 통과.
- 긴 채팅방명 사이에서 room icon 크기 유지: 통과.
- 모바일 메인 shell 하단 탭바 표시: 통과.
- 모바일 관리자 주요 탭 전환 중 loading overlay 고착 없음: 통과.
- 모바일 게시판 첨부 표시와 상태 badge 위치 유지: 통과.
- 로그인 화면은 399px 폭에서 입력 필드/버튼이 화면 밖으로 넘치지 않음.

## 추가 권장 테스트

- `scrollWidth > clientWidth` 자동 탐지: `body`, `main-shell`, 채팅 composer, 하단 탭바, 서브 메뉴.
- 320px 폭 최소 모바일 뷰포트 별도 프로젝트 추가.
- 키보드 표시 상태를 가정한 composer 높이/하단 탭 충돌 테스트.
- 긴 한글 메뉴명, 긴 병원명, 긴 채팅방명, 긴 파일명을 넣은 visual regression fixture 추가.

## 처리 결과 (2026-04-29 KST)

- 하단 메인 메뉴바 컴포넌트는 변경하지 않음.
- P1 채팅 첨부 이미지 로드 후 최신 메시지가 가려지는 문제를 수정함.
- P1 모바일 multiline 입력 후 전송 버튼이 실패하는 문제를 수정함.
- P2 모바일 서브 메뉴는 활성 항목이 자동으로 보이도록 보강함.
- 검증: `tests/e2e/smoke.mobile.spec.ts` 전체 모바일 3개 프로젝트 30건 통과.
