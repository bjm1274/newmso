'use client';
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  CONTRACT_TEMPLATE_VARIABLES as VARIABLES,
  DEFAULT_CONTRACT_TEMPLATE as DEFAULT_TEMPLATE,
  upgradeLegacyContractTemplate,
} from '@/lib/contract-template-defaults';

const CATEGORY_COLORS: Record<string, string> = {
  근로자: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  사업자: 'bg-violet-50 text-violet-700 border-violet-200',
  계약: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  임금: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  근무: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

interface TemplateEditorProps {
  selectedCo?: string;
}

export default function ContractTemplateEditor({ selectedCo }: TemplateEditorProps) {
  const [companies, setCompanies] = useState<string[]>([]);
  const [targetCompany, setTargetCompany] = useState<string>('전체');
  const [templateContent, setTemplateContent] = useState('');
  const [sealUrl, setSealUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeVarCategory, setActiveVarCategory] = useState<string>('전체');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.from('companies').select('name').then(({ data }) => {
      if (data) setCompanies(['전체', ...data.map((c: any) => c.name)]);
    });
  }, []);

  useEffect(() => {
    if (selectedCo && selectedCo !== '전체') setTargetCompany(selectedCo);
  }, [selectedCo]);

  useEffect(() => { loadTemplate(); }, [targetCompany]);

  const loadTemplate = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contract_templates')
      .select('template_content, seal_url')
      .eq('company_name', targetCompany)
      .maybeSingle();
    if (data?.template_content) {
      setTemplateContent(upgradeLegacyContractTemplate(data.template_content));
      setSealUrl(data.seal_url || '');
    } else {
      setTemplateContent(DEFAULT_TEMPLATE);
      setSealUrl('');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const normalizedTemplateContent = upgradeLegacyContractTemplate(templateContent);
    setTemplateContent(normalizedTemplateContent);
    const { error } = await supabase
      .from('contract_templates')
      .upsert(
        { company_name: targetCompany, template_content: normalizedTemplateContent, seal_url: sealUrl, updated_at: new Date().toISOString() },
        { onConflict: 'company_name' }
      );
    if (error) toast('저장에 실패했습니다: ' + error.message, 'error');
    else toast(`'${targetCompany}' 계약서 양식이 저장되었습니다.`, 'success');
    setSaving(false);
  };

  const insertVariable = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = templateContent.slice(0, start);
    const after = templateContent.slice(end);
    const updated = before + varKey + after;
    setTemplateContent(updated);
    // 커서를 변수 끝으로 이동
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varKey.length, start + varKey.length);
    }, 0);
  };

  const categories = ['전체', ...Array.from(new Set(VARIABLES.map(v => v.category)))];
  const filteredVars = activeVarCategory === '전체' ? VARIABLES : VARIABLES.filter(v => v.category === activeVarCategory);

  // 에디터에서 {{변수}} 를 하이라이트 표시하기 위해 미리보기 생성
  // XSS 방지: HTML 특수문자를 먼저 이스케이프 후 변수만 하이라이트
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const highlightedPreview = escapeHtml(templateContent).replace(
    /\{\{([^}]+)\}\}/g,
    (_, key) => `<mark class="bg-blue-500/20 text-blue-800 px-0.5 rounded text-[11px] font-semibold not-italic">{{${key}}}</mark>`
  );

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 툴바 */}
      <div className="px-4 py-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">양식 대상</span>
          <select
            value={targetCompany}
            onChange={e => setTargetCompany(e.target.value)}
            className="px-3 py-1.5 bg-[var(--muted)] rounded-lg text-xs font-bold outline-none border border-[var(--border)] appearance-none"
          >
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">직인 이미지 URL</span>
          <input
            type="text"
            value={sealUrl}
            onChange={e => setSealUrl(e.target.value)}
            placeholder="https://... (선택사항)"
            className="w-52 px-3 py-1.5 bg-[var(--muted)] rounded-lg text-xs outline-none border border-[var(--border)]"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadTemplate}
            className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] bg-[var(--muted)] border border-[var(--border)] rounded-lg hover:bg-[var(--tab-bg)] transition-colors"
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-[11px] font-bold bg-[var(--foreground)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* 좌측: 에디터 패널 */}
        <div className="w-1/2 flex flex-col border-r border-[var(--border)] min-h-0">
          {/* 에디터 상단: 변수 삽입 팔레트 */}
          <div className="p-3 bg-[var(--tab-bg)]/60 border-b border-[var(--border)] space-y-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-[var(--toss-gray-4)] uppercase tracking-wider">변수 삽입</span>
              <div className="flex gap-1 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveVarCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${activeVarCategory === cat ? 'bg-[var(--foreground)] text-white' : 'bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)] border border-[var(--border)]'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
              {filteredVars.map(v => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  title={v.desc}
                  className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold hover:opacity-80 transition-all ${CATEGORY_COLORS[v.category] || 'bg-[var(--muted)] text-gray-700 border-gray-200'}`}
                >
                  {v.key} <span className="opacity-60 font-sans not-italic">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* textarea */}
          <div className="flex-1 relative min-h-0">
            {loading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="w-6 h-6 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={templateContent}
              onChange={e => setTemplateContent(e.target.value)}
              className="w-full h-full resize-none p-4 font-mono text-[12px] leading-[1.8] bg-[#1e1e2e] text-[#cdd6f4] outline-none custom-scrollbar"
              placeholder="계약서 본문을 입력하세요..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* 우측: 미리보기 */}
        <div className="w-1/2 flex flex-col min-h-0 bg-[var(--page-bg)]">
          <div className="px-4 py-2.5 bg-[var(--card)] border-b border-[var(--border)] shrink-0 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">미리보기 — <span className="text-[var(--accent)]">파란색 태그</span>가 실제 데이터로 치환됩니다</span>
            <span className="text-[10px] text-[var(--toss-gray-3)] font-medium">{templateContent.length.toLocaleString()}자</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            <div className="bg-white shadow-md border border-slate-200 rounded-sm min-h-[900px] p-[48px] max-w-[680px] mx-auto">
              {/* 제목 */}
              <div className="text-center mb-6 pb-4 border-b-2 border-slate-800">
                <h1 className="text-[22px] font-black tracking-[0.25em]" style={{ fontFamily: '"Noto Serif KR", Georgia, serif' }}>
                  근 로 계 약 서
                </h1>
                <p className="text-[11px] text-slate-400 mt-1 font-medium">{targetCompany === '전체' ? '기본 양식' : targetCompany}</p>
              </div>

              {/* 미리보기 본문 */}
              <div
                className="text-[12.5px] leading-[1.95] text-slate-700 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: highlightedPreview }}
              />

              {/* 서명란 예시 */}
              <div className="mt-7 pt-4 border-t border-slate-200">
                <p className="text-center text-[11px] text-slate-500 font-semibold mb-5">
                  상기 근로계약의 내용을 충분히 이해하고 이에 동의하여 본 계약을 체결합니다.
                </p>
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest">사 용 자</p>
                    <p className="text-[13px] font-bold text-slate-700">{targetCompany === '전체' ? '회사명' : targetCompany}</p>
                    <p className="text-[13px] font-bold text-slate-700">대표이사 ___________  (인)</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest">근 로 자</p>
                    <p className="text-[13px] font-bold text-slate-700">성명 ___________  (서명)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
