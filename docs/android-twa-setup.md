# Android TWA Setup

`SY INC. MSO 통합 시스템`을 안드로이드에 설치형 앱처럼 배포하기 위한
Trusted Web Activity(TWA) 준비 문서입니다.

## 목표

- 안드로이드에서 PWA를 앱처럼 실행
- 주소창 없이 독립 창으로 열기
- 웹 푸시, 배지, 딥링크를 앱 아이콘 기준으로 연결
- 추후 Bubblewrap 또는 Android Studio로 실제 APK/AAB 생성

## 현재 저장소에 준비된 항목

- PWA manifest 보강: [public/manifest.json](C:/Users/baek_/newmso/public/manifest.json)
- Android 셸 골격: [android-twa](C:/Users/baek_/newmso/android-twa)
- TWA 앱 설정 템플릿: [twa-manifest.template.json](C:/Users/baek_/newmso/android-twa/twa-manifest.template.json)
- Bubblewrap 설정 템플릿: [bubblewrap.config.template.json](C:/Users/baek_/newmso/android-twa/bubblewrap.config.template.json)
- Digital Asset Links 생성 스크립트: [generate_assetlinks.js](C:/Users/baek_/newmso/scripts/generate_assetlinks.js)
- 배포용 샘플 파일: [assetlinks.sample.json](C:/Users/baek_/newmso/public/.well-known/assetlinks.sample.json)

## 배포 전에 반드시 필요한 값

1. 안드로이드 패키지명
2. 서명키 SHA-256 fingerprint
3. 운영 도메인
4. 앱 이름 / 런처 이름

## 추천 절차

1. [android-twa/twa-manifest.template.json](C:/Users/baek_/newmso/android-twa/twa-manifest.template.json)을 실제 값으로 채웁니다.
2. Bubblewrap를 쓸 경우 [android-twa/bubblewrap.config.template.json](C:/Users/baek_/newmso/android-twa/bubblewrap.config.template.json)을 기반으로 프로젝트를 생성합니다.
3. 서명키 fingerprint를 확보합니다.
4. 아래 명령으로 `assetlinks.json`을 생성합니다.

```bash
node scripts/generate_assetlinks.js kr.co.pchos.erp AA:BB:CC:... public/.well-known/assetlinks.json
```

5. 배포 후 아래 URL이 실제로 열리는지 확인합니다.

- `https://erp.pchos.kr/.well-known/assetlinks.json`

6. Android Studio 또는 Bubblewrap로 APK/AAB를 생성합니다.

## 권장 검증 항목

- 앱이 주소창 없이 독립 창으로 열리는지
- 웹 푸시 알림이 오는지
- 앱 아이콘 배지가 unread 수와 맞는지
- 딥링크가 로그인/채팅/문서 화면으로 정확히 이동하는지
- `모두 닫기` 이후에도 알림 경로가 복구되는지

## 주의

- TWA는 `서명키`와 `assetlinks.json`이 정확히 맞아야 최종 동작합니다.
- 현재 저장소는 앱 셸 골격과 생성 스크립트까지 준비된 상태이고,
  실제 출시용 서명/아이콘/버전코드 조정은 별도 마감 단계가 필요합니다.
