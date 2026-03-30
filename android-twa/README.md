# Android TWA Shell

이 폴더는 `erp.pchos.kr`를 안드로이드에서 설치형 앱처럼 실행하기 위한
최소 Trusted Web Activity(TWA) 셸입니다.

## 포함 파일

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/kr/co/pchos/erp/MainTwaActivity.kt`
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/values/colors.xml`

## 다음 단계

1. Android Studio에서 `android-twa` 폴더를 엽니다.
2. 실제 서명키 SHA-256으로
   - `public/.well-known/assetlinks.json`
   - Play Console / 앱 서명 설정
   를 맞춥니다.
3. 필요하면 앱 아이콘, 스플래시, 버전코드를 조정합니다.
4. 실제 기기에서 푸시, 배지, 딥링크를 검증합니다.

## 참고 문서

- [android-twa-setup.md](C:/Users/baek_/newmso/docs/android-twa-setup.md)
- [twa-manifest.template.json](C:/Users/baek_/newmso/android-twa/twa-manifest.template.json)
- [bubblewrap.config.template.json](C:/Users/baek_/newmso/android-twa/bubblewrap.config.template.json)

## 주의

- 이 폴더는 출시 직전 상태가 아니라, 저장소에 바로 연결할 수 있는 최소 셸입니다.
- 실제 배포 전에는 서명, `assetlinks.json`, 아이콘, 스토어 메타데이터를 함께 마감해야 합니다.
