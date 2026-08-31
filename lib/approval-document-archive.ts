import 'server-only';
export * from '@/lib/approval-document-shared';
import {
  buildApprovalArchiveContent,
  buildApprovalArchiveId,
  extractApprovalDocNumberFromDocument,
  resolveApprovalCategory,
  resolveApprovalDocNumber,
  type ApprovalArchiveSource,
} from '@/lib/approval-document-shared';

export async function syncApprovalToDocumentRepository(
  item: ApprovalArchiveSource,
) {
  const title = String(item.title || '').trim();
  if (!title) return;

  const nextRow = {
    title,
    category: resolveApprovalCategory(item),
    content: buildApprovalArchiveContent(item),
    file_url: null as string | null,
    version: 1,
    company_name: String(item.sender_company || '').trim() || '전체',
    created_by: (item.sender_id as string | null) || null,
  };

  const docNumber = resolveApprovalDocNumber(item);
  const companyName = nextRow.company_name;

  const { getD1Binding, getD1Drizzle, document_repository, eq, desc } = await import('@/lib/db');
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[approval-document-archive] D1 binding not available (syncApprovalToDocumentRepository)');
  const db = getD1Drizzle(d1);

  const archiveId = buildApprovalArchiveId(item.id);
  const now = new Date().toISOString();

  if (archiveId) {
    const ownRows = await db
      .select()
      .from(document_repository)
      .where(eq(document_repository.id, archiveId))
      .limit(1);
    const ownDoc = ownRows[0] as Record<string, unknown> | undefined;
    if (ownDoc?.id) {
      await db
        .update(document_repository)
        .set({
          ...nextRow,
          updated_at: now,
          version: Number(ownDoc.version) || 1,
          file_url: (ownDoc.file_url as string | null) || null,
        })
        .where(eq(document_repository.id, archiveId));
      return archiveId;
    }
  }

  let matchedDoc: Record<string, unknown> | undefined;
  if (docNumber) {
    const baseQuery = db
      .select()
      .from(document_repository)
      .orderBy(desc(document_repository.updated_at))
      .limit(300);

    const existingDocs = companyName && companyName !== '전체'
      ? await baseQuery.where(eq(document_repository.company_name, companyName))
      : await baseQuery;

    matchedDoc = (existingDocs || []).find((doc) => {
      const archivedDocNumber = extractApprovalDocNumberFromDocument(doc as Record<string, unknown>);
      return Boolean(archivedDocNumber) && archivedDocNumber === docNumber;
    }) as Record<string, unknown> | undefined;
  }

  if (matchedDoc?.id) {
    const currentVersion = Number(matchedDoc.version) || 1;
    await db
      .update(document_repository)
      .set({
        ...nextRow,
        updated_at: now,
        version: currentVersion,
        file_url: (matchedDoc.file_url as string | null) || null,
      })
      .where(eq(document_repository.id, String(matchedDoc.id)));
    return matchedDoc.id;
  }

  const newId = archiveId || crypto.randomUUID();
  await db.insert(document_repository).values({
    id: newId,
    ...nextRow,
    created_at: now,
    updated_at: now,
  });
  return newId;
}
