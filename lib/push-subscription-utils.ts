export type PushSubscriptionEndpointRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
};

export function groupDuplicateEndpoints(rows: PushSubscriptionEndpointRow[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const endpoint = String(row.endpoint || '').trim();
    if (!endpoint) continue;
    grouped.set(endpoint, (grouped.get(endpoint) || 0) + 1);
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  for (const count of grouped.values()) {
    if (count <= 1) continue;
    duplicateGroups += 1;
    duplicateRows += count - 1;
  }

  return { duplicateGroups, duplicateRows };
}

export function pickPreferredSubscription<T extends PushSubscriptionEndpointRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftHasStaff = left.staff_id ? 1 : 0;
    const rightHasStaff = right.staff_id ? 1 : 0;
    if (leftHasStaff !== rightHasStaff) return rightHasStaff - leftHasStaff;
    return String(right.id).localeCompare(String(left.id));
  })[0];
}
