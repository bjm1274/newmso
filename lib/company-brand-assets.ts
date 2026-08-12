/**
 * 회사 로고/직인 저장 헬퍼.
 * - companies.logo_url / companies.seal_url
 * - 직인은 증명서·계약서가 참조하는 contract_templates.seal_url 에도 동기화
 */

import { db } from '@/lib/db-client';
import { DEFAULT_CONTRACT_TEMPLATE } from '@/lib/contract-template-defaults';
import { rewritePublicR2UrlToInternal } from '@/lib/object-storage-url';

/**
 * 로고·직인 URL 을 화면에 걸 수 있는 형태로 바꾼다.
 *
 * DB 에는 `https://r2.pchos.kr/logos/...` 처럼 **공개 R2 도메인**이 저장돼 있다.
 * 그런데 그 버킷은 공개로 열려 있지 않아서 `<img src>` 가 401/403 을 받고
 * 그냥 깨진 이미지가 된다 — 증명서·계약서의 직인이 안 보이던 것이 이것이다.
 *
 * 내부 프록시(/api/storage/object)는 R2 바인딩으로 직접 읽으므로 버킷 공개
 * 여부와 무관하다. `logos/`·`seals/` 프리픽스는 ACL 에서 public 이라
 * 세션이 없어도 뜬다 — 인쇄창·PDF 처럼 쿠키가 안 실리는 곳에서도 보인다.
 */
export function resolveBrandAssetSrc(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  return rewritePublicR2UrlToInternal(raw) || raw;
}

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
  try {
    const { data: existing, error: selectError } = await db
      .from('contract_templates')
      .select('company_name')
      .eq('company_name', companyName)
      .maybeSingle();
    if (selectError) {
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
  } catch (syncErr) {
    console.warn('[company-brand] contract_templates sync caught error:', syncErr);
  }
}

/** 증명서/계약 직인 조회: contract_templates 우선 → companies.seal_url → '전체' 템플릿 3단계 폴백 */
export async function resolveCompanySealUrl(companyName: string): Promise<string | null> {
  const name = companyName.trim();
  if (!name) return null;
  try {
    const [tmplRes, companyRes, globalRes] = await Promise.all([
      db.from('contract_templates').select('seal_url').eq('company_name', name).limit(1),
      db.from('companies').select('seal_url').eq('name', name).limit(1),
      db.from('contract_templates').select('seal_url').eq('company_name', '전체').limit(1),
    ]);
    // 어느 폴백을 타든 화면에 걸 수 있는 형태로 돌려준다.
    const tmpl = tmplRes.data?.[0] as { seal_url?: string | null } | undefined;
    if (tmpl?.seal_url) return resolveBrandAssetSrc(tmpl.seal_url);
    const co = companyRes.data?.[0] as { seal_url?: string | null } | undefined;
    if (co?.seal_url) return resolveBrandAssetSrc(co.seal_url);
    const gTmpl = globalRes.data?.[0] as { seal_url?: string | null } | undefined;
    if (gTmpl?.seal_url) return resolveBrandAssetSrc(gTmpl.seal_url);
  } catch (err) {
    console.warn('[company-brand] resolveCompanySealUrl failed', err);
  }
  return null;
}
