import { NextRequest, NextResponse } from 'next/server';

/**
 * AI 채팅 API (OpenAI 호환)
 * OPENAI_API_KEY 환경변수 설정 시 실제 LLM 호출
 * 미설정 시 데모 응답 반환
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages = [] } = body as { messages?: { role: string; content: string }[] };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        content:
          'AI 채팅을 사용하려면 .env.local에 OPENAI_API_KEY를 설정해주세요. 현재는 데모 모드입니다.',
        model: 'demo',
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '당신은 SY INC. MSO 통합 시스템의 업무 지원 어시스턴트입니다. 직원들의 인사, 급여, 근태, 전자결재 등에 관한 질문에 친절하고 간결하게 답변합니다.',
          },
          ...messages,
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      let errorMsg = 'LLM 호출 실패';
      if (response.status === 401) errorMsg = 'OpenAI API 키가 유효하지 않습니다. .env.local의 OPENAI_API_KEY를 확인하세요.';
      else if (response.status === 429) errorMsg = '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
      return NextResponse.json(
        { error: errorMsg, content: errorMsg },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '응답을 생성할 수 없습니다.';

    return NextResponse.json({ content, model: 'gpt-4o-mini' });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { error: 'AI 채팅 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
