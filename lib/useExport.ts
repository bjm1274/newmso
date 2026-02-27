/**
 * 데이터 내보내기 표준화 훅
 * Excel(xlsx) 및 CSV 내보내기를 일관된 방식으로 제공합니다.
 */

export function exportToExcel(data: Record<string, any>[], filename: string, sheetName = '데이터') {
  if (typeof window === 'undefined') return;
  import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

export function exportToCsv(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h] ?? '';
    return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printToPdf(title: string) {
  const originalTitle = document.title;
  document.title = title;
  window.print();
  document.title = originalTitle;
}

/** 공통 내보내기 버튼 렌더링용 데이터 */
export function useExport(data: Record<string, any>[], filename: string) {
  return {
    exportExcel: () => exportToExcel(data, filename),
    exportCsv: () => exportToCsv(data, filename),
    exportPdf: () => printToPdf(filename),
  };
}
