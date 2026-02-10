import { NextRequest, NextResponse } from 'next/server';

function getDemoResponse(messages: { role: string; content: string }[]): string {
  const last = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (last.includes('급여') || last.includes('명세')) return '급여 명세서는 [내 정보] → [급여명세] 또는 [인사관리] → [급여] 메뉴에서 확인할 수 있습니다.';
  if (last.includes('연차') || last.includes('휴가')) return '연차/휴가는 [인사관리] → [연차·휴가] 메뉴에서 신청하고, 승인 내역을 확인할 수 있습니다.';
  if (last.includes('전자결재') || last.includes('결재')) return '전자결재는 [전자결재] 메뉴에서 기안·결재함·완료 문서를 관리합니다.';
  if (last.includes('근태') || last.includes('출퇴근')) return '근태는 [내 정보] → [출퇴근] 또는 [인사관리] → [근태]에서 확인합니다. 출퇴근은 목포 송림로 73 (100m 이내)에서 GPS 인증 후 가능합니다.';
  if (last.includes('조직')) return '조직도는 메인 메뉴 [조직도]에서 확인할 수 있습니다.';
  return '인사·급여·근태·전자결재 관련 질문이 있으시면 위 키워드로 다시 물어보시거나, 좌측 메뉴에서 해당 기능을 이용해주세요.';
}

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
      const demoContent = getDemoResponse(messages);
      return NextResponse.json({
        content: `(데모 모드) OPENAI_API_KEY 설정 시 AI 답변이 제공됩니다.\n\n---\n${demoContent}`,
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
      let errorMsg = 'LLM 호출 실패';
      if (response.status === 401) errorMsg = 'OpenAI API 키가 유효하지 않습니다. .env.local의 OPENAI_API_KEY를 확인하세요.';
      else if (response.status === 429) {
        errorMsg = '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
        // 한도 초과 시에도 데모 답변 제공 (사용자 경험 개선)
        const fallback = getDemoResponse(messages);
        return NextResponse.json({ error: errorMsg, content: `${errorMsg}\n\n---\n${fallback}` });
      }
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
    return NextResponse.json({
      content: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요. 인사·급여·근태는 [인사관리], 전자결재는 [전자결재] 메뉴에서 이용할 수 있습니다.',
    });
  }
}
