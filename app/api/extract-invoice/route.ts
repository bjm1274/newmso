import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readSessionFromRequest } from '@/lib/server-session';

export async function POST(req: NextRequest) {
    try {
        const session = await readSessionFromRequest(req);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY 환경 변수가 서버에 설정되어 있지 않습니다. 서버 설정을 확인해 주세요.' },
                { status: 500 }
            );
        }

        // Initialize the Google Generative AI within the request to ensure process.env is ready
        const genAI = new GoogleGenerativeAI(apiKey);

        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) {
            return NextResponse.json({ error: '파일이 업로드되지 않았습니다.' }, { status: 400 });
        }

        const mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        // 현재 가용한 최상위 고정밀 모델 적용 (기존 flash 모델에서 Pro로 업그레이드)
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-pro',
            generationConfig: { temperature: 0.1 }
        });

        const prompt = `
당신은 의료기기 및 소모품 명세서(영수증/인보이스) 데이터 추출 전문가입니다. 
다음 이미지/문서를 읽고, 품목 리스트를 추출하세요.

다음 형식의 정확한 JSON 배열(Array)만 출력하세요 (다른 설명 생략):
[
  {
    "item_name": "품목명",
    "category": "의료기기, 소모품, 약품, 사무용품 중 하나 (추론)",
    "quantity": 10,
    "unit_price": 5000,
    "supplier_name": "업체명 (문서 전체에서 파악 가능하면 추론)",
    "lot_number": "LOT 번호 (있으면 기재, 없으면 null)",
    "expiry_date": "YYYY-MM-DD 형식 (유효기간があれば 기재, 없으면 null)"
  }
]
`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType,
                },
            },
        ]);

        const text = result.response.text();
        console.log('Gemini Raw Result:', text);

        // JSON 부분만 정규식으로 안전하게 추출
        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) {
            throw new Error('JSON 형식을 찾을 수 없습니다.');
        }

        const parsedData = JSON.parse(jsonMatch[0]);

        return NextResponse.json({ success: true, data: parsedData });
    } catch (error: any) {
        console.error('Invoice Extraction Error:', error);
        return NextResponse.json(
            { error: error?.message || '명세서 정보 추출에 실패했습니다.' },
            { status: 500 }
        );
    }
}
