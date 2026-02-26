/**
 * 퇴원심사 AI 분석 API (Gemini 3.0+)
 * 차트 데이터와 기본 템플릿을 비교 분석합니다.
 */
import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini 3.0 이상 모델만 사용 (최신 순서)
const MODELS = [
    'gemini-3.1-pro',
    'gemini-3-pro',
    'gemini-3-flash',
    'gemini-2.5-pro',
];

async function callGemini(prompt: string): Promise<string> {
    if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

    for (const model of MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            }
            if (res.status === 404) continue;
            const errText = await res.text();
            console.error(`Gemini [${model}] error (${res.status}):`, errText);
            if (res.status === 400 || res.status === 403) {
                throw new Error(`API 오류 (${res.status}): ${errText.substring(0, 200)}`);
            }
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('API 오류')) throw err;
            console.error(`Model ${model} failed:`, err);
        }
    }
    throw new Error('사용 가능한 Gemini 모델을 찾을 수 없습니다. API 키를 확인해주세요.');
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { patientName, department, admissionDate, dischargeDate, diagnosis, checkedItems, allItems, chartData, templateData } = body;

        const admDate = new Date(admissionDate);
        const disDate = new Date(dischargeDate);
        const stayDays = Math.ceil((disDate.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));

        const checkedLabels = (checkedItems || []).map((i: any) => `✅ ${i.code ? `[${i.code}] ` : ''}${i.label}`).join('\n');
        const uncheckedLabels = (allItems || [])
            .filter((i: any) => !(checkedItems || []).find((c: any) => c.id === i.id))
            .map((i: any) => `❌ ${i.code ? `[${i.code}] ` : ''}${i.label}`)
            .join('\n');

        let prompt = `당신은 한국 병원의 퇴원심사 및 의료비 청구 전문가입니다. 아래 환자의 퇴원 심사를 분석해주세요.

## 환자 정보
- 환자명: ${patientName}
- 진료과: ${department}
- 입원일: ${admissionDate}
- 퇴원 예정일: ${dischargeDate}
- 입원 기간: ${stayDays}일
- 진단명: ${diagnosis || '미입력'}

## 확인 완료 항목
${checkedLabels || '(없음)'}

## 미확인 항목
${uncheckedLabels || '(없음)'}`;

        if (chartData && chartData.trim()) {
            prompt += `

## 환자 차트 데이터 (원본)
\`\`\`
${chartData}
\`\`\``;
        }

        if (templateData && templateData.trim()) {
            prompt += `

## 기본 항목 템플릿 (표준 퇴원 항목)
아래는 병원에서 설정한 표준 퇴원 항목입니다. 환자 차트 데이터와 비교하여 누락된 항목을 찾아주세요.
\`\`\`
${templateData}
\`\`\``;
        }

        prompt += `

## 분석 요청
1. **누락 항목 점검**: 미확인 항목 중 반드시 확인해야 할 항목을 알려주세요.
${templateData ? '2. **템플릿 비교**: 기본 항목 템플릿과 비교하여 환자 차트에 빠진 항목이 있는지 확인하세요.\n' : ''}3. **입원 기간 점검**: ${stayDays}일 입원에 맞는 처방/청구가 적절한지 점검하세요.
4. **과잉/누락 청구**: 중복 청구, 불필요한 항목, 빠진 청구 항목을 찾아주세요.
5. **진료과별 확인**: ${department} 특성상 추가로 확인해야 할 사항이 있다면 알려주세요.

항목별로 정리하고, 위험 수준(🔴 긴급, 🟡 주의, 🟢 참고)을 표시해주세요. 한국어로 답변하세요.`;

        const analysis = await callGemini(prompt);
        return NextResponse.json({ analysis });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Discharge review API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
