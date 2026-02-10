# AI 채팅 - OpenAI 연동 가이드

## 개요

AI 채팅 기능은 **OpenAI GPT-4o-mini** 모델을 사용합니다.

---

## 1. OpenAI API 키 발급

1. [OpenAI 플랫폼](https://platform.openai.com/) 접속 후 로그인
2. **API keys** 메뉴 이동
3. **Create new secret key** 클릭
4. 생성된 키를 복사 (한 번만 표시됨, 안전한 곳에 보관)

---

## 2. 로컬 개발 환경 설정

프로젝트 루트의 `.env.local` 파일에 다음 추가:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- 키 앞뒤에 공백 없이 입력
- `.env.local` 파일이 없다면 새로 생성

---

## 3. Vercel 배포 시 설정

1. Vercel 대시보드 → 프로젝트 선택 → **Settings** → **Environment Variables**
2. 변수 추가:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: 발급받은 API 키
   - **Environment**: Production, Preview, Development (필요한 환경 체크)

---

## 4. 비용 참고

| 모델 | 입력 (1M 토큰) | 출력 (1M 토큰) |
|------|----------------|----------------|
| gpt-4o-mini | $0.15 | $0.60 |

- 일반적인 대화 1회: 약 $0.001 미만 (1원 미만)
- 월 수백~수천 회 사용 시에도 수천 원 수준

---

## 5. 키 미설정 시

`OPENAI_API_KEY`가 없으면 **데모 모드**로 동작합니다.

- "AI 채팅을 사용하려면 .env.local에 OPENAI_API_KEY를 설정해주세요" 메시지 표시

---

## 6. 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| "LLM 호출 실패" | 잘못된 API 키 | 키 확인 후 재설정 |
| 429 오류 | 요청 한도 초과 | 잠시 대기 또는 플랜 업그레이드 |
| 응답 없음 | 네트워크 오류 | 인터넷 연결 확인 |
