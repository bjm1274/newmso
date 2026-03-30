'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { useActionDialog } from '@/app/components/useActionDialog';

type FolderRow = {
  id: string;
  name: string;
  company_id?: string | null;
  company_name?: string | null;
};

type DocumentRow = {
  id: string;
  folder_id: string;
  title: string;
  summary?: string | null;
  content: string;
  tags?: string[] | null;
  editor_ids?: string[] | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type Props = {
  user?: Record<string, unknown> | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
};

function isMissingWikiSchema(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '').trim();
  const message = `${String((error as { message?: string } | null)?.message || '')} ${String((error as { details?: string } | null)?.details || '')}`.toLowerCase();
  return code === '42P01' || message.includes('wiki_folders') || message.includes('wiki_documents');
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function formatDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function WikiDashboard({ user: initialUser, selectedCo, selectedCompanyId }: Props) {
  const normalizedUser = useMemo(() => normalizeStaffLike((initialUser ?? {}) as Record<string, unknown>), [initialUser]);
  const [user, setUser] = useState<Record<string, unknown>>(normalizedUser);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [dirty, setDirty] = useState(false);
  const { dialog, openConfirm, openPrompt } = useActionDialog();

  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      const directId = getStaffLikeId(normalizedUser);
      if (directId) {
        if (!cancelled) setUser(normalizedUser);
        return;
      }
      const resolved = await resolveStaffLike(normalizedUser);
      if (!cancelled && resolved) setUser((resolved ?? {}) as Record<string, unknown>);
    };
    void recover();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser]);

  const effectiveUserId = getStaffLikeId(user);
  const userPermissions = (user?.permissions as Record<string, unknown> | null | undefined) || null;
  const isMsoUser = user?.company === 'SY INC.' || userPermissions?.mso === true;
  const scopeCompanyId = isMsoUser ? String(selectedCompanyId || '').trim() || null : String(user?.company_id || '').trim() || null;
  const scopeCompanyName = isMsoUser
    ? (() => {
        const companyName = String(selectedCo || '').trim();
        return companyName && companyName !== '전체' ? companyName : null;
      })()
    : String(user?.company || '').trim() || null;

  const refreshWiki = useCallback(async () => {
    try {
      setLoading(true);
      let folderQuery = supabase.from('wiki_folders').select('*').eq('is_archived', false).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (scopeCompanyId) folderQuery = folderQuery.or(`company_id.is.null,company_id.eq.${scopeCompanyId}`);
      else if (scopeCompanyName) folderQuery = folderQuery.or(`company_id.is.null,company_name.eq.${scopeCompanyName}`);

      const { data: folderRows, error: folderError } = await folderQuery;
      if (folderError) throw folderError;
      const nextFolders = (folderRows || []) as FolderRow[];
      const folderIds = nextFolders.map((folder) => folder.id);
      let nextDocuments: DocumentRow[] = [];
      if (folderIds.length > 0) {
        const { data: documentRows, error: documentError } = await supabase
          .from('wiki_documents')
          .select('*')
          .eq('is_archived', false)
          .in('folder_id', folderIds)
          .order('updated_at', { ascending: false });
        if (documentError) throw documentError;
        nextDocuments = (documentRows || []) as DocumentRow[];
      }
      setSchemaReady(true);
      setFolders(nextFolders);
      setDocuments(nextDocuments);
    } catch (error) {
      if (isMissingWikiSchema(error)) {
        setSchemaReady(false);
        setFolders([]);
        setDocuments([]);
        return;
      }
      console.error('wiki load failed:', error);
      toast('사내위키를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [scopeCompanyId, scopeCompanyName]);

  useEffect(() => {
    void refreshWiki();
  }, [refreshWiki]);

  useEffect(() => {
    if (!schemaReady) return;
    const channel = supabase
      .channel(`wiki-${scopeCompanyId || scopeCompanyName || 'shared'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wiki_folders' }, () => { void refreshWiki(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wiki_documents' }, () => { void refreshWiki(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshWiki, schemaReady, scopeCompanyId, scopeCompanyName]);

  const docsByFolder = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    documents.forEach((document) => {
      const current = map.get(document.folder_id) || [];
      current.push(document);
      map.set(document.folder_id, current);
    });
    return map;
  }, [documents]);

  const filteredFolders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return folders
      .map((folder) => {
        const rows = docsByFolder.get(folder.id) || [];
        const filtered = keyword
          ? rows.filter((document) =>
              [folder.name, document.title, document.summary, document.content, ...(document.tags || [])]
                .map((value) => String(value || '').toLowerCase())
                .join(' ')
                .includes(keyword)
            )
          : rows;
        return keyword && filtered.length === 0 && !folder.name.toLowerCase().includes(keyword)
          ? null
          : { folder, documents: filtered };
      })
      .filter(Boolean) as Array<{ folder: FolderRow; documents: DocumentRow[] }>;
  }, [docsByFolder, folders, search]);

  useEffect(() => {
    if (!selectedDocId || !documents.some((document) => document.id === selectedDocId)) {
      setSelectedDocId(filteredFolders[0]?.documents[0]?.id || documents[0]?.id || null);
    }
    if (!selectedFolderId || !folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(filteredFolders[0]?.folder.id || folders[0]?.id || null);
    }
  }, [documents, filteredFolders, folders, selectedDocId, selectedFolderId]);

  const selectedDocument = useMemo(() => documents.find((document) => document.id === selectedDocId) || null, [documents, selectedDocId]);
  const selectedFolder = useMemo(() => folders.find((folder) => folder.id === (selectedDocument?.folder_id || selectedFolderId)) || null, [folders, selectedDocument?.folder_id, selectedFolderId]);

  useEffect(() => {
    if (!selectedDocument) {
      setTitle('');
      setSummary('');
      setContent('');
      setTags('');
      setDirty(false);
      return;
    }
    setSelectedFolderId(selectedDocument.folder_id);
    setTitle(selectedDocument.title || '');
    setSummary(selectedDocument.summary || '');
    setContent(selectedDocument.content || '');
    setTags(Array.isArray(selectedDocument.tags) ? selectedDocument.tags.join(', ') : '');
    setDirty(false);
  }, [selectedDocument?.id, selectedDocument?.updated_at]);

  const createFolder = useCallback(async () => {
    const name = await openPrompt({ title: '새 폴더', description: '사내위키 폴더 이름을 입력해 주세요.', confirmText: '생성', cancelText: '취소', required: true, placeholder: '폴더 이름' });
    if (!name?.trim()) return;
    const { data, error } = await supabase.from('wiki_folders').insert({
      name: name.trim(),
      company_id: scopeCompanyId,
      company_name: scopeCompanyName || '전체',
      sort_order: folders.length,
      created_by: effectiveUserId || null,
      updated_by: effectiveUserId || null,
    }).select().single();
    if (error) return void toast('폴더를 만들지 못했습니다.', 'error');
    setSelectedFolderId((data as FolderRow).id);
    toast('폴더를 만들었습니다.', 'success');
    void refreshWiki();
  }, [effectiveUserId, folders.length, openPrompt, refreshWiki, scopeCompanyId, scopeCompanyName]);

  const createDocument = useCallback(async (folderId?: string | null) => {
    const nextFolderId = folderId || selectedFolderId;
    if (!nextFolderId) return void toast('먼저 폴더를 선택해 주세요.', 'warning');
    const name = await openPrompt({ title: '새 문서', description: '문서 제목을 입력해 주세요.', confirmText: '생성', cancelText: '취소', required: true, placeholder: '문서 제목' });
    if (!name?.trim()) return;
    const folder = folders.find((item) => item.id === nextFolderId) || null;
    const { data, error } = await supabase.from('wiki_documents').insert({
      folder_id: nextFolderId,
      company_id: folder?.company_id ?? scopeCompanyId,
      company_name: folder?.company_name ?? scopeCompanyName ?? '전체',
      title: name.trim(),
      summary: null,
      content: '',
      tags: [],
      editor_ids: effectiveUserId ? [effectiveUserId] : [],
      created_by: effectiveUserId || null,
      updated_by: effectiveUserId || null,
    }).select().single();
    if (error) return void toast('문서를 만들지 못했습니다.', 'error');
    setSelectedDocId((data as DocumentRow).id);
    setSelectedFolderId(nextFolderId);
    toast('문서를 만들었습니다.', 'success');
    void refreshWiki();
  }, [effectiveUserId, folders, openPrompt, refreshWiki, scopeCompanyId, scopeCompanyName, selectedFolderId]);

  const deleteFolder = useCallback(async (folder: FolderRow) => {
    const confirmed = await openConfirm({ title: '폴더 삭제', description: `문서 ${(docsByFolder.get(folder.id) || []).length}건도 함께 삭제됩니다.`, confirmText: '삭제', cancelText: '취소', tone: 'danger' });
    if (!confirmed) return;
    const { error } = await supabase.from('wiki_folders').delete().eq('id', folder.id);
    if (error) return void toast('폴더를 삭제하지 못했습니다.', 'error');
    toast('폴더를 삭제했습니다.', 'success');
    if (selectedFolderId === folder.id) setSelectedFolderId(null);
    if (selectedDocument?.folder_id === folder.id) setSelectedDocId(null);
    void refreshWiki();
  }, [docsByFolder, openConfirm, refreshWiki, selectedDocument?.folder_id, selectedFolderId]);

  const deleteDocument = useCallback(async (document: DocumentRow) => {
    const confirmed = await openConfirm({ title: '문서 삭제', description: '삭제 후 바로 복구되지는 않습니다.', confirmText: '삭제', cancelText: '취소', tone: 'danger' });
    if (!confirmed) return;
    const { error } = await supabase.from('wiki_documents').delete().eq('id', document.id);
    if (error) return void toast('문서를 삭제하지 못했습니다.', 'error');
    toast('문서를 삭제했습니다.', 'success');
    if (selectedDocId === document.id) setSelectedDocId(null);
    void refreshWiki();
  }, [openConfirm, refreshWiki, selectedDocId]);

  const saveDocument = useCallback(async () => {
    if (!selectedDocument) return;
    if (!title.trim()) return void toast('문서 제목을 입력해 주세요.', 'warning');
    try {
      setSaving(true);
      const editorIds = Array.from(new Set([...(selectedDocument.editor_ids || []), ...(effectiveUserId ? [effectiveUserId] : [])].filter(Boolean)));
      const { data, error } = await supabase.from('wiki_documents').update({
        title: title.trim(),
        summary: summary.trim() || null,
        content,
        tags: parseTags(tags),
        editor_ids: editorIds,
        updated_by: effectiveUserId || null,
      }).eq('id', selectedDocument.id).select().single();
      if (error) throw error;
      const next = data as DocumentRow;
      setDocuments((prev) => prev.map((document) => document.id === next.id ? next : document));
      setSelectedDocId(next.id);
      setDirty(false);
      toast('문서를 저장했습니다.', 'success');
    } catch (error) {
      console.error('wiki save failed:', error);
      toast('문서를 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [content, effectiveUserId, selectedDocument, summary, tags, title]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-sm md:flex-row">
      {dialog}
      <aside className="flex w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--tab-bg)]/35 md:w-[320px] md:border-b-0 md:border-r">
        <div className="space-y-3 border-b border-[var(--border)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Company Wiki</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">사내위키</h2>
            </div>
            <button type="button" onClick={() => void createFolder()} className="rounded-[14px] bg-[var(--foreground)] px-3 py-2 text-[11px] font-bold text-white">+ 폴더</button>
          </div>
          <div className="flex gap-2">
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="문서 검색" className="h-11 flex-1 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
            <button type="button" onClick={() => void createDocument()} className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[11px] font-bold text-[var(--accent)]">+ 문서</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
          {!schemaReady ? (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-[12px] font-semibold text-amber-700">`20260330_wiki_todo_foundation.sql` 적용이 필요합니다.</div>
          ) : loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" /></div>
          ) : filteredFolders.length > 0 ? (
            filteredFolders.map(({ folder, documents: folderDocs }) => (
              <section key={folder.id} className={`rounded-[18px] border p-2 ${selectedFolder?.id === folder.id ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelectedFolderId(folder.id)} className="min-w-0 flex-1 rounded-[12px] px-2 py-2 text-left hover:bg-[var(--muted)]">
                    <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{folder.name}</p>
                    <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">{folderDocs.length}개 문서</p>
                  </button>
                  <button type="button" onClick={() => void createDocument(folder.id)} className="rounded-[10px] px-2 py-1 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]">+ 문서</button>
                </div>
                <div className="mt-2 space-y-1 border-l border-[var(--border)] pl-3">
                  {folderDocs.length > 0 ? folderDocs.map((document) => (
                    <div key={document.id} className="flex items-center gap-2">
                      <button type="button" onClick={() => { setSelectedFolderId(folder.id); setSelectedDocId(document.id); }} className={`min-w-0 flex-1 rounded-[12px] px-3 py-2 text-left ${selectedDocId === document.id ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--muted)]'}`}>
                        <p className={`truncate text-[12px] font-bold ${selectedDocId === document.id ? 'text-white' : 'text-[var(--foreground)]'}`}>{document.title}</p>
                        <p className={`mt-1 truncate text-[11px] font-medium ${selectedDocId === document.id ? 'text-white/80' : 'text-[var(--toss-gray-3)]'}`}>{document.summary || '요약 없음'}</p>
                      </button>
                      <button type="button" onClick={() => void deleteDocument(document)} className="rounded-[10px] px-2 py-1 text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-red-50 hover:text-red-600">삭제</button>
                    </div>
                  )) : <button type="button" onClick={() => void createDocument(folder.id)} className="w-full rounded-[12px] border border-dashed border-[var(--border)] px-3 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">첫 문서 만들기</button>}
                </div>
                <button type="button" onClick={() => void deleteFolder(folder)} className="mt-2 rounded-[10px] px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50">폴더 삭제</button>
              </section>
            ))
          ) : (
            <div className="rounded-[20px] border-2 border-dashed border-[var(--border)] px-4 py-10 text-center text-[12px] font-medium text-[var(--toss-gray-3)]">폴더와 문서를 만들어 위키를 시작해 보세요.</div>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 flex-1 flex-col bg-[var(--card)]">
        {schemaReady && selectedDocument ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{selectedFolder?.name || '문서'}</p>
                <h3 className="mt-1 text-xl font-bold text-[var(--foreground)]">{selectedDocument.title}</h3>
                <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">마지막 수정 {formatDate(selectedDocument.updated_at || selectedDocument.created_at) || '방금'}</p>
              </div>
              <button type="button" onClick={() => void saveDocument()} disabled={saving || !dirty} className="rounded-[14px] bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">{saving ? '저장중...' : dirty ? '저장' : '저장됨'}</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                <input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} placeholder="문서 제목" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[16px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                <input value={summary} onChange={(event) => { setSummary(event.target.value); setDirty(true); }} placeholder="한 줄 요약" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[13px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                <input value={tags} onChange={(event) => { setTags(event.target.value); setDirty(true); }} placeholder="태그를 쉼표로 구분해 입력" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[13px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                <textarea value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} placeholder="# 제목&#10;&#10;- 절차&#10;- 참고사항" className="min-h-[420px] rounded-[22px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-4 text-[14px] font-medium leading-7 text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--muted)]/60 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {parseTags(tags).map((tag) => <span key={tag} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">#{tag}</span>)}
                    {parseTags(tags).length === 0 ? <span className="text-[11px] font-medium text-[var(--toss-gray-3)]">태그를 넣으면 검색이 쉬워집니다.</span> : null}
                  </div>
                  <button type="button" onClick={() => void deleteDocument(selectedDocument)} className="rounded-[12px] px-3 py-2 text-[11px] font-bold text-red-500 hover:bg-red-50">문서 삭제</button>
                </div>
              </div>
            </div>
          </>
        ) : schemaReady ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="rounded-full bg-[var(--toss-blue-light)] p-4 text-3xl">📚</div>
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">문서를 선택해 주세요.</h3>
              <p className="mt-2 text-[13px] font-medium text-[var(--toss-gray-3)]">운영 매뉴얼, 온보딩 자료, 팀 지식을 문서로 남길 수 있습니다.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void createFolder()} className="rounded-[14px] border border-[var(--border)] px-4 py-2 text-[12px] font-bold text-[var(--foreground)]">폴더 만들기</button>
              <button type="button" onClick={() => void createDocument(selectedFolderId)} className="rounded-[14px] bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white">문서 만들기</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] font-medium text-amber-700">위키 테이블이 아직 없어 `20260330_wiki_todo_foundation.sql` 적용이 필요합니다.</div>
        )}
      </section>
    </div>
  );
}
