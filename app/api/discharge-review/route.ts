/**
 * 퇴원심사 AI 분석 API
 * 차트 데이터와 기본 템플릿을 비교 분석합니다.
 */
import { NextResponse } from 'next/server';

const MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
];

async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('Environment keys available:', Object.keys(process.env).filter(k => k.includes('KEY') || k.includes('API')));
        throw new Error('Gemini API 키가 설정되지 않았습니다. .env.local 파일에 GEMINI_API_KEY가 있는지 확인해주세요.');
    }

    let lastError = '';
    for (const model of MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    // Gemini 3.x: temperature 기본값 1.0 권장, 무료 한도 내 토큰 설정
                    generationConfig: { temperature: 1.0, maxOutputTokens: 2048 },
                }),
            });
            const data = await res.json();

            if (res.ok) {
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
                lastError = `[${model}] 응답 텍스트 없음: ${JSON.stringify(data).substring(0, 100)}`;
            } else {
                const errMsg = data?.error?.message || JSON.stringify(data).substring(0, 150);
                lastError = `[${model}] API 오류 (${res.status}): ${errMsg}`;
                console.error(`Gemini [${model}] error:`, data);
                // API 키 만료/잘못된 키는 즉시 중단
                if (res.status === 403 || errMsg.includes('expired') || errMsg.includes('invalid')) {
                    throw new Error(`API 키 오류: ${errMsg}. Google AI Studio에서 새 키를 발급하세요.`);
                }
                // 429(쿼터 초과), 404(모델 미지원)는 다음 모델로 시도
            }
        } catch (err) {
            if (err instanceof Error && (err.message.includes('API 키 오류') || err.message.includes('상태'))) throw err;
            console.error(`Model ${model} failed:`, err);
            lastError = String(err);
        }
    }
    const isQuotaError = lastError.includes('429') || lastError.includes('RESOURCE_EXHAUSTED') || lastError.includes('quota');
    if (isQuotaError) {
        throw new Error('Gemini 무료 쿼터 초과. Google AI Studio (aistudio.google.com/apikey) 에서 새 API 키를 발급해주세요.');
    }
    throw new Error(`Gemini 분석 실패: ${lastError}`);
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

        const raw = await callGemini(prompt);
        const analysis = raw.trim();
        return NextResponse.json({ analysis });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Discharge review API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
