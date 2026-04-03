/**
 * 퇴원심사 AI 분석 API
 * 차트 데이터와 기본 템플릿, 규정 기반 점검 결과를 함께 분석한다.
 */
import { NextResponse } from 'next/server';
import { readAuthorizedExtraFeatureUser } from '@/lib/server-extra-feature-access';
import {
  analyzeDischargeReviewRules,
  formatDischargeRuleAnalysisForPrompt,
} from '@/lib/discharge-review-rules';
import type { DischargeCustomRule } from '@/lib/discharge-custom-rules';

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini API 키가 설정되지 않았습니다. .env.local 파일에 GEMINI_API_KEY가 있는지 확인해 주세요.'
    );
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
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
        lastError = `[${model}] 응답 텍스트가 비어 있습니다.`;
        continue;
      }

      const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 200);
      lastError = `[${model}] API 오류 (${res.status}): ${errMsg}`;

      if (res.status === 403 || /expired|invalid/i.test(errMsg)) {
        throw new Error(`API 키 오류: ${errMsg}. Google AI Studio에서 키를 다시 확인해 주세요.`);
      }
    } catch (error) {
      if (error instanceof Error && /API 키 오류/i.test(error.message)) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(lastError)) {
    throw new Error(
      'Gemini 무료 쿼터를 초과했습니다. Google AI Studio에서 API 사용량을 확인해 주세요.'
    );
  }

  throw new Error(`Gemini 분석 실패: ${lastError}`);
}

export async function POST(req: Request) {
  try {
    const auth = await readAuthorizedExtraFeatureUser(req, '퇴원심사');
    if (!auth.user || auth.status || auth.error) {
      return NextResponse.json(
        { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: auth.status ?? 500 }
      );
    }

    const body = await req.json();
    const {
      patientName,
      birthDate,
      gender,
      department,
      admissionDate,
      dischargeDate,
      diagnosis,
      insuranceType,
      surgeryName,
      surgeryDate,
      roomGrade,
      doctorName,
      comorbidities,
      admissionRoute,
      dischargeType,
      drgCode,
      diseaseCodes,
      checkedItems,
      allItems,
      chartData,
      templateData,
      customRules,
    } = body;

    const admDate = new Date(admissionDate);
    const disDate = new Date(dischargeDate);
    const stayDays = Math.ceil((disDate.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));
    const age = birthDate
      ? Math.floor((Date.now() - new Date(birthDate).getTime()) / 31557600000)
      : null;

    const checkedLabels = (checkedItems || [])
      .map((item: any) => `☑ ${item.code ? `[${item.code}] ` : ''}${item.label}`)
      .join('\n');
    const uncheckedLabels = (allItems || [])
      .filter((item: any) => !(checkedItems || []).find((checked: any) => checked.id === item.id))
      .map((item: any) => `☐ ${item.code ? `[${item.code}] ` : ''}${item.label}`)
      .join('\n');

    const ruleAnalysis = analyzeDischargeReviewRules({
      diagnosis,
      surgeryName,
      surgeryDate,
      admissionDate,
      dischargeDate,
      dischargeType,
      drgCode,
      diseaseCodes,
      chartData,
      templateData,
      allItems,
      checkedItems,
      customRules: Array.isArray(customRules) ? (customRules as DischargeCustomRule[]) : [],
    });
    const rulePromptContext = formatDischargeRuleAnalysisForPrompt(ruleAnalysis);

    let prompt = `당신은 상급종합병원 퇴원심사와 진료비 청구 심사 전문가입니다. 아래 환자의 퇴원심사를 분석해 주세요.

## 환자 정보
- 환자명: ${patientName}
- 생년월일: ${birthDate || '미입력'}${age !== null ? ` (만 ${age}세)` : ''}
- 성별: ${gender || '미입력'}
- 진료과: ${department}
- 입원일: ${admissionDate}
- 퇴원일: ${dischargeDate}
- 입원 기간: ${stayDays}일
- 진단명: ${diagnosis || '미입력'}
- 보험 유형: ${insuranceType || '미입력'}
- 주치의: ${doctorName || '미입력'}
- 병실 등급: ${roomGrade || '미입력'}
- 수술명: ${surgeryName || '없음'}${surgeryDate ? ` (수술일 ${surgeryDate})` : ''}
- 동반 질환: ${comorbidities || '없음'}
- 입원 경로: ${admissionRoute || '미입력'}
- 퇴원 유형: ${dischargeType || '미입력'}
- DRG 코드: ${drgCode || '미입력'}
${diseaseCodes ? `- 진단코드: ${diseaseCodes}` : ''}`;

    prompt += `

## 확인 완료 항목
${checkedLabels || '(없음)'}

## 미확인 항목
${uncheckedLabels || '(없음)'}`;

    if (chartData && String(chartData).trim()) {
      prompt += `

## 환자 차트 원문
\`\`\`
${chartData}
\`\`\``;
    }

    if (templateData && String(templateData).trim()) {
      prompt += `

## 병원 기본 퇴원심사 템플릿
아래 항목은 병원에서 기본적으로 확인하는 퇴원심사 기준입니다.
\`\`\`
${templateData}
\`\`\``;
    }

    prompt += `

## 규정 기반 사전점검
${rulePromptContext}

## 분석 지시
- 규정 기반 사전점검의 Critical / Warning 항목을 최우선으로 반영하세요.
- 템플릿 누락, 과잉청구, DRG 적용 위험, 기록 보완 필요사항을 구분하세요.
- 근거가 약하면 “확인 필요”로 표현하세요.
- 답변은 아래 형식을 그대로 따르세요.

요약:
- 한 줄 총평

필수 누락 가능:
- 항목명: 이유

과잉/중복 가능:
- 항목명: 이유

DRG 위험:
- 항목명: 이유

기록 보완 필요:
- 항목명: 이유

권장 조치:
- 항목명: 이유

규칙 기반 점검과 AI 판단이 다르면 그 차이를 짧게 설명해 주세요.`;

    const raw = await callGemini(prompt);
    const analysis = raw.trim();

    return NextResponse.json({ analysis, ruleAnalysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isUserFacingError =
      /API 키 오류|쿼터|Gemini|Unauthorized/i.test(message);

    return NextResponse.json(
      {
        error: isUserFacingError
          ? message
          : '퇴원심사 분석 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
