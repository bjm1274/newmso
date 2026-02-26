/**
 * 퇴원심사 AI 분석 API (Gemini 3.0+)
 * 차트 데이터와 기본 템플릿을 비교 분석합니다.
 */
import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini 3.0 이상 모델 (실제 API 모델명)
const MODELS = [
    'gemini-3.1-pro-preview',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
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
        const { patientName, birthDate, gender, department, admissionDate, dischargeDate, diagnosis,
            insuranceType, surgeryName, surgeryDate, roomGrade, doctorName, comorbidities,
            admissionRoute, dischargeType, drgCode, diseaseCodes,
            checkedItems, allItems, chartData, templateData } = body;

        const admDate = new Date(admissionDate);
        const disDate = new Date(dischargeDate);
        const stayDays = Math.ceil((disDate.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));
        const age = birthDate ? Math.floor((Date.now() - new Date(birthDate).getTime()) / 31557600000) : null;

        const checkedLabels = (checkedItems || []).map((i: any) => `✅ ${i.code ? `[${i.code}] ` : ''}${i.label}`).join('\n');
        const uncheckedLabels = (allItems || [])
            .filter((i: any) => !(checkedItems || []).find((c: any) => c.id === i.id))
            .map((i: any) => `❌ ${i.code ? `[${i.code}] ` : ''}${i.label}`)
            .join('\n');

        let prompt = `당신은 한국 병원의 퇴원심사 및 의료비 청구 전문가입니다. 아래 환자의 퇴원 심사를 분석해주세요.

## 환자 정보
- 환자명: ${patientName}
- 생년월일: ${birthDate || '미입력'}${age !== null ? ` (만 ${age}세)` : ''}
- 성별: ${gender || '미입력'}
- 진료과: ${department}
- 입원일: ${admissionDate}
- 퇴원 예정일: ${dischargeDate}
- 입원 기간: ${stayDays}일
- 진단명: ${diagnosis || '미입력'}
- 보험 구분: ${insuranceType || '미입력'}
- 주치의: ${doctorName || '미입력'}
- 병실 등급: ${roomGrade || '미입력'}
- 수술명: ${surgeryName || '없음'}${surgeryDate ? ` (수술일: ${surgeryDate})` : ''}
- 동반 질환: ${comorbidities || '없음'}
- 입원 경로: ${admissionRoute || '미입력'}
- 퇴원 유형: ${dischargeType || '미입력'}
- DRG 코드: ${drgCode || '미입력'}
${diseaseCodes ? `
## 상병명 (의사 입력 진단코드)
${diseaseCodes}` : ''}

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
아래 항목을 점검하고, **간결한 단답형**으로 핵심만 전달하세요. 불필요한 설명 없이 짧게 작성하세요.

**출력 형식 (반드시 이 형식을 따르세요):**
🔴 [항목] — 점검 필요 (이유 한 줄)
🟡 [항목] — 확인 필요 (이유 한 줄)
🟢 [항목] — 적절함

**점검 항목:**
- 누락 항목 (미확인 항목 중 필수 확인 필요한 것)
${templateData ? '- 템플릿 대비 누락/추가 항목\n' : ''}- ${insuranceType || '건강보험'} 기준 급여/비급여 적절성
- ${stayDays}일 입원 기간 대비 처방 적절성
- 중복/과잉/누락 청구
${diseaseCodes ? '- 상병명-처방 연관성 (상병에 맞지 않는 처방 여부)\n' : ''}${age !== null && age >= 65 ? '- 만 ' + age + '세 노인 가산 항목\n' : ''}${surgeryName ? '- ' + surgeryName + ' 수술 후 표준 처방 누락 여부\n' : ''}${comorbidities ? '- ' + comorbidities + ' 관련 추가 처방\n' : ''}${roomGrade ? '- ' + roomGrade + ' 병실료 적절성\n' : ''}
**총평** 한 줄로 마무리. 한국어로 답변.`;

        const analysis = await callGemini(prompt);
        return NextResponse.json({ analysis });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Discharge review API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
