# Android TWA Shell

이 폴더는 `erp.pchos.kr`를 안드로이드 설치형 앱처럼 감싸기 위한
Trusted Web Activity(TWA) 최소 셸입니다.

## 포함된 파일

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/kr/co/pchos/erp/MainTwaActivity.kt`
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/values/colors.xml`
- `app/src/main/res/xml/asset_statements.xml`

## 다음 단계

1. Android Studio에서 `android-twa` 폴더를 엽니다.
2. 실제 서명키 SHA-256으로 `asset_statements.xml`과 `assetlinks.json`을 맞춥니다.
3. 필요하면 아이콘/스플래시를 추가합니다.
4. 실기기에서 푸시, 배지, 링크 라우팅을 확인합니다.

## 주의

- 현재는 저장소 안에서 바로 이어서 작업할 수 있도록 만든 최소 셸입니다.
- 실제 출시 전에는 앱 서명, `assetlinks.json`, 아이콘, 스플래시, 버전코드 등을 확정해야 합니다.
