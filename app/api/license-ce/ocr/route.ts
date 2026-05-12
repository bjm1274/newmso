/**
 * 면허·자격 보수교육 이수증 OCR API
 * - Gemini Vision으로 이수증/수료증 이미지에서 교육일·과정명·기관명을 추출
 * - 인사 권한자만 호출 가능 (수정 권한 = 만료일 자동 연장 권한과 동일)
 */
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'] as const;

const RequestSchema = z.object({
  image: z.string().min(1, '이미지 데이터가 비어있습니다.'),
  mimeType: z.string().regex(/^image\//, '이미지 MIME 타입만 허용됩니다.'),
  licenseType: z.string().optional(),
  licenseName: z.string().optional(),
});

const OcrResultSchema = z.object({
  education_date: z.string().nullable(),
  course_name: z.string().nullable(),
  institution: z.string().nullable(),
  certificate_number: z.string().nullable(),
  hours: z.number().nullable().optional(),
  raw_text: z.string().nullable().optional(),
});

type OcrResult = z.infer<typeof OcrResultSchema>;

function buildPrompt(licenseType?: string, licenseName?: string): string {
  const targetHint = [licenseType, licenseName].filter(Boolean).join(' / ');
  const hintLine = targetHint ? `\n대상 면허/자격: ${targetHint}` : '';
  return `이 이미지는 한국의 면허·자격 보수교육 이수증(또는 수료증)입니다.${hintLine}

다음 정보를 정확하게 추출해서 JSON 형식으로만 출력하세요. 설명·코드블록·주석 금지:
{
  "education_date": "YYYY-MM-DD",     // 교육 이수일 또는 수료일. 기간이면 종료일. 못 찾으면 null
  "course_name": "과정명",             // 보수교육 과정명. 못 찾으면 null
  "institution": "발급기관/교육기관",   // 못 찾으면 null
  "certificate_number": "증서번호",     // 못 찾으면 null
  "hours": 8,                          // 이수시간(평점 아님) 숫자. 못 찾으면 null
  "raw_text": "추출 원문 일부"          // 검토용 핵심 텍스트 (200자 이내)
}

규칙:
- 날짜는 반드시 YYYY-MM-DD로 변환 (예: "2024년 8월 5일" → "2024-08-05")
- 교육기간이 "2024.01.01~2024.01.03" 같이 있으면 종료일 사용
- 시간은 "8시간" → 8 처럼 숫자만
- JSON 외 다른 텍스트는 절대 출력하지 마세요`;
}

async function callGemini(prompt: string, imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown = null;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageBase64, mimeType } },
      ]);
      const response = await result.response;
      const text = response.text();
      if (text) return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OCR 모델 호출 실패');
}

function safeParseOcr(text: string): OcrResult {
  // 모델이 코드블록을 감싸는 경우 대비
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 마지막 } 까지만 잘라서 재시도
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(cleaned.slice(0, lastBrace + 1));
      } catch {
        throw new Error('OCR 결과를 JSON으로 파싱하지 못했습니다.');
      }
    } else {
      throw new Error('OCR 결과를 JSON으로 파싱하지 못했습니다.');
    }
  }
  // 부분적으로 키가 빠져 있어도 허용 (모두 nullable)
  const result = OcrResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`OCR 결과 스키마 오류: ${result.error.issues[0]?.message ?? 'unknown'}`);
  }
  return result.data;
}

export async function POST(req: Request) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const perms = (session.user as { permissions?: Record<string, unknown> } | null)?.permissions ?? {};
    const hasAccess = Boolean(perms.admin || perms.mso || perms.hr);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const validated = RequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? '잘못된 요청입니다.' },
        { status: 400 },
      );
    }

    const { image, mimeType, licenseType, licenseName } = validated.data;
    const prompt = buildPrompt(licenseType, licenseName);
    const rawText = await callGemini(prompt, image, mimeType);
    const parsed = safeParseOcr(rawText);

    return NextResponse.json({ ok: true, data: parsed, rawText });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isUserFacing =
      msg.includes('API 키') || msg.includes('OCR') || msg.includes('JSON') || msg.includes('스키마');
    return NextResponse.json(
      { error: isUserFacing ? msg : '보수교육 이수증 OCR 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
