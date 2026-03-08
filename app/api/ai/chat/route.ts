import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

function getDemoResponse(messages: { role: string; content: string }[]): string {
  const last = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (last.includes('급여') || last.includes('명세')) return '급여 명세서는 [내 정보] → [급여명세] 또는 [인사관리] → [급여] 메뉴에서 확인할 수 있습니다.';
  if (last.includes('연차') || last.includes('휴가')) return '연차/휴가는 [인사관리] → [연차·휴가] 메뉴에서 신청하고, 승인 내역을 확인할 수 있습니다.';
  if (last.includes('전자결재') || last.includes('결재') || last.includes('수리요청')) return '전자결재는 [전자결재] 메뉴에서 기안·결재함을 이용합니다. 연차/휴가, 연장근무, 물품신청, 수리요청서, 업무기안, 업무협조, 양식신청, 출결정정 등 양식을 선택해 작성할 수 있으며, 관리자 메뉴에서 전자결재 양식을 추가·수정할 수 있습니다.';
  if (last.includes('근태') || last.includes('출퇴근')) return '근태는 [내 정보] → [출퇴근] 또는 [인사관리] → [근태]에서 확인합니다. 출퇴근은 목포 송림로 73 (300m 이내)에서 GPS 인증 후 가능합니다.';
  if (last.includes('조직')) return '조직도는 메인 메뉴 [조직도]에서 확인할 수 있습니다.';
  if (last.includes('재고') || last.includes('물품')) return '재고·물품은 [재고관리] 메뉴에서 조회·입출고·물품 신청(전자결재 연동)을 할 수 있습니다.';
  if (last.includes('내 정보') || last.includes('마이페이지') || last.includes('할일') || last.includes('사진')) return '내 정보는 좌측 메뉴 [내 정보]에서 확인합니다. 프로필 사진, 출퇴근 기록, 할일, 증명서, 급여명세서를 한 화면에서 탭으로 이용할 수 있습니다. 사진·할일은 직원 계정(이름 로그인)으로 로그인했을 때 이용 가능합니다.';
  return '인사·급여·근태·전자결재·재고 관련 질문이 있으시면 위 키워드로 다시 물어보시거나, 좌측 메뉴에서 해당 기능을 이용해주세요.';
}

/**
 * AI 채팅 API (OpenAI 호환)
 * OPENAI_API_KEY 환경변수 설정 시 실제 LLM 호출
 * 미설정 시 데모 응답 반환
 */
export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
            content: `당신은 SY INC. MSO(경영지원) 통합 시스템의 업무 지원 어시스턴트입니다. 다음 구조를 이해하고 질문에 친절·간결하게 답변합니다.

[메뉴 구조]
- 조직도: 병원/회사별 조직도, 팀(진료부·간호부·총무부) 및 구성원
- 전자결재: 기안함·결재함·작성하기. 양식: 인사명령, 연차/휴가, 연장근무, 물품신청, 수리요청서, 업무기안, 업무협조, 양식신청, 출결정정 + 관리자가 추가한 양식
- 인사관리: 직원·급여·근태·연차·증명서·계약·법인카드 사용내역 등
- 재고관리: 재고 조회·입출고·물품 신청(전자결재 연동)
- 근태시스템: 출퇴근·스케줄
- 내 정보: 프로필(사진)·출퇴근·할일·증명서·급여명세서 (직원 계정 로그인 시)
- 관리자(MSO 전용): 대시보드, 엑셀일괄, 알림자동화, 근태규칙, 회사·팀·직원권한, 법인카드, 전자결재 양식 추가/수정, 계약, 팝업, 감사로그, 백업/복원

[답변 원칙]
- 메뉴 위치·절차를 구체적으로 안내하고, 모르는 내용은 "해당 메뉴에서 확인해 보시거나 관리자에게 문의해 주세요"로 마무리합니다.`,
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
        // 한도 초과 시에도 데모 답변을 메인으로 제공 (한도 문구 최소화)
        const fallback = getDemoResponse(messages);
        return NextResponse.json({
          content: `잠시 사용량 제한이 있어 기본 안내를 드립니다.\n\n${fallback}`,
          model: 'demo-fallback',
        });
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
