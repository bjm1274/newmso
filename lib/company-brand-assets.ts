/**
 * 회사 로고/직인 저장 헬퍼.
 * - companies.logo_url / companies.seal_url
 * - 직인은 증명서·계약서가 참조하는 contract_templates.seal_url 에도 동기화
 */

import { db } from '@/lib/db-client';
import { DEFAULT_CONTRACT_TEMPLATE } from '@/lib/contract-template-defaults';

export async function uploadBrandAssetFile(params: {
  file: File;
  companyName: string;
  kind: 'logo' | 'seal';
}): Promise<{ url: string }> {
  const endpoint = params.kind === 'logo' ? '/api/admin/logo/upload' : '/api/admin/seal/upload';
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('company', params.companyName);
  const res = await fetch(endpoint, { method: 'POST', body: formData });
  const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.error || `${params.kind === 'logo' ? '로고' : '직인'} 업로드에 실패했습니다.`);
  }
  return { url: String(payload.url) };
}

export async function saveCompanyLogo(params: {
  companyId: string;
  logoUrl: string | null;
}): Promise<void> {
  const { error } = await db
    .from('companies')
    .update({ logo_url: params.logoUrl })
    .eq('id', params.companyId);
  if (error) throw new Error(error.message || '로고 저장에 실패했습니다.');
}

export async function saveCompanySeal(params: {
  companyId: string;
  companyName: string;
  sealUrl: string | null;
}): Promise<void> {
  const companyName = params.companyName.trim();
  if (!companyName) throw new Error('회사명이 없습니다.');

  const { error: companyError } = await db
    .from('companies')
    .update({ seal_url: params.sealUrl })
    .eq('id', params.companyId);
  if (companyError) throw new Error(companyError.message || '직인 저장에 실패했습니다.');

  // 계약서/증명서가 읽는 contract_templates.seal_url 동기화
  const { data: existing, error: selectError } = await db
    .from('contract_templates')
    .select('company_name')
    .eq('company_name', companyName)
    .maybeSingle();
  if (selectError) {
    // 테이블 미존재 등은 로그만 — companies.seal_url 은 이미 저장됨
    console.warn('[company-brand] contract_templates select failed', selectError);
    return;
  }

  if (existing) {
    const { error } = await db
      .from('contract_templates')
      .update({
        seal_url: params.sealUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('company_name', companyName);
    if (error) console.warn('[company-brand] contract_templates seal update failed', error);
    return;
  }

  const { error: insertError } = await db.from('contract_templates').insert({
    company_name: companyName,
    template_content: DEFAULT_CONTRACT_TEMPLATE,
    seal_url: params.sealUrl,
    updated_at: new Date().toISOString(),
  });
  if (insertError) console.warn('[company-brand] contract_templates seal insert failed', insertError);
}

/** 증명서/계약 직인 조회: contract_templates 우선, companies.seal_url 폴백 */
export async function resolveCompanySealUrl(companyName: string): Promise<string | null> {
  const name = companyName.trim();
  if (!name) return null;
  try {
    const [tmplRes, companyRes] = await Promise.all([
      db.from('contract_templates').select('seal_url').eq('company_name', name).limit(1),
      db.from('companies').select('seal_url').eq('name', name).limit(1),
    ]);
    const tmpl = tmplRes.data?.[0] as { seal_url?: string | null } | undefined;
    if (tmpl?.seal_url) return String(tmpl.seal_url);
    const co = companyRes.data?.[0] as { seal_url?: string | null } | undefined;
    if (co?.seal_url) return String(co.seal_url);
  } catch (err) {
    console.warn('[company-brand] resolveCompanySealUrl failed', err);
  }
  return null;
}
