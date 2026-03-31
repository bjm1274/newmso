/**
 * 수술상담 음성 분석 API (Gemini Audio)
 * 음성 녹음/파일을 받아 상담 내용을 자동 분석합니다.
 */
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readAuthorizedExtraFeatureUser } from '@/lib/server-extra-feature-access';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];

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

async function analyzeWithGemini(audioBase64: string, mimeType: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');

    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
            });

            const result = await model.generateContent([
                ANALYSIS_PROMPT,
                { inlineData: { data: audioBase64, mimeType } },
            ]);
            const text = result.response.text();
            if (text) return text;
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('404') || msg.includes('not found')) continue;
            if (msg.includes('responseMimeType')) {
                // responseMimeType 미지원 모델 fallback (JSON 형식만 프롬프트로 강제)
                try {
                    const model2 = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0.1 } });
                    const result2 = await model2.generateContent([
                        ANALYSIS_PROMPT,
                        { inlineData: { data: audioBase64, mimeType } },
                    ]);
                    const text2 = result2.response.text();
                    if (text2) return text2;
                } catch {
                    continue;
                }
            }
            throw err;
        }
    }
    throw new Error('모든 모델 호출에 실패했습니다.');
}

export async function POST(req: Request) {
    try {
        const auth = await readAuthorizedExtraFeatureUser(req, '수술상담');
        if (!auth.user || auth.status || auth.error) {
            return NextResponse.json(
                { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
                { status: auth.status ?? 500 }
            );
        }

        const body = await req.json();
        const { audio, mimeType } = body as { audio?: string; mimeType?: string };

        if (!audio || !mimeType) {
            return NextResponse.json({ error: '음성 데이터가 없습니다.' }, { status: 400 });
        }

        // 파일 크기 제한 (20MB base64 ≒ 15MB 원본)
        const approxSizeMB = (audio.length * 0.75) / (1024 * 1024);
        if (approxSizeMB > 20) {
            return NextResponse.json({ error: '파일 크기가 너무 큽니다. 20MB 이하로 업로드해주세요.' }, { status: 400 });
        }

        const rawText = await analyzeWithGemini(audio, mimeType);

        // JSON 파싱 시도
        let parsed: Record<string, unknown>;
        try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        } catch {
            parsed = { transcript_summary: rawText, special_notes: '자동 분석 결과를 JSON으로 파싱하지 못했습니다.' };
        }

        return NextResponse.json({ result: parsed });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { error: msg.includes('API 키') || msg.includes('모델') ? msg : '음성 분석 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
