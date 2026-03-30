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
  company_id?: string | null;
  company_name?: string | null;
  title: string;
  summary?: string | null;
  content: string;
  tags?: string[] | null;
  editor_ids?: string[] | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type VersionRow = {
  id: string;
  document_id: string;
  version_no: number;
  title: string;
  summary?: string | null;
  content: string;
  tags?: string[] | null;
  editor_ids?: string[] | null;
  change_summary?: string | null;
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

function isMissingVersionSchema(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '').trim();
  const message = `${String((error as { message?: string } | null)?.message || '')} ${String((error as { details?: string } | null)?.details || '')}`.toLowerCase();
  return code === '42P01' || message.includes('wiki_document_versions');
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function formatDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildDiffSummary(currentValue: string, targetValue: string) {
  const currentText = String(currentValue || '');
  const targetText = String(targetValue || '');
  const currentLines = currentText.split(/\r?\n/);
  const targetLines = targetText.split(/\r?\n/);
  const currentSet = new Set(currentLines.filter(Boolean));
  const targetSet = new Set(targetLines.filter(Boolean));
  const onlyCurrent = currentLines.filter((line) => line && !targetSet.has(line)).length;
  const onlyTarget = targetLines.filter((line) => line && !currentSet.has(line)).length;

  return {
    changed: currentText !== targetText,
    currentLength: currentText.length,
    targetLength: targetText.length,
    currentLines: currentLines.filter(Boolean).length,
    targetLines: targetLines.filter(Boolean).length,
    onlyCurrent,
    onlyTarget,
  };
}

function formatPreviewText(value: string) {
  return String(value || '').trim() || '(empty)';
}

export default function WikiDashboard({ user: initialUser, selectedCo, selectedCompanyId }: Props) {
  const normalizedUser = useMemo(
    () => normalizeStaffLike((initialUser ?? {}) as Record<string, unknown>),
    [initialUser]
  );
  const [user, setUser] = useState<Record<string, unknown>>(normalizedUser);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [versionSchemaReady, setVersionSchemaReady] = useState(true);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
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
  const permissions = (user?.permissions as Record<string, unknown> | null | undefined) || null;
  const isMsoUser = user?.company === 'SY INC.' || permissions?.mso === true;
  const scopeCompanyId = isMsoUser
    ? String(selectedCompanyId || '').trim() || null
    : String(user?.company_id || '').trim() || null;
  const scopeCompanyName = isMsoUser
    ? (() => {
        const name = String(selectedCo || '').trim();
        return name && name !== '전체' ? name : null;
      })()
    : String(user?.company || '').trim() || null;

  const refreshWiki = useCallback(async () => {
    try {
      setLoading(true);
      let folderQuery = supabase
        .from('wiki_folders')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
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
      toast('Wiki load failed.', 'error');
    } finally {
      setLoading(false);
    }
  }, [scopeCompanyId, scopeCompanyName]);

  const loadVersions = useCallback(async (documentId: string | null) => {
    if (!documentId) {
      setVersions([]);
      return;
    }

    try {
      setLoadingVersions(true);
      const { data, error } = await supabase
        .from('wiki_document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_no', { ascending: false })
        .limit(20);
      if (error) throw error;
      setVersionSchemaReady(true);
      setVersions((data || []) as VersionRow[]);
    } catch (error) {
      if (isMissingVersionSchema(error)) {
        setVersionSchemaReady(false);
        setVersions([]);
        return;
      }
      console.error('wiki version load failed:', error);
      toast('Version history load failed.', 'error');
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    void refreshWiki();
  }, [refreshWiki]);

  const docsByFolder = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    documents.forEach((document) => {
      map.set(document.folder_id, [...(map.get(document.folder_id) || []), document]);
    });
    return map;
  }, [documents]);

  const filteredFolders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return folders
      .map((folder) => {
        const folderDocs = docsByFolder.get(folder.id) || [];
        if (!keyword || folder.name.toLowerCase().includes(keyword)) {
          return { folder, documents: folderDocs };
        }
        const filtered = folderDocs.filter((document) =>
          [document.title, document.summary, document.content, ...(document.tags || [])]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
        );
        return filtered.length > 0 ? { folder, documents: filtered } : null;
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

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocId) || null,
    [documents, selectedDocId]
  );
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === (selectedDocument?.folder_id || selectedFolderId)) || null,
    [folders, selectedDocument?.folder_id, selectedFolderId]
  );
  const compareVersion = useMemo(
    () => versions.find((version) => version.id === compareVersionId) || null,
    [compareVersionId, versions]
  );
  const titleDiff = useMemo(
    () => buildDiffSummary(title, compareVersion?.title || ''),
    [compareVersion?.title, title]
  );
  const summaryDiff = useMemo(
    () => buildDiffSummary(summary, compareVersion?.summary || ''),
    [compareVersion?.summary, summary]
  );
  const tagDiff = useMemo(
    () => buildDiffSummary(tags, Array.isArray(compareVersion?.tags) ? compareVersion.tags.join(', ') : ''),
    [compareVersion?.tags, tags]
  );
  const contentDiff = useMemo(
    () => buildDiffSummary(content, compareVersion?.content || ''),
    [compareVersion?.content, content]
  );

  useEffect(() => {
    if (!selectedDocument) {
      setTitle('');
      setSummary('');
      setContent('');
      setTags('');
      setDirty(false);
      setVersions([]);
      setCompareVersionId(null);
      return;
    }
    setTitle(selectedDocument.title || '');
    setSummary(selectedDocument.summary || '');
    setContent(selectedDocument.content || '');
    setTags(Array.isArray(selectedDocument.tags) ? selectedDocument.tags.join(', ') : '');
    setDirty(false);
    setCompareVersionId(null);
    void loadVersions(selectedDocument.id);
  }, [loadVersions, selectedDocument?.id, selectedDocument?.updated_at]);

  useEffect(() => {
    if (compareVersionId && !versions.some((version) => version.id === compareVersionId)) {
      setCompareVersionId(null);
    }
  }, [compareVersionId, versions]);

  const createFolder = useCallback(async () => {
    const name = await openPrompt({ title: 'New Folder', description: 'Enter folder name.', confirmText: 'Create', cancelText: 'Cancel', required: true, placeholder: 'Folder name' });
    if (!name?.trim()) return;
    const { data, error } = await supabase
      .from('wiki_folders')
      .insert({ name: name.trim(), company_id: scopeCompanyId, company_name: scopeCompanyName || 'All', sort_order: folders.length, created_by: effectiveUserId || null, updated_by: effectiveUserId || null })
      .select()
      .single();
    if (error) return void toast('Folder create failed.', 'error');
    setSelectedFolderId((data as FolderRow).id);
    void refreshWiki();
  }, [effectiveUserId, folders.length, openPrompt, refreshWiki, scopeCompanyId, scopeCompanyName]);

  const createDocument = useCallback(async (folderId?: string | null) => {
    const nextFolderId = folderId || selectedFolderId;
    if (!nextFolderId) return;
    const name = await openPrompt({ title: 'New Document', description: 'Enter document title.', confirmText: 'Create', cancelText: 'Cancel', required: true, placeholder: 'Document title' });
    if (!name?.trim()) return;
    const folder = folders.find((item) => item.id === nextFolderId) || null;
    const { data, error } = await supabase
      .from('wiki_documents')
      .insert({
        folder_id: nextFolderId,
        company_id: folder?.company_id ?? scopeCompanyId,
        company_name: folder?.company_name ?? scopeCompanyName ?? 'All',
        title: name.trim(),
        summary: null,
        content: '',
        tags: [],
        editor_ids: effectiveUserId ? [effectiveUserId] : [],
        created_by: effectiveUserId || null,
        updated_by: effectiveUserId || null,
      })
      .select()
      .single();
    if (error) return void toast('Document create failed.', 'error');
    setSelectedDocId((data as DocumentRow).id);
    void refreshWiki();
  }, [effectiveUserId, folders, openPrompt, refreshWiki, scopeCompanyId, scopeCompanyName, selectedFolderId]);

  const saveDocument = useCallback(async () => {
    if (!selectedDocument || !title.trim()) return;
    try {
      setSaving(true);
      const editorIds = Array.from(new Set([...(selectedDocument.editor_ids || []), ...(effectiveUserId ? [effectiveUserId] : [])].filter(Boolean)));
      const { data, error } = await supabase
        .from('wiki_documents')
        .update({ title: title.trim(), summary: summary.trim() || null, content, tags: parseTags(tags), editor_ids: editorIds, updated_by: effectiveUserId || null })
        .eq('id', selectedDocument.id)
        .select()
        .single();
      if (error) throw error;
      const next = data as DocumentRow;
      setDocuments((prev) => prev.map((document) => (document.id === next.id ? next : document)));

      const { data: latestRows } = await supabase
        .from('wiki_document_versions')
        .select('version_no')
        .eq('document_id', next.id)
        .order('version_no', { ascending: false })
        .limit(1);
      const nextVersionNo = Number((latestRows || [])[0]?.version_no || 0) + 1;
      await supabase.from('wiki_document_versions').insert({
        document_id: next.id,
        version_no: nextVersionNo,
        title: next.title,
        summary: next.summary || null,
        content: next.content || '',
        tags: Array.isArray(next.tags) ? next.tags : [],
        editor_ids: Array.isArray(next.editor_ids) ? next.editor_ids : [],
        company_id: next.company_id ?? scopeCompanyId,
        company_name: next.company_name ?? scopeCompanyName ?? 'All',
        change_summary: 'Saved from wiki editor',
        created_by: effectiveUserId || null,
      });
      setDirty(false);
      void loadVersions(next.id);
    } catch (error) {
      console.error('wiki save failed:', error);
      toast('Document save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }, [content, effectiveUserId, loadVersions, scopeCompanyId, scopeCompanyName, selectedDocument, summary, tags, title]);

  const restoreVersion = useCallback(async (version: VersionRow) => {
    if (!selectedDocument) return;
    const confirmed = await openConfirm({
      title: `Restore v${version.version_no}`,
      description: 'Replace the current document with this saved version?',
      confirmText: 'Restore',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      const editorIds = Array.from(
        new Set([...(version.editor_ids || []), ...(effectiveUserId ? [effectiveUserId] : [])].filter(Boolean))
      );
      const { data, error } = await supabase
        .from('wiki_documents')
        .update({
          title: version.title,
          summary: version.summary || null,
          content: version.content || '',
          tags: Array.isArray(version.tags) ? version.tags : [],
          editor_ids: editorIds,
          updated_by: effectiveUserId || null,
        })
        .eq('id', selectedDocument.id)
        .select()
        .single();
      if (error) throw error;
      const restored = data as DocumentRow;
      setDocuments((prev) => prev.map((document) => (document.id === restored.id ? restored : document)));
      setTitle(restored.title);
      setSummary(restored.summary || '');
      setContent(restored.content || '');
      setTags(Array.isArray(restored.tags) ? restored.tags.join(', ') : '');
      const { data: latestRows } = await supabase
        .from('wiki_document_versions')
        .select('version_no')
        .eq('document_id', restored.id)
        .order('version_no', { ascending: false })
        .limit(1);
      const nextVersionNo = Number((latestRows || [])[0]?.version_no || 0) + 1;
      await supabase.from('wiki_document_versions').insert({
        document_id: restored.id,
        version_no: nextVersionNo,
        title: restored.title,
        summary: restored.summary || null,
        content: restored.content || '',
        tags: Array.isArray(restored.tags) ? restored.tags : [],
        editor_ids: Array.isArray(restored.editor_ids) ? restored.editor_ids : [],
        company_id: restored.company_id ?? scopeCompanyId,
        company_name: restored.company_name ?? scopeCompanyName ?? 'All',
        change_summary: `Restored v${version.version_no}`,
        created_by: effectiveUserId || null,
      });
      void loadVersions(restored.id);
      setDirty(false);
      toast(`Restored v${version.version_no}.`, 'success');
    } catch (error) {
      console.error('wiki restore failed:', error);
      toast('Version restore failed.', 'error');
    } finally {
      setSaving(false);
    }
  }, [effectiveUserId, loadVersions, openConfirm, scopeCompanyId, scopeCompanyName, selectedDocument]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-sm md:flex-row">
      {dialog}
      <aside className="flex w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--tab-bg)]/35 md:w-[320px] md:border-b-0 md:border-r">
        <div className="space-y-3 border-b border-[var(--border)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Company Wiki</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">Wiki</h2>
            </div>
            <button type="button" onClick={() => void createFolder()} className="rounded-full bg-[var(--foreground)] px-3.5 py-2 text-[11px] font-bold text-white">+ Folder</button>
          </div>
          <div className="flex gap-2">
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search docs" className="h-11 flex-1 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
            <button type="button" onClick={() => void createDocument()} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 text-[11px] font-bold text-[var(--accent)]">+ Doc</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
          {!schemaReady ? <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-[12px] font-semibold text-amber-700">Wiki migration required.</div> : loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" /></div> : filteredFolders.length > 0 ? filteredFolders.map(({ folder, documents: folderDocs }) => (
            <section key={folder.id} className={`rounded-[18px] border p-2 ${selectedFolder?.id === folder.id ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)]'}`}>
              <button type="button" onClick={() => setSelectedFolderId(folder.id)} className="w-full rounded-[12px] px-2 py-2 text-left hover:bg-[var(--muted)]">
                <p className="truncate text-[13px] font-bold text-[var(--foreground)]">{folder.name}</p>
                <p className="text-[11px] font-medium text-[var(--toss-gray-3)]">{folderDocs.length} docs</p>
              </button>
              <div className="mt-2 space-y-1 border-l border-[var(--border)] pl-3">
                {folderDocs.map((document) => (
                  <button key={document.id} type="button" onClick={() => { setSelectedFolderId(folder.id); setSelectedDocId(document.id); }} className={`block w-full rounded-[12px] px-3 py-2 text-left ${selectedDocId === document.id ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--muted)]'}`}>
                    <p className={`truncate text-[12px] font-bold ${selectedDocId === document.id ? 'text-white' : 'text-[var(--foreground)]'}`}>{document.title}</p>
                    <p className={`mt-1 truncate text-[11px] font-medium ${selectedDocId === document.id ? 'text-white/80' : 'text-[var(--toss-gray-3)]'}`}>{document.summary || 'No summary'}</p>
                  </button>
                ))}
              </div>
            </section>
          )) : <div className="rounded-[20px] border-2 border-dashed border-[var(--border)] px-4 py-10 text-center text-[12px] font-medium text-[var(--toss-gray-3)]">Create a folder and document to start.</div>}
        </div>
      </aside>
      <section className="flex min-h-0 flex-1 flex-col bg-[var(--card)]">
        {schemaReady && selectedDocument ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{selectedFolder?.name || 'Document'}</p>
                <h3 className="mt-1 text-xl font-bold text-[var(--foreground)]">{title || selectedDocument.title}</h3>
                <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">Updated {formatDate(selectedDocument.updated_at || selectedDocument.created_at) || 'now'}</p>
              </div>
              <button type="button" onClick={() => void saveDocument()} disabled={saving || !dirty} className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-[11px] font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
              <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-h-0 flex-col gap-4">
                  <input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} placeholder="Title" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[16px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                  <input value={summary} onChange={(event) => { setSummary(event.target.value); setDirty(true); }} placeholder="Summary" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[13px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                  <input value={tags} onChange={(event) => { setTags(event.target.value); setDirty(true); }} placeholder="tag1, tag2" className="h-12 rounded-[18px] border border-[var(--border)] bg-[var(--input-bg)] px-4 text-[13px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                  <textarea value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} placeholder="# Title&#10;&#10;- Notes" className="min-h-[420px] rounded-[22px] border border-[var(--border)] bg-[var(--input-bg)] px-4 py-4 text-[14px] font-medium leading-7 text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
                </div>
                <aside className="rounded-[22px] border border-[var(--border)] bg-[var(--background)]/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Version History</p>
                      <h4 className="mt-1 text-sm font-black text-[var(--foreground)]">Versions</h4>
                    </div>
                    <span className="rounded-full bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{versions.length}</span>
                  </div>
                  {!versionSchemaReady ? <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700">Advanced wiki migration required.</div> : loadingVersions ? <div className="mt-6 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" /></div> : versions.length > 0 ? <div className="mt-4 space-y-2">{versions.map((version) => <article key={version.id} className={`rounded-[16px] border p-3 ${compareVersionId === version.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)]'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-[12px] font-black text-[var(--foreground)]">v{version.version_no}</p><p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-3)]">{formatDate(version.created_at) || 'now'}</p></div><div className="flex gap-1"><button type="button" onClick={() => setCompareVersionId((current) => current === version.id ? null : version.id)} className="rounded-[10px] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]">{compareVersionId === version.id ? 'Close' : 'Compare'}</button><button type="button" onClick={() => void restoreVersion(version)} className="rounded-[10px] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)]">Restore</button></div></div><p className="mt-2 truncate text-[12px] font-semibold text-[var(--foreground)]">{version.title}</p><p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{version.change_summary || 'Saved snapshot'}</p></article>)}</div> : <div className="mt-4 rounded-[16px] border border-dashed border-[var(--border)] px-4 py-8 text-center text-[12px] font-medium text-[var(--toss-gray-3)]">No saved versions yet.</div>}
                  {compareVersion ? (
                    <div className="mt-4 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">Compare</p>
                          <h5 className="mt-1 text-sm font-black text-[var(--foreground)]">Current vs v{compareVersion.version_no}</h5>
                        </div>
                        <span className="rounded-full bg-[var(--page-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                          {contentDiff.changed || titleDiff.changed || summaryDiff.changed || tagDiff.changed ? 'Changed' : 'Same'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        <p>Title {titleDiff.changed ? 'changed' : 'same'} · {titleDiff.currentLength} / {titleDiff.targetLength} chars</p>
                        <p>Summary {summaryDiff.changed ? 'changed' : 'same'} · {summaryDiff.currentLength} / {summaryDiff.targetLength} chars</p>
                        <p>Tags {tagDiff.changed ? 'changed' : 'same'} · {tagDiff.currentLines} / {tagDiff.targetLines} entries</p>
                        <p>Content lines {contentDiff.currentLines} / {contentDiff.targetLines} · current only {contentDiff.onlyCurrent} · version only {contentDiff.onlyTarget}</p>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--background)]/40 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">Current</p>
                            <p className="mt-2 text-[12px] font-bold text-[var(--foreground)]">{title || '(empty title)'}</p>
                            <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{summary || '(empty summary)'}</p>
                            <p className="mt-2 text-[11px] text-[var(--accent)]">{tags || '(no tags)'}</p>
                            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[14px] bg-[var(--card)] p-3 text-[11px] font-medium leading-6 text-[var(--foreground)]">{formatPreviewText(content)}</pre>
                          </div>
                          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--background)]/40 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--toss-gray-3)]">Version v{compareVersion.version_no}</p>
                            <p className="mt-2 text-[12px] font-bold text-[var(--foreground)]">{compareVersion.title || '(empty title)'}</p>
                            <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{compareVersion.summary || '(empty summary)'}</p>
                            <p className="mt-2 text-[11px] text-[var(--accent)]">{Array.isArray(compareVersion.tags) && compareVersion.tags.length > 0 ? compareVersion.tags.join(', ') : '(no tags)'}</p>
                            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[14px] bg-[var(--card)] p-3 text-[11px] font-medium leading-6 text-[var(--foreground)]">{formatPreviewText(compareVersion.content)}</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>
          </>
        ) : schemaReady ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="rounded-full bg-[var(--toss-blue-light)] p-4 text-3xl">📚</div>
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">Select a document.</h3>
              <p className="mt-2 text-[13px] font-medium text-[var(--toss-gray-3)]">Team knowledge, manuals, and notes can live here.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] font-medium text-amber-700">Wiki migration required.</div>
        )}
      </section>
    </div>
  );
}
