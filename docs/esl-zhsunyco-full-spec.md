# Zhsunyco ESL 독립 프로그램 구현 기술 명세서

## 핵심 인증 정보
- **API Base URL**: `http://zhsunyco.com.cn/api/default/`
- **store_code**: `googleg`
- **sign**: `80805d794841f1b41`
- **ESL 기기 코드**: `17900913`
- **기기 유형**: ESL-75MBWRY (800x480, 4색)
- **템플릿 ID**: `1944` (room101)
- **WebSocket**: `ws://zhsunyco.com.cn/ws?store=1`

## 현재 미해결 핵심 이슈
- `esl_ble/direct` API 호출 후 `query_status`에서 이미지 데이터(b64dat)가 생성되지 않음
- 원인: 템플릿 1944의 텍스트 요소에 Bind 변수가 연결되지 않았을 가능성
- 해결: 템플릿 편집에서 각 텍스트의 Bind 필드에 pn, pp, f1~f10 입력 필요

## API 워크플로우 (정상 동작 시)
1. `product/create` → 환자 정보를 상품으로 등록
2. `esl_ble/bind` → 기기-상품-템플릿 매칭
3. `esl_ble/direct` → 서버가 이미지 렌더링+압축+BLE 전송 명령 생성
4. `esl_ble/query_status` → b64dat(압축 이미지) 수신
5. Web Bluetooth로 b64dat를 ESL 기기에 직접 전송

## 템플릿 변수 매핑
| Bind 변수 | API 필드 | 용도 |
|-----------|---------|------|
| pn | pn | 1번 침대 환자명 |
| pp | pp | 1번 침대 수술명 |
| f1 | f1 | 1번 침대 입원일 |
| f2~f4 | f2~f4 | 2번 침대 |
| f5~f7 | f5~f7 | 3번 침대 |
| f8~f10 | f8~f10 | 4번 침대 |
