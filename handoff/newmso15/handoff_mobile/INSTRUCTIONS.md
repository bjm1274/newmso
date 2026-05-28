# Claude Code 작업 지시서 — MSO 모바일 리디자인

> 이미 60+ 화면이 풀 커버된 라이브 프리뷰 (`MSO_Mobile_Redesign_Live.html`) 가 있습니다. 이 위에서 **추가 화면 추가 · 기존 화면 개선 · 인터랙션 강화** 작업을 진행합니다.

---

## 0. 현재 완성도

### ✅ 풀 커버 완료 (PC 메뉴 100% 매칭)

| PC 영역 | 모바일 화면 | 상태 |
|---|---|---|
| **MyPage 5탭** (home·attend·todo·docs·alert) | 5/5 | ✅ |
| **채팅** (목록·방·새대화) | 3/3 | ✅ |
| **게시판** (목록·상세·작성·7카테고리) | 4/4 | ✅ |
| **결재 5뷰** (받은·기안·참조·작성·양식) | 5/5 | ✅ |
| **HR 7서브** (구성원·근태·연차·이상·급여·복지·문서) | 7/7 | ✅ |
| **재고 4서브** (현황·입출고·물품자산·분석마감) | 4/4 | ✅ |
| **관리자 7서브** (경영지표·시스템·회사·권한·운영·양식·감사) | 7/7 | ✅ |
| **추가기능 12모듈** (조직도·부서재고·근무현황·인계노트·평가·퇴원심사·수술상담·OP체크·입금·마감·주차·웹팩스) | 12/12 | ✅ |
| **등록·작성 폼 7종** (구성원·물품·자산·발주·연차·게시판·새대화) | 7/7 | ✅ |

총 **63개 화면** + 인터랙티브 데모 1개.

### 디자인 시스템
- 토큰: zinc neutrals (50~900) + accent #2563EB + state colors
- 다크모드 지원 (`.mso-mobile.dark`)
- 강조색 Tweaks (5 옵션 — blue/violet/green/pink/orange)
- 컴포넌트: MIcon, MChip, MBtn, MAvatar, MHeader, MBottomTab, MCard, MListRow, MSheet

---

## 1. 무엇을 작업할 수 있는가

### A. 새 화면 추가
PC에 있는데 모바일에 없는 화면이 발견되면 — `SCREENS_INVENTORY.md` 에서 풀 커버 확인 후 추가.

### B. 기존 화면 디테일 강화
- 인라인 인터랙션 (스와이프, 풀-투-리프레시, 햅틱)
- 모션 (페이지 전환, 카드 등장, 스켈레톤)
- 마이크로카피 개선
- 일러스트레이션 / 빈 상태 디자인

### C. 다크모드 점검 + 대비 보강
모든 화면이 `.dark` 클래스에서 자동 변환되지만, 일부 그라데이션·hero 카드가 다크모드에서 대비가 약할 수 있음. 시각 점검.

### D. 접근성 (a11y)
- `aria-label`, `role` 추가
- 포커스 링 정비
- 색만으로 정보 전달 금지 (아이콘/텍스트 보조)

### E. PWA 셸
- 오프라인 캐싱 (Service Worker)
- 오프라인 큐 (체크인·결재 회신 등)
- `MSO_Mobile_Advanced.md §1` 참조

---

## 2. 작업 패턴 (반드시 지킬 것)

### 2-1. 새 화면 추가 5단계

```
1. m-screens-*.jsx 중 적절한 파일에 컴포넌트 작성
   (HR이면 m-screens-hr.jsx, 폼이면 m-screens-forms.jsx)
2. 파일 끝의 Object.assign(window, {...}) 에 추가
3. m-canvas.jsx SUB_MAP 에 라우트 등록
4. 진입 경로 추가 (More 메뉴, 홈 빠른 액션, 다른 화면의 + 버튼 등)
5. m-canvas.jsx DCSection 안에 <DCArtboard> 추가 (캔버스 시연용)
```

### 2-2. 토큰만 사용 — 새 색 만들지 말 것

```jsx
// 금지
<div style={{background: '#3B82F6', color: 'white'}}>

// 권장
<div style={{background: 'var(--accent)', color: '#fff'}}>
```

### 2-3. 공통 컴포넌트 사용 — 인라인 스타일 재발명 금지

