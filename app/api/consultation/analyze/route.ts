import { NextRequest, NextResponse } from 'next/server';
import { readAuthorizedExtraFeatureUser } from '@/lib/server-extra-feature-access';

export const dynamic = 'force-dynamic';

const ANALYSIS_PROMPT = `당신은 한국 의료기관의 수술 상담 내용을 분석하는 전문 의료 비서입니다.
아래 음성 녹음은 의사와 환자(또는 보호자) 간의 수술 상담 대화입니다.

다음 JSON 형식으로 정확하게 분석해 주세요. 해당 내용이 없으면 빈 배열([]) 또는 빈 문자열("")을 사용하세요.

{
  "transcript_summary": "전체 상담 내용 요약 (3-5문장)",
  "chief_complaint": "주요 증상 및 주호소 (환자가 호소한 증상)",
  "diagnosis": "진단명 또는 의심 진단 (언급된 경우)",
  "surgery_plan": "수술 방법, 수술명, 수술 과정 설명 내용",
  "risks_and_complications": ["합병증 및 위험사항 1", "합병증 및 위험사항 2"],
  "patient_questions": ["환자/보호자 질문 1", "환자/보호자 질문 2"],
  "doctor_answers": ["의사 답변/안내 1", "의사 답변/안내 2"],
  "precautions": ["수술 전 주의사항 1", "수술 전 주의사항 2"],
  "post_op_instructions": ["수술 후 주의사항 1", "수술 후 주의사항 2"],
  "consent_required": ["동의 필요 항목 1", "동의 필요 항목 2"],
  "medications": ["처방/복용 관련 안내 1"],
  "next_schedule": "다음 예약 또는 일정 (날짜, 시간 포함)",
  "special_notes": "기타 특이사항 또는 중요 메모",
  "consultation_date": "상담 날짜 (언급된 경우, 없으면 빈 문자열)"
}

규칙:
1. JSON만 출력하세요. 설명, 주석, 마크다운 코드블록 없이 순수 JSON만 출력.
2. 한국어로 작성하세요.
3. 의료 용어는 정확하게 기재하고, 모호한 내용은 따옴표로 인용하세요.
4. 환자 이름, 주민번호 등 개인정보가 나와도 그대로 포함하세요.
5. 음성이 불명확하거나 내용이 없는 항목은 빈 값으로 두세요.`;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 + 추가기능 권한 확인
    //
    // 예전에는 세션 id 유무만 봤다. 같은 수술상담 기능의 짝 라우트인
    // /api/consultation/transcribe 는 readAuthorizedExtraFeatureUser(req,'수술상담') 을
    // 요구하는데 이 쪽만 열려 있어, 수술상담 권한이 없는 로그인 사용자도
    // 상담 오디오 분석(Gemini 호출)을 그대로 돌릴 수 있었다. 게이트를 같은 것으로 맞춘다.
    const authorized = await readAuthorizedExtraFeatureUser(request, '수술상담');
    if (!authorized.user || authorized.status || authorized.error) {
      return NextResponse.json(
        { ok: false, error: authorized.status === 401 ? '인증이 필요합니다.' : '권한이 없습니다.' },
        { status: authorized.status ?? 500 },
      );
    }

    // 2. 서버 사이드 API 키 (클라이언트에 노출하지 않음)
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: '서버에 AI API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 3. FormData에서 파일 및 메타데이터 추출
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mimeType = String(formData.get('mimeType') || 'audio/webm');
    const displayName = String(formData.get('displayName') || `consultation_${Date.now()}`);

    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, error: '분석할 오디오 파일이 없습니다.' }, { status: 400 });
    }

    // 4. Google Files API에 업로드 (resumable upload)
    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    // 4a. 업로드 세션 시작
    const startUrl = `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`;
    const startRes = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileBuffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => '');
      throw new Error(`Google Files API 세션 생성 실패: ${startRes.statusText} (${errText})`);
    }

    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error('업로드 URL을 획득하지 못했습니다.');

    // 4b. 데이터 업로드
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
        'Content-Type': mimeType,
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`Google Files API 업로드 실패 (Status: ${uploadRes.status})`);
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    const fileName = uploadData.file?.name;

    if (!fileUri) throw new Error('업로드된 파일의 URI를 획득하지 못했습니다.');

    // 5. Gemini API 호출하여 분석 수행
    const modelUrl = `${GEMINI_API_BASE}/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const modelRes = await fetch(modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: ANALYSIS_PROMPT },
            { fileData: { fileUri, mimeType } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!modelRes.ok) {
      const errText = await modelRes.text().catch(() => '');
      throw new Error(`Gemini 모델 분석 실패: ${modelRes.statusText} (${errText})`);
    }

    const modelData = await modelRes.json();
    const rawText = modelData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 6. JSON 결과 파싱
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = {
        transcript_summary: rawText,
        special_notes: '자동 분석 결과를 JSON으로 파싱하지 못했습니다.',
      };
    }

    // 7. 구글 서버 임시 파일 삭제 (best-effort)
    if (fileName) {
      const deleteUrl = `${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`;
      fetch(deleteUrl, { method: 'DELETE' }).catch(() => {});
    }

    return NextResponse.json({ ok: true, result: parsed });
  } catch (err) {
    console.error('[api/consultation/analyze] 오류:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '상담 분석 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
