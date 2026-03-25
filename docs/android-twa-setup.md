# Android TWA Setup

이 문서는 `SY INC. MSO 통합 시스템`을 안드로이드 설치형 앱처럼 배포하기 위한 TWA 준비 절차입니다.

## 목표

- 안드로이드에서 PWA를 더 앱답게 실행
- 홈 화면/앱 아이콘/앱 전환기에서 독립 앱처럼 표시
- 웹 푸시와 백그라운드 알림 안정성 보강

## 현재 저장소에 준비된 것

- PWA manifest 보강: `/public/manifest.json`
- TWA 템플릿: `/android-twa/twa-manifest.template.json`
- assetlinks 생성 스크립트: `/scripts/generate_assetlinks.js`

## 남아 있는 운영 입력값

1. 안드로이드 패키지명
2. 서명 키 SHA-256 fingerprint
3. 실제 운영 도메인

## assetlinks.json 생성

```bash
node scripts/generate_assetlinks.js kr.co.pchos.erp XX:YY:ZZ:... public/.well-known/assetlinks.json
```

## 권장 절차

1. `android-twa/twa-manifest.template.json`을 기준으로 실제 값 작성
2. 서명키 fingerprint 확보
3. `scripts/generate_assetlinks.js`로 `public/.well-known/assetlinks.json` 생성
4. 배포 후 `https://<domain>/.well-known/assetlinks.json` 접근 확인
5. Bubblewrap 또는 Android Studio 기반으로 TWA 셸 생성

## 주의

- TWA는 앱 셸/서명키가 있어야 최종 완성됩니다.
- 지금 저장소에는 안드로이드 프로젝트 자체는 아직 없습니다.
- 따라서 이 단계는 “즉시 이어서 앱 셸 생성 가능한 준비 상태”까지 맞춘 것입니다.