```jsx
// 금지
<button style={{height: 44, ...많은 스타일}}>저장</button>

// 권장
<MBtn variant="primary">저장</MBtn>
```

### 2-4. 데스크톱 안내 패턴

복잡한 편집 / 다량 입력 / 정산이 필요한 경우 — 모바일에서 풀 구현 X. 대신:

```jsx
<DesktopHint>편집은 데스크톱에서 — 모바일은 조회·승인만</DesktopHint>
<DesktopHint tone="warning">감사 로그가 남는 작업 · 2단계 인증 필수</DesktopHint>
```

### 2-5. 폼 패턴 — `m-screens-forms.jsx` 의 헬퍼 사용

```jsx
<FormHeader onCancel={onBack} title="..." onSave={...} saveLabel="저장" saveDisabled={...}/>
<Field label="이름" required sub="설명">
  <Input value={...} onChange={...} placeholder="..." autoFocus/>
</Field>
<SegRow value={v} onPick={setV} options={[{id:'a', label:'A'}, ...]}/>
<StepDots total={3} cur={step}/>
```

---

## 3. 자주 묻는 답

### Q. 화면이 잘 안 뜨는데?
- 콘솔 에러 확인 → 컴포넌트 이름 typo / `window.XXX` 미등록이 90%.
- 모든 화면 컴포넌트는 파일 끝의 `Object.assign(window, {...})` 에 추가되어야 함.

### Q. 스타일이 새로 안 먹는다
- 모바일 스타일은 모두 `.mso-mobile` 안에서만 동작. 부모 래퍼 확인.
- 다크모드 검증은 `<Phone dark={true}>` 로 캔버스에 추가 아트보드 만들어서 비교.

### Q. 새 아이콘이 필요해
`m-components.jsx` 의 `MIcon` 컴포넌트 안 `P = {...}` 객체에 새 path 추가. lucide.dev 의 path 데이터 그대로 복붙 가능.

### Q. 모바일 사이즈 변경
현재 390×844 iPhone 기준. `m-canvas.jsx` 의 `PHONE_W` `PHONE_H` 변경. SE 작은 화면 (375×667) 도 점검 권장.

### Q. Tweaks 추가
`m-canvas.jsx` 의 `TWEAK_DEFAULTS` 블록과 우하단 패널 부분에 컨트롤 추가. `__edit_mode_set_keys` 프로토콜 그대로 따르면 됨.

---

## 4. Out of Scope (이번 작업 범위 X)

- 백엔드 API 연동 — 정적 mock 데이터로 충분
- 실시간 푸시 — 시각 표현만 (`badge`, `dot`)
- 다국어 (i18n) — 한국어 only
- 인쇄 / PDF — 데스크톱에서
- 카메라/QR 실제 동작 — UI 패턴만 시연
- 음성/녹음 실제 동작 — UI 패턴만 시연

---

## 5. 검수 체크리스트

새 화면 또는 화면 수정 후 반드시 확인:

- [ ] 콘솔 에러 0건
- [ ] iPhone 13 (390×844) 에서 가로 스크롤 없음
- [ ] 모든 인터랙티브 요소 44×44px 이상
- [ ] 라이트 모드 + 다크 모드 둘 다 가독성 OK
- [ ] 강조색 변경 (Tweaks → 5색) 시 화면 깨지지 않음
- [ ] `MIcon`/`MChip`/`MBtn` 등 공통 컴포넌트 사용 (인라인 재발명 X)
- [ ] 토큰 사용 (하드코딩 색 X)
- [ ] `SCREENS_INVENTORY.md` 업데이트
- [ ] `ROUTES_MAP.md` 업데이트 (새 라우트 추가 시)
- [ ] DCSection 에 시연용 아트보드 추가 (선택)

---

## 6. 참고 문서

- **`SCREENS_INVENTORY.md`** — 화면 매트릭스 (PC↔모바일 1:1)
- **`ROUTES_MAP.md`** — `SUB_MAP` 키 ↔ 컴포넌트 ↔ 파일
- **`DESIGN_TOKENS.md`** — 토큰 명세 (색·간격·라운드·그림자)
- `source-reference/MSO_PC_Redesign_Live.html` — PC 기준
- `source-reference/redesign/` — PC 컴포넌트 소스
- `source-reference/MSO_Mobile_Phase3_Screens.md` — 모바일 화면군 설계 지시서 (원본)
