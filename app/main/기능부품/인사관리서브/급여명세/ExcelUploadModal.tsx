'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';

interface ExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  staffs: any[];
  onApplyToSettlement?: (matchedMap: Record<string, number>, unmatchedStaffIds: string[]) => void;
}

interface ParsedRow {
  name: string;
  residentNo: string;
  amount: number;
  matchedStaffId: string | null;
  matchedStaffName: string | null;
  status: 'matched' | 'unmatched' | 'duplicate';
}

export default function ExcelUploadModal({
  isOpen,
  onClose,
  onSuccess,
  staffs,
  onApplyToSettlement
}: ExcelUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast('CSV 또는 엑셀 파일(.csv, .xlsx, .xls)만 업로드할 수 있습니다.', 'warning');
      return;
    }

    setFile(selectedFile);
    processFile(selectedFile);
  };

  const processFile = (selectedFile: File) => {
    const reader = new FileReader();
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;

        let workbook: XLSX.WorkBook;
        if (ext === 'csv') {
          // CSV는 인코딩(euc-kr 등) 호환성을 위해 TextDecoder로 인코딩한 문자열로 로드
          const decoder = new TextDecoder('euc-kr');
          const text = decoder.decode(new Uint8Array(buffer));
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          // .xlsx / .xls 는 array 바이너리로 직접 로드
          const arr = new Uint8Array(buffer);
          workbook = XLSX.read(arr, { type: 'array' });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // 2차원 배열 형태로 시트 데이터를 변환 (sheet_to_json)
        const csvRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });

        if (csvRows.length < 2) {
          toast('파일에 데이터가 충분하지 않습니다.', 'warning');
          return;
        }

        // 헤더 매칭 (성명, 주민번호, 고지액 키워드 찾기)
        let headerRowIdx = -1;
        let nameIdx = -1;
        let residentIdx = -1;
        let amountIdx = -1;

        // 상위 5행 중 헤더 탐색
        const maxHeaderSearch = Math.min(5, csvRows.length);
        for (let i = 0; i < maxHeaderSearch; i++) {
          const row = csvRows[i];
          const nIdx = row.findIndex(cell => /성명|이름|성\s*명|이\s*름|근로자\s*명/.test(String(cell || '')));
          const rIdx = row.findIndex(cell => /주민|생년|주민등록|생년월일/.test(String(cell || '')));
          const aIdx = row.findIndex(cell => /국민연금|연금|결정보험료|결정\s*보험료|보험료|산출보험료|근로자\s*부담|납부\s*금액|결정세액|결정\s*세액|국민연금결정세액/.test(String(cell || '')));

          if (nIdx !== -1 && (rIdx !== -1 || aIdx !== -1)) {
            headerRowIdx = i;
            nameIdx = nIdx;
            residentIdx = rIdx;
            amountIdx = aIdx;
            break;
          }
        }

        // 헤더 자동 매핑에 실패한 경우 Fallback (기본 0, 1, 2열 매핑 시도)
        if (headerRowIdx === -1) {
          headerRowIdx = 0;
          nameIdx = 0;
          residentIdx = 1;
          amountIdx = 2;
        }

        const rows: ParsedRow[] = [];
        for (let i = headerRowIdx + 1; i < csvRows.length; i++) {
          const row = csvRows[i];
          if (row.length <= Math.max(nameIdx, residentIdx, amountIdx)) continue;

          const rawName = String(row[nameIdx] || '').replace(/\s+/g, '');
          if (!rawName) continue;

          const rawResident = String(row[residentIdx] || '').replace(/[^0-9]/g, '');
          const rawAmount = parseInt(String(row[amountIdx] || '').replace(/[^0-9]/g, '') || '0', 10);

          // 직원 매핑 시도
          const matched = staffs.filter((staff) => {
            const staffName = (staff.name || '').replace(/\s+/g, '');
            if (staffName !== rawName) return false;

            // 주민번호 또는 생년월일 비교 (있을 때만)
            if (rawResident.length >= 6) {
              const staffResident = (staff.resident_no || '').replace(/[^0-9]/g, '');
              if (staffResident.length >= 6) {
                return staffResident.startsWith(rawResident.slice(0, 6));
              }
            }
            return true; // 이름만 같아도 일단 후보군에 포함
          });

          let matchedStaffId: string | null = null;
          let matchedStaffName: string | null = null;
          let status: ParsedRow['status'] = 'unmatched';

          if (matched.length === 1) {
            matchedStaffId = String(matched[0].id);
            matchedStaffName = matched[0].name;
            status = 'matched';
          } else if (matched.length > 1) {
            status = 'duplicate';
          }

          rows.push({
            name: rawName,
            residentNo: rawResident,
            amount: rawAmount,
            matchedStaffId,
            matchedStaffName,
            status
          });
        }

        setParsedRows(rows);
        if (rows.length === 0) {
          toast('파싱 가능한 행이 없습니다. 컬럼을 확인해 주세요.', 'warning');
        } else {
          const matchedCount = rows.filter(r => r.status === 'matched').length;
          toast(`파싱 완료: 총 ${rows.length}행 중 ${matchedCount}명이 매핑되었습니다.`, 'success');
        }
      } catch (err) {
        console.error('엑셀/CSV 파싱 에러:', err);
        toast('파일 파싱 중 에러가 발생했습니다.', 'error');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const ext = droppedFile.name.split('.').pop()?.toLowerCase();
      if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
        toast('CSV 또는 엑셀 파일만 허용됩니다.', 'warning');
        return;
      }
      setFile(droppedFile);
      processFile(droppedFile);
    }
  };

  const handleSave = async () => {
    const targets = parsedRows.filter(r => r.status === 'matched' && r.matchedStaffId);
    if (targets.length === 0) {
      toast('일괄 반영할 매핑된 직원이 없습니다.', 'warning');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setProgress({ current: i + 1, total: targets.length });

      try {
        // 기존 permissions 데이터 로드
        const { data: staff, error: fetchError } = await db
          .from('staff_members')
          .select('permissions')
          .eq('id', target.matchedStaffId!)
          .maybeSingle();

        if (fetchError) throw fetchError;

        const currentPermissions = (staff?.permissions || {}) as Record<string, any>;
        const insurance = {
          ...(currentPermissions.insurance || {}),
          national: true, // 고지액이 등록되므로 기본 활성화
          national_amount: target.amount
        };

        const nextPermissions = {
          ...currentPermissions,
          insurance
        };

        // permissions 업데이트
        const { error: updateError } = await db
          .from('staff_members')
          .update({ permissions: nextPermissions })
          .eq('id', target.matchedStaffId!);

        if (updateError) throw updateError;
        successCount++;
      } catch (err) {
        console.error(`직원 ${target.name} 업데이트 실패:`, err);
        failCount++;
      }
    }

    setLoading(false);
    if (onApplyToSettlement) {
      const matchedMap: Record<string, number> = {};
      targets.forEach((t) => {
        if (t.matchedStaffId) matchedMap[t.matchedStaffId] = t.amount;
      });
      const matchedIdSet = new Set(targets.map((t) => String(t.matchedStaffId)));
      const unmatchedStaffIds = staffs
        .filter((s) => !matchedIdSet.has(String(s.id)))
        .map((s) => String(s.id));
      onApplyToSettlement(matchedMap, unmatchedStaffIds);
    }
    toast(`저장 완료: ${successCount}명 반영 완료, ${failCount}명 실패`, failCount > 0 ? 'warning' : 'success');
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--card)] w-[90%] max-w-2xl rounded-[var(--radius-xl)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-[var(--border)] animate-in zoom-in-95 duration-200">
        
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center shrink-0">
          <h3 className="text-base font-extrabold text-[var(--foreground)] flex items-center gap-2">
            📂 국민연금 결정세액(EDI) 일괄 업로드
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-full transition-all text-sm font-bold">닫기</button>
        </div>

        {/* 바디 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 드롭존 */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[var(--toss-gray-6)] hover:border-emerald-500 rounded-[var(--radius-xl)] p-8 text-center cursor-pointer transition-all bg-[var(--muted)]/30 hover:bg-emerald-50/10 flex flex-col items-center justify-center gap-2"
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv,.xlsx,.xls" className="hidden" />
            <span className="text-3xl">📤</span>
            <p className="text-xs font-bold text-[var(--foreground)]">
              {file ? file.name : '국민연금 결정세액 엑셀/CSV 파일(.xlsx, .xls, .csv)을 드래그하거나 클릭하여 업로드'}
            </p>
            <p className="text-[10px] text-[var(--toss-gray-4)]">
              국민연금공단(사회보험 EDI)에서 내려받은 공제액 산출내역서를 업로드해 주세요.
            </p>
          </div>

          {/* 파싱 프리뷰 */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold text-[var(--foreground)] flex justify-between items-center">
                <span>📋 파싱된 목록 프리뷰 ({parsedRows.length}건)</span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/30 px-2 py-0.5 rounded-full">
                  매핑 성공: {parsedRows.filter(r => r.status === 'matched').length}명
                </span>
              </h4>
              
              <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[var(--muted)] sticky top-0 text-[10px] text-[var(--toss-gray-4)] border-b border-[var(--border)] font-bold">
                    <tr>
                      <th className="p-2.5">고지서 성명</th>
                      <th className="p-2.5">생년월일</th>
                      <th className="p-2.5 text-right">국민연금 결정세액</th>
                      <th className="p-2.5">시스템 매핑 결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-semibold text-[11px]">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[var(--muted)]/20">
                        <td className="p-2.5">{row.name}</td>
                        <td className="p-2.5 text-[var(--toss-gray-4)]">{row.residentNo ? row.residentNo.slice(0, 6) : '—'}</td>
                        <td className="p-2.5 text-right font-bold text-slate-800">{row.amount.toLocaleString()}원</td>
                        <td className="p-2.5">
                          {row.status === 'matched' ? (
                            <span className="text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px]">
                              ✅ {row.matchedStaffName} 매핑완료
                            </span>
                          ) : row.status === 'duplicate' ? (
                            <span className="text-amber-600 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px]">
                              ⚠️ 중복된 이름 존재
                            </span>
                          ) : (
                            <span className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-full text-[10px]">
                              ❌ 매핑 실패 (미등록 직원)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 진행 중 로딩 화면 */}
          {loading && (
            <div className="p-4 bg-emerald-50 rounded-[var(--radius-xl)] border border-emerald-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-emerald-800">
                <span>⚡ 직원 국민연금 결정세액 일괄 업데이트 중...</span>
                <span>{progress.current} / {progress.total} 명</span>
              </div>
              <div className="w-full bg-emerald-200/50 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--page-bg)] flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={loading || parsedRows.length === 0}
            className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold hover:scale-[0.99] active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            일괄 반영하기 ({parsedRows.filter(r => r.status === 'matched').length}명)
          </button>
        </div>

      </div>
    </div>
  );
}
