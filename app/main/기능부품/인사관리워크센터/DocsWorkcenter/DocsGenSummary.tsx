'use client';

/**
 * DocsGenSummary — 계약서 자동생성 탭 요약 카드 (reference §1432~1466)
 *
 * 2-col split:
 * 좌: doc-tpl-grid 6개 템플릿 (이름 + 종류 + 사용 N회)
 * 우: cl-steps 5단계 wizard (1.선택 2.자동채움 3.미리보기 4.전자서명 5.보관)
 *
 * 템플릿 데이터: contract_templates 또는 정적 fallback (사용자 정책)
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';

interface TemplateData {
  id: string;
  name: string;
  kind: string;
  used: number;
  tone: 'success' | 'accent' | 'muted';
  /** 실데이터가 아니라 예시 목록임을 표시 (D04-016) */
  sample?: boolean;
}

const TONE_CLS: Record<TemplateData['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

// 예시 목록. 예전에는 사용 횟수(22/4/1/18/9/6)까지 달아 실데이터와 구분이 안 됐고,
// contract_templates 셀렉트가 부재 컬럼(name/kind/used_count)을 요청해 실데이터가 한 번도
// 표시된 적이 없었기 때문에 **이 하드코딩 숫자가 사실상 유일한 화면 내용**이었다.
// 이제 '예시' 배지를 달고 사용 횟수는 노출하지 않는다.
const FALLBACK_TEMPLATES: TemplateData[] = [
  { id: 'tpl-1', name: '근로계약서 (정규직)', kind: '근로', used: 0, tone: 'success', sample: true },
  { id: 'tpl-2', name: '개별근로계약서', kind: '근로', used: 0, tone: 'success', sample: true },
  { id: 'tpl-3', name: '수습계약서', kind: '근로', used: 0, tone: 'muted', sample: true },
  { id: 'tpl-4', name: '보안서약서 (NDA)', kind: '특약', used: 0, tone: 'accent', sample: true },
  { id: 'tpl-5', name: '지적재산동의서', kind: '특약', used: 0, tone: 'accent', sample: true },
  { id: 'tpl-6', name: '원격의료기관 계약', kind: '기타', used: 0, tone: 'muted', sample: true },
];

const WIZARD_STEPS: Array<{ idx: number; title: string; desc: string; state: 'done' | 'on' | 'pending' }> = [
  { idx: 1, title: '템플릿 선택', desc: '근로계약서·NDA·특약 등 사전 정의된 양식', state: 'done' },
  { idx: 2, title: '직원 데이터 자동 채움', desc: '이름·주민번호·입사일·직급 — 구성원 DB에서 로드', state: 'done' },
  { idx: 3, title: '미리보기 · 수정', desc: '근무조건·임금·출퇴근 시간 확인', state: 'on' },
  { idx: 4, title: '전자서명 요청', desc: '대표자 + 해당 직원에게 동시 전송', state: 'pending' },
  { idx: 5, title: '문서보관함 자동 저장', desc: 'PDF + 메타데이터 자동 입력', state: 'pending' },
];

function inferTone(kind: string): TemplateData['tone'] {
  if (kind.includes('근로')) return 'success';
  if (kind.includes('특약') || kind.includes('보안') || kind.includes('동의')) return 'accent';
  return 'muted';
}

export default function DocsGenSummary() {
  const [templates, setTemplates] = useState<TemplateData[]>(FALLBACK_TEMPLATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        // contract_templates 실컬럼은 id/company_name/template_content/seal_url/
        // created_at/updated_at 6개뿐이다. 예전 셀렉트의 name/kind/used_count 는 전부
        // 부재 컬럼이라 SQLite 관용 동작으로 값 없는 키만 돌아왔고, 결과적으로 회사별
        // 템플릿이 있어도 이름 '계약서'·종류 '기타'로만 찍히거나 폴백 예시가 남았다.
        const { data, error } = await db
          .from('contract_templates')
          .select('id, company_name, updated_at')
          .order('updated_at', { ascending: false })
          .limit(6);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        if (list.length > 0) {
          setTemplates(
            list.map((r) => ({
              id: String(r.id ?? ''),
              // 템플릿 이름 컬럼이 없다 — 회사별 1건 구조이므로 회사명으로 식별한다.
              name: `${String(r.company_name ?? '회사 미지정')} 계약서 양식`,
              kind: '근로',
              used: 0,
              tone: inferTone('근로') })),
          );
        }
      } catch (error) {
        // JM3: 폴백으로 정적 데이터 유지, 로그만
        console.warn('[DocsGenSummary] template fetch failed, using fallback', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const stepCls = (state: 'done' | 'on' | 'pending'): string => {
    if (state === 'done') return 'bg-emerald-500 text-white';
    if (state === 'on') return 'bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/30';
    return 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-gen-tpl-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="docs-gen-tpl-title" className="text-[13px] font-bold text-[var(--foreground)]">
            계약서 템플릿
          </h3>
          {!loading && (
            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
              {templates.some((t) => t.sample) ? '등록된 양식 없음 · 예시' : '최근 수정순'}
            </span>
          )}
        </header>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2">
              <span className="text-[12px] font-bold text-[var(--foreground)]">{tpl.name}</span>
              <div className="flex items-center justify-between text-[10.5px]">
                <span className={`rounded-full px-2 py-0.5 font-bold ${TONE_CLS[tpl.tone]}`}>{tpl.kind}</span>
                {/* 실데이터가 아닌 예시는 반드시 그렇게 말한다 — 예전에는 하드코딩 사용횟수를
                    실통계처럼 보여줘 재고·계약 판단을 잘못 유도했다. */}
                {tpl.sample && <span className="text-[var(--toss-gray-4)]">예시</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-gen-flow-title">
        <header className="mb-2 flex items-center justify-between">
          <h3 id="docs-gen-flow-title" className="text-[13px] font-bold text-[var(--foreground)]">
            계약서 생성 흐름
          </h3>
        </header>
        <ol className="flex flex-col gap-2">
          {WIZARD_STEPS.map((step) => (
            <li key={step.idx} className="flex items-start gap-2" aria-current={step.state === 'on' ? 'step' : undefined}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${stepCls(step.state)}`} aria-hidden="true">
                {step.state === 'done' ? '✓' : step.idx}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-[var(--foreground)]">{`${step.idx}. ${step.title}`}</div>
                <div className="text-[11px] text-[var(--toss-gray-4)]">{step.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
