/**
 * 차트 이미지 OCR API (Gemini Vision)
 * 차트 프로그램 스크린샷에서 데이터를 텍스트로 추출합니다.
 */
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
];

async function callGeminiVision(prompt: string, imageBase64: string, mimeType: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }

    // SDK 방식으로 전환하여 안정성 확보
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: imageBase64, mimeType } }
            ]);
            const response = await result.response;
            const text = response.text();
            if (text) return text;
        } catch (err: any) {
            console.error(`Vision model ${modelName} failed:`, err.message);
            if (err.message?.includes('404')) continue;
            throw err;
        }
    }
    throw new Error('모든 모델 호출에 실패했습니다.');
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
