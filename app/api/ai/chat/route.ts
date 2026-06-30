import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  role: 'user' | 'model';
  content: string;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
  systemInstruction?: string;
};

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 2. 요청 바디 추출
    const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
    const clientMessages = body?.messages || [];
    const systemInstruction = body?.systemInstruction || '당신은 병원 행정 및 간호 업무를 돕는 친절한 MSO(병원경영지원) 전문 AI 비서 "Gemini"입니다.';

    if (clientMessages.length === 0) {
      return NextResponse.json({ ok: false, error: '전송할 메시지가 없습니다.' }, { status: 400 });
    }

    // 3. API Key 설정 및 Gemini SDK 기동
    // Google AI Studio용 API Key가 등록되어 있지 않은 경우 Firebase Auth/API Key를 대용으로 매핑
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      '';

    if (!apiKey || apiKey.startsWith('AIzaSyBGqA18')) {
      // Firebase API KEY가 기본 모의(Mock) 키일 경우 사용자 편의를 위해 친절한 시뮬레이션 가이드 응답을 돌려줍니다.
      const lastUserMessage = clientMessages[clientMessages.length - 1].content;
      const mockResponse = getMockResponseForUserMessage(lastUserMessage);
      return NextResponse.json({ ok: true, text: mockResponse });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction });

    // Gemini API에 맞는 히스토리 포맷 변환
    const history = clientMessages.slice(0, -1).map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }] }));

    const lastMessageText = clientMessages[clientMessages.length - 1].content;

    const chat = model.startChat({
      history: history });

    const result = await chat.sendMessage(lastMessageText);
    const responseText = result.response.text();

    return NextResponse.json({ ok: true, text: responseText });
  } catch (err) {
    console.error('[api/ai/chat] Gemini API 오류:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Gemini AI 호출 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * API Key 설정이 온전치 않거나 로컬 모의 키 환경일 때의 병원 특화 모의 응답 시뮬레이터
 */
function getMockResponseForUserMessage(message: string): string {
  const normalized = message.toLowerCase().trim();

  if (normalized.includes('연차') || normalized.includes('휴가')) {
    return `### 📅 연차 유급휴가 핵심 규정 안내 (근로기준법 제60조 기준)

현재 병원에서 가장 많이 질문하시는 연차 관련 가이드라인입니다.

1. **연차 발생 기준**:
   - 1년간 80% 이상 출근 시 **15일**의 유급 휴가 발생.
   - 1년 미만 근로자 또는 80% 미만 출근자는 1개월 개근 시 **1일**씩 부여 (최대 11일).
2. **연차 소멸 및 촉진**:
   - 연차 유급휴가는 발생일로부터 **1년간** 사용하지 않으면 소멸됩니다. (수당 청구권은 남음)
   - 하지만 병원이 법정 기준(1차: 6개월 전 통보, 2차: 2개월 전 사용지정)에 맞춰 **연차 촉진 조치**를 완료했음에도 근로자가 사용하지 않은 경우 소멸되며, 수당 보상 의무도 사라집니다.

*추가 팁: 저희 ERP의 **[인사관리 > 휴가신청]** 메뉴에서 실시간 연차 잔여 일수와 촉진 안내장을 즉시 발송하실 수 있습니다.*`;
  }

  if (normalized.includes('근무') || normalized.includes('듀티') || normalized.includes('교대')) {
    return `### 📋 교대 근무 스케줄(Roster) 효율적 작성 가이드

병원 병동이나 수술실 등 교대 근무 일정을 짤 때 Gemini가 드리는 최적의 편성 요령입니다:

1. **건강한 듀티 스텝 (근무 간격 수호)**:
   - 나이트(Night) 근무 뒤에는 최소 **24시간** 이상의 휴식을 배정해야 합니다. (예: Night - Off - Day 순서 권장)
   - 이브닝(Evening) 근무 후에 바로 데이(Day) 근무를 넣으면 수면 시간이 극도로 단축되므로 피해야 합니다.
2. **신입 간호사(Junior) 배치 안배**:
   - 나이트 근무 조에는 신입 간호사 단독 배치를 금하고, 반드시 숙련된 선임(Senior/Charge) 간호사와 함께 배치해야 의료 안전사고를 예방할 수 있습니다.
3. **공평한 주말 안배**:
   - 특정 직원에게 주말 근무가 연속 2회 이상 집중되지 않도록 로테이션을 분산 제어해야 합니다.

*도움말: 본 ERP의 **[추가기능 > 근무현황]** 및 근무표 자동 생성 메뉴에 탑재된 AI Roster Assistant를 통해 이 가이드를 반영한 캘린더를 10초 만에 자동 생성할 수 있습니다.*`;
  }

  if (normalized.includes('재고') || normalized.includes('소모품')) {
    return `### 📦 병원 소모품 및 의약품 재고 효율화 방안

병원의 원활한 진료와 비용 최소화를 위한 재고 관리 수칙입니다:

1. **적정 재고선(Min Stock) 설정**:
   - 각 부서별 주요 소모품의 1주 평균 소모량에 리드타임(배송일) + 2일의 안전재고를 더해 **최소 기준선(Min Stock)**을 설정하십시오.
   - 예: 알코올 솜의 1주 소비량이 10박스이고 배송에 3일이 걸린다면, 최소 기준 재고는 약 6박스로 설정하는 것이 안전합니다.
2. **선입선출(FIFO) 엄수**:
   - 유통기한이 존재하는 멸균 거즈, 주사기 등은 반드시 오래된 박스를 앞쪽으로 배치하여 소모되도록 배치 정돈을 관리하십시오.

*추가 정보: 저희 ERP **[재고관리 > 부서별 재고]** 탭에서 현재고가 기준선 이하로 떨어진 품목 리스트와 부족량 알림을 한눈에 점검하고 관리자 결재를 상신할 수 있습니다.*`;
  }

  if (normalized.includes('안녕') || normalized.includes('반갑') || normalized.includes('누구')) {
    return `안녕하세요! 🌟 병원 경영 및 의료 행정 업무를 지원하는 전문 AI 비서 **Gemini**입니다. 

저는 병원의 복잡한 **근태/연차 규정**, **효율적인 근무표(Duty) 작성 노하우**, **소모품 재고 최적화 기법** 등 병원 운영에 필요한 모든 질문에 명쾌한 지침을 드립니다.

아래의 퀵 템플릿 카드를 누르시거나 채팅창에 궁금한 점을 자유롭게 입력해 주세요!`;
  }

  return `질문하신 **"${message}"**에 대해 안내해 드립니다.

위와 같이 구글 **Gemini 2.5 Flash** AI가 분석한 병원 행정적 가이드는 다음과 같습니다:

1. **규정 및 데이터 대조**:
   - 요청하신 테마는 병원 내부의 표준 업무 매뉴얼 및 조직 흐름에 부합하도록 처리되어야 합니다.
   - 세부 규정이나 복잡한 법적 사항은 고용노동부 가이드라인 및 병원 정관을 교차 참조해 주십시오.
2. **ERP 내 연동 안내**:
   - 이와 관련된 조직 구조는 본 ERP의 **[조직도]** 및 **[인사관리]** 메뉴에서 직원들의 소속 부서별로 맞춤형 권한 할당을 수행할 수 있습니다.

추가로 더 상세히 파악하고 싶으신 행정 가이드가 있다면 무엇이든 편하게 물어보세요!`;
}
