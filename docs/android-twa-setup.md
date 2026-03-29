# Android TWA Setup

이 문서는 `SY INC. MSO 통합 시스템`을 안드로이드에서 설치형 앱처럼 배포하기 위한
Trusted Web Activity(TWA) 준비 절차를 정리한 문서입니다.

## 목표

- 안드로이드에서 PWA를 설치형 앱처럼 실행
- 작업표시줄/앱 아이콘 배지, 웹 푸시, 전체화면 실행 경험 강화
- 추후 FCM 또는 네이티브 셸 확장 시 재사용 가능한 기반 확보

## 현재 저장소에 준비된 항목

- PWA manifest 보강: `/public/manifest.json`
- TWA 템플릿: `/android-twa/twa-manifest.template.json`
- Digital Asset Links 생성 스크립트: `/scripts/generate_assetlinks.js`
- 웹 푸시/알림 서버 경로

## 배포 전에 반드시 필요한 값

1. 안드로이드 패키지명
2. 서명 키 SHA-256 fingerprint
3. 운영 도메인
4. 앱 이름/런처 이름

## 권장 절차

1. `android-twa/twa-manifest.template.json`을 기준으로 실제 값을 채웁니다.
2. 서명 키 fingerprint를 확보합니다.
3. 아래 명령으로 `assetlinks.json`을 생성합니다.

```bash
node scripts/generate_assetlinks.js kr.co.pchos.erp XX:YY:ZZ:... public/.well-known/assetlinks.json
```

4. 배포 후 아래 URL이 실제로 열리는지 확인합니다.

- `https://erp.pchos.kr/.well-known/assetlinks.json`

5. Bubblewrap 또는 Android Studio 기반으로 TWA 셸을 생성합니다.

## 권장 검증 항목

- 홈 화면 설치 후 주소창 없이 독립 창으로 열리는지
- 웹 푸시 수신이 되는지
- 앱 배지가 unread 수와 동기화되는지
- `모두 닫기` 후 재실행 시 로그인/세션 복원이 자연스러운지
- 알림 클릭 시 해당 채팅/문서 화면으로 정확히 이동하는지

## 주의

- TWA는 앱 서명과 `assetlinks.json`이 정확해야 최종 동작합니다.
- 현재 저장소는 TWA 템플릿과 문서, 자산 링크 생성기까지 준비된 상태입니다.
- 실제 안드로이드 프로젝트 생성/서명/스토어 배포는 별도 단계입니다.
