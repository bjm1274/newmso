# Zhsunyco ESL Cloud 연동 가이드

## 핵심 인증 정보
- **API Base URL**: `http://zhsunyco.com.cn/api/default/`
- **store_code**: `googleg`
- **sign**: `80805d794841f1b41`
- **ESL 기기 코드**: `17900913` (WL17900913)
- **기기 유형**: ESL-75MBWRY (800x480, 4색)
- **템플릿 ID**: `1944` (4분할 병실 레이아웃)

## API 워크플로우

### 1단계: 상품 데이터 전송 (이미지 생성 요청)
```
POST http://zhsunyco.com.cn/api/default/esl_ble/direct
Content-Type: application/json

{
  "store_code": "googleg",
  "is_base64": "0",
  "sign": "80805d794841f1b41",
  "f1": [{
    "esl_code": "17900913",
    "template_id": 1944,
    "product": {
      "pc": "101",
      "pn": "김재호",
      "pp": "TKA",
      "f1": "2026-03-02",
      "f2": "기길옥",
      "f3": "척추고정술",
      "f4": "2026-03-18",
      "f5": "", "f6": "", "f7": "",
      "f8": "", "f9": "", "f10": ""
    }
  }]
}
```

### 2단계: 생성된 이미지 데이터 조회 (폴링)
```
POST http://zhsunyco.com.cn/api/default/esl_ble/query_status
Content-Type: application/json

{
  "store_code": "googleg",
  "f1": 1,
  "f2": 5,
  "f3": ["17900913"],
  "is_base64": "0",
  "sign": "80805d794841f1b41"
}
```

### 3단계: 응답의 b64dat를 BLE로 기기에 전송

## 템플릿 변수 매핑 (4분할)
| 변수 | 용도 |
|------|------|
| pn | 1번 침대 환자명 |
| pp | 1번 침대 수술명 |
| f1 | 1번 침대 입원일 |
| f2 | 2번 침대 환자명 |
| f3 | 2번 침대 수술명 |
| f4 | 2번 침대 입원일 |
| f5 | 3번 침대 환자명 |
| f6 | 3번 침대 수술명 |
| f7 | 3번 침대 입원일 |
| f8 | 4번 침대 환자명 |
| f9 | 4번 침대 수술명 |
| f10 | 4번 침대 입원일 |

## 주요 API 엔드포인트
| 엔드포인트 | 설명 |
|-----------|------|
| `esl_ble/direct` | 이미지 생성 요청 |
| `esl_ble/query_status` | 생성된 이미지 데이터 조회 |
| `esl_ble/query` | 등록된 기기 목록 조회 |
| `esl_ble/bind` | 기기-상품-템플릿 바인딩 |
| `esl_ble/unbind` | 바인딩 해제 |
| `esl_ble/search` | 기기 LED 깜빡임 |
| `esl_ble/del` | 기기 삭제 |

## 한글 인코딩 주의
- API 서버가 한글을 제대로 처리하지 못할 수 있음
- 템플릿에 한글 폰트(Zfull-GB 등) 설정 필요
- 인코딩 오류 시 영문 사용 또는 서버측 charset 설정 확인

## 현재 미해결 이슈
- `esl_ble/direct` 호출 후 `query_status`에서 이미지 데이터가 생성되지 않음
- 원인 추정: 템플릿에 Bind 변수가 제대로 연결되지 않았을 가능성
- 확인 필요: 제조사 사이트에서 템플릿 편집 → 각 텍스트 요소의 Bind 필드에 변수명 입력 확인
