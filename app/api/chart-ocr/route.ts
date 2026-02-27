/**
 * 차트 이미지 OCR API (Gemini Vision)
 * 차트 프로그램 스크린샷에서 데이터를 텍스트로 추출합니다.
 */
import { NextResponse } from 'next/server';

const MODELS = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro',
];

async function callGeminiVision(prompt: string, imageBase64: string, mimeType: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Environment keys available:', Object.keys(process.env).filter(k => k.includes('KEY') || k.includes('API')));
        throw new Error('Gemini API 키가 설정되지 않았습니다. .env.local 파일에 GEMINI_API_KEY가 있는지 확인해주세요.');
    }

    for (const model of MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType, data: imageBase64 } },
                        ],
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            }
            if (res.status === 404) continue;
            const errText = await res.text();
            console.error(`Gemini Vision [${model}] error (${res.status}):`, errText);
            if (res.status === 400 || res.status === 403) {
                throw new Error(`API 오류 (${res.status}): ${errText.substring(0, 200)}`);
            }
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('API 오류')) throw err;
            console.error(`Vision model ${model} failed:`, err);
        }
    }
    throw new Error('Gemini Vision 모델을 찾을 수 없습니다.');
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { image, mimeType } = body;

        if (!image || !mimeType) {
            return NextResponse.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 });
        }

        const prompt = `이 이미지는 한국 병원 차트 프로그램의 스크린샷입니다. 이미지에 있는 처방/청구 데이터를 정확하게 텍스트로 추출해주세요.

다음 규칙을 따르세요:
1. 각 행을 한 줄로, 컬럼은 탭(\\t)으로 구분해서 출력하세요.
2. 코드, 표준코드, 처방명, 급여구분(급/비/본100 등), 수량, 용량, 일수, 금액, 본인부담금, 비급여금액, 원내/원외, 날짜, 상태(처방/최종/접수) 순서로 추출하세요.
3. 빈 행이나 # 구분자 행도 그대로 포함하세요.
4. 이미지에서 보이는 그대로 추출하고, 내용을 수정하거나 해석하지 마세요.
5. 테이블 헤더는 제외하세요.
6. 금액에 쉼표가 있으면 그대로 유지하세요.

텍스트만 출력하세요. 설명이나 주석은 넣지 마세요.`;

        const result = await callGeminiVision(prompt, image, mimeType);
        return NextResponse.json({ text: result });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Chart OCR API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
