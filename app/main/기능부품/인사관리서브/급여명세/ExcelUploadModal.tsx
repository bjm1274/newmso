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

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedNameCol, setSelectedNameCol] = useState<number>(-1);
  const [selectedResidentCol, setSelectedResidentCol] = useState<number>(-1);
  const [selectedAmountCol, setSelectedAmountCol] = useState<number>(-1);
  const [rawSheetRows, setRawSheetRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);

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

  // 공단 엑셀 컬럼 키워드 정규식
  const NAME_REGEX = /성명|이름|성\s*명|이\s*름|근로자\s*명|가입자\s*명|성\s*함/;
  const RESIDENT_REGEX = /주민|생년|주민등록|생년월일|주민번호|식별번호/;
  // 국민연금 본인부담액/공제액 우선 매칭 정규식
  const PRIORITY_AMOUNT_REGEX = /본인\s*부담|가입자\s*부담|개인\s*부담|근로자\s*부담|고지\s*금액|고지\s*보험료|납부\s*할\s*보험료|납부\s*보험료|결정\s*세액|결정\s*금액|국민연금\s*공제|당월\s*보험료|월\s*보험료|결정\s*보험료|산출\s*보험료/;
  const GENERAL_AMOUNT_REGEX = /국민\s*연금|연금|보험료|공제액|납부\s*금액/;
  const EXCLUDE_COL_REGEX = /사업자|사용자|사업장|회사|총액|합계|소득월액|기준소득|과세표준|비고|구분|번호|순번/;

  const processFile = (selectedFile: File) => {
    const reader = new FileReader();
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;

        let workbook: XLSX.WorkBook;
        if (ext === 'csv') {
          const decoder = new TextDecoder('euc-kr');
          const text = decoder.decode(new Uint8Array(buffer));
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          const arr = new Uint8Array(buffer);
          workbook = XLSX.read(arr, { type: 'array' });
        }

        // 시트 선택: "국민연금", "고지", "산출" 키워드가 포함된 시트 우선, 없으면 첫 번째 시트
        let targetSheetName = workbook.SheetNames[0];
        const matchedSheet = workbook.SheetNames.find(name => /국민연금|연금|고지|산출/.test(name));
        if (matchedSheet) targetSheetName = matchedSheet;

        const worksheet = workbook.Sheets[targetSheetName];
        const csvRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });

        if (csvRows.length < 2) {
          toast('파일에 데이터가 충분하지 않습니다.', 'warning');
          return;
        }

        // 상위 15행 중 헤더 탐색
        let detectedHeaderIdx = -1;
        let detectedNameIdx = -1;
        let detectedResidentIdx = -1;
        let detectedAmountIdx = -1;

        const maxHeaderSearch = Math.min(15, csvRows.length);
        for (let i = 0; i < maxHeaderSearch; i++) {
          const row = csvRows[i];
          const prevRow = i > 0 ? csvRows[i - 1] : [];
          const nextRow = i < csvRows.length - 1 ? csvRows[i + 1] : [];

          // 성명 열 탐색
          const nIdx = row.findIndex((cell, colIdx) => {
            const combined = `${prevRow[colIdx] || ''} ${cell || ''} ${nextRow[colIdx] || ''}`;
            return NAME_REGEX.test(combined);
          });

          if (nIdx !== -1) {
            detectedHeaderIdx = i;
            detectedNameIdx = nIdx;

            // 주민/생년월일 열 탐색
            detectedResidentIdx = row.findIndex((cell, colIdx) => {
              const combined = `${prevRow[colIdx] || ''} ${cell || ''} ${nextRow[colIdx] || ''}`;
              return colIdx !== nIdx && RESIDENT_REGEX.test(combined);
            });

            // 금액 열 탐색 (1순위: 본인부담/고지금액/결정보험료)
            detectedAmountIdx = row.findIndex((cell, colIdx) => {
              if (colIdx === nIdx || colIdx === detectedResidentIdx) return false;
              const combined = `${prevRow[colIdx] || ''} ${cell || ''} ${nextRow[colIdx] || ''}`;
              if (EXCLUDE_COL_REGEX.test(combined)) return false;
              return PRIORITY_AMOUNT_REGEX.test(combined);
            });

            // 1순위 실패 시 2순위 (일반 연금/보험료 키워드)
            if (detectedAmountIdx === -1) {
              detectedAmountIdx = row.findIndex((cell, colIdx) => {
                if (colIdx === nIdx || colIdx === detectedResidentIdx) return false;
                const combined = `${prevRow[colIdx] || ''} ${cell || ''} ${nextRow[colIdx] || ''}`;
                if (EXCLUDE_COL_REGEX.test(combined)) return false;
                return GENERAL_AMOUNT_REGEX.test(combined);
              });
            }
            break;
          }
        }

        // 헤더 탐색 fallback
        if (detectedHeaderIdx === -1) {
          detectedHeaderIdx = 0;
          detectedNameIdx = 0;
          detectedResidentIdx = 1;
          detectedAmountIdx = 2;
        }

        // 만약 금액 열(detectedAmountIdx)을 여전히 못 찾았거나, 해당 열의 실제 데이터가 0원/빈값이라면
        // 데이터 행 샘플들을 분석하여 통상 국민연금 공제 범위(1만~80만원)의 숫자가 들어있는 열을 자동 감지
        const testDataRows = csvRows.slice(detectedHeaderIdx + 1, detectedHeaderIdx + 11);
        const colCandidateScores: Record<number, number> = {};

        testDataRows.forEach(row => {
          row.forEach((cell, colIdx) => {
            if (colIdx === detectedNameIdx || colIdx === detectedResidentIdx) return;
            const num = parseInt(String(cell || '').replace(/[^0-9]/g, '') || '0', 10);
            // 국민연금 1인 공제액 통상 범위 (15,000원 ~ 600,000원)
            if (num >= 15000 && num <= 600000) {
              colCandidateScores[colIdx] = (colCandidateScores[colIdx] || 0) + 2;
            } else if (num > 0 && num <= 1500000) {
              colCandidateScores[colIdx] = (colCandidateScores[colIdx] || 0) + 1;
            }
          });
        });

        // 가장 점수가 높은 열을 스마트 금액 열로 추천
        const bestScoredCol = Object.entries(colCandidateScores)
          .sort((a, b) => b[1] - a[1])[0];

        if (detectedAmountIdx === -1 && bestScoredCol) {
          detectedAmountIdx = parseInt(bestScoredCol[0], 10);
        } else if (bestScoredCol && detectedAmountIdx !== -1) {
          // 만약 정규식으로 잡힌 열의 데이터가 전부 0원인데 다른 열에 유효 금액이 있으면 교체
          const detectedColHasValues = testDataRows.some(row => {
            const num = parseInt(String(row[detectedAmountIdx] || '').replace(/[^0-9]/g, '') || '0', 10);
            return num > 0;
          });
          if (!detectedColHasValues && parseInt(bestScoredCol[1] as any, 10) > 0) {
            detectedAmountIdx = parseInt(bestScoredCol[0], 10);
          }
        }

        // 컬럼 목록 레이블 추출
        const headerRow = csvRows[detectedHeaderIdx] || [];
        const colLabels = headerRow.map((cell, idx) => {
          const colLetter = String.fromCharCode(65 + (idx % 26));
          const name = String(cell || '').trim();
          return name ? `${name} (${colLetter}열)` : `열 ${idx + 1} (${colLetter}열)`;
        });

        setRawSheetRows(csvRows);
        setHeaderRowIndex(detectedHeaderIdx);
        setAvailableColumns(colLabels);
        setSelectedNameCol(detectedNameIdx);
        setSelectedResidentCol(detectedResidentIdx !== -1 ? detectedResidentIdx : 1);
        setSelectedAmountCol(detectedAmountIdx !== -1 ? detectedAmountIdx : 2);

        // 최초 파싱 실행
        applyColumnMapping(
          csvRows,
          detectedHeaderIdx,
          detectedNameIdx,
          detectedResidentIdx !== -1 ? detectedResidentIdx : 1,
          detectedAmountIdx !== -1 ? detectedAmountIdx : 2
        );
      } catch (err) {
        console.error('엑셀/CSV 파싱 에러:', err);
        toast('파일 파싱 중 에러가 발생했습니다.', 'error');
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // 컬럼 매핑에 따라 행 파싱 및 직원 매칭
  const applyColumnMapping = (
    rowsData: string[][],
    headerIdx: number,
    nameIdx: number,
    residentIdx: number,
    amountIdx: number
  ) => {
    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < rowsData.length; i++) {
      const row = rowsData[i];
      if (row.length <= Math.max(nameIdx, residentIdx, amountIdx)) continue;

      const rawName = String(row[nameIdx] || '').replace(/\s+/g, '');
      if (!rawName || rawName === '성명' || rawName === '이름' || rawName === '합계' || rawName === '소계') continue;

      const rawResident = String(row[residentIdx] || '').replace(/[^0-9]/g, '');
      const rawAmount = parseInt(String(row[amountIdx] || '').replace(/[^0-9]/g, '') || '0', 10);

      // 직원 매핑 시도
      const matched = staffs.filter((staff) => {
        const staffName = (staff.name || '').replace(/\s+/g, '');
        if (staffName !== rawName) return false;

        if (rawResident.length >= 6) {
          const staffResident = (staff.resident_no || '').replace(/[^0-9]/g, '');
          if (staffResident.length >= 6) {
            return staffResident.startsWith(rawResident.slice(0, 6));
          }
        }
        return true;
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
    const matchedCount = rows.filter(r => r.status === 'matched').length;
    const totalAmount = rows.filter(r => r.status === 'matched').reduce((sum, r) => sum + r.amount, 0);

    if (matchedCount > 0 && totalAmount === 0) {
      toast('⚠️ 매핑은 되었으나 결정세액이 0원입니다. [국민연금 공제액 열]을 올바른 열로 선택해 주세요.', 'warning');
    } else if (matchedCount > 0) {
      toast(`매핑 완료: ${matchedCount}명 / 총 공제액 ₩${totalAmount.toLocaleString()}`, 'success');
    }
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

  // 급여정산 반영 및 DB 저장 실행
  const handleSave = async () => {
    const targets = parsedRows.filter(r => r.status === 'matched' && r.matchedStaffId);
    if (targets.length === 0) {
      toast('일괄 반영할 매핑된 직원이 없습니다.', 'warning');
      return;
    }

    // 1단계: 급여정산 State에 번개처럼 즉시 100% 반영 (Non-blocking)
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

    // 2단계: 인사 마스터 DB 저장은 백그라운드 병렬 비동기로 처리
    setLoading(true);
    setProgress({ current: 0, total: targets.length });

    try {
      // 병렬 배치 업데이트 (최대 10개씩)
      const batchSize = 10;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (target) => {
            try {
              const { data: staff } = await db
                .from('staff_members')
                .select('permissions')
                .eq('id', target.matchedStaffId!)
                .maybeSingle();

              const currentPermissions = (typeof staff?.permissions === 'string'
                ? JSON.parse(staff.permissions)
                : staff?.permissions || {}) as Record<string, any>;

              const insurance = {
                ...(currentPermissions.insurance || {}),
                national: true,
                national_amount: target.amount
              };

              await db
                .from('staff_members')
                .update({ permissions: { ...currentPermissions, insurance } })
                .eq('id', target.matchedStaffId!);
            } catch (e) {
              console.error(`직원 ${target.name} DB 보존 실패 (화면 반영은 완료됨):`, e);
            }
          })
        );
        setProgress({ current: Math.min(i + batchSize, targets.length), total: targets.length });
      }
    } catch (err) {
      console.error('마스터 DB 저장 중 오류:', err);
    } finally {
      setLoading(false);
      const totalAmount = targets.reduce((sum, t) => sum + t.amount, 0);
      toast(`✅ ${targets.length}명의 국민연금 공제액(총 ₩${totalAmount.toLocaleString()})이 급여정산에 즉시 반영되었습니다!`, 'success');
      onSuccess();
      onClose();
    }
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

          {/* 컬럼 선택기 (엑셀 파싱 시 표시) */}
          {availableColumns.length > 0 && (
            <div className="p-3.5 bg-[var(--muted)]/40 rounded-[var(--radius-lg)] border border-[var(--border)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--foreground)] flex items-center gap-1.5">
                  <span>⚙️</span> 엑셀 컬럼 매핑 설정
                </span>
                <span className="text-[11px] text-[var(--toss-gray-4)] font-medium">
                  자동 감지되었으며, 다른 열을 선택하면 실시간으로 변경됩니다.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">🏷️ 성명 열</label>
                  <select
                    value={selectedNameCol}
                    onChange={(e) => {
                      const col = parseInt(e.target.value, 10);
                      setSelectedNameCol(col);
                      applyColumnMapping(rawSheetRows, headerRowIndex, col, selectedResidentCol, selectedAmountCol);
                    }}
                    className="w-full text-xs font-bold p-2 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] outline-none"
                  >
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">🎂 주민/생년월일 열</label>
                  <select
                    value={selectedResidentCol}
                    onChange={(e) => {
                      const col = parseInt(e.target.value, 10);
                      setSelectedResidentCol(col);
                      applyColumnMapping(rawSheetRows, headerRowIndex, selectedNameCol, col, selectedAmountCol);
                    }}
                    className="w-full text-xs font-bold p-2 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] outline-none"
                  >
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-emerald-700 mb-1 flex items-center gap-1">
                    <span>💰 국민연금 공제액(결정세액) 열</span>
                  </label>
                  <select
                    value={selectedAmountCol}
                    onChange={(e) => {
                      const col = parseInt(e.target.value, 10);
                      setSelectedAmountCol(col);
                      applyColumnMapping(rawSheetRows, headerRowIndex, selectedNameCol, selectedResidentCol, col);
                    }}
                    className="w-full text-xs font-extrabold p-2 rounded border-2 border-emerald-500 bg-emerald-50/50 text-emerald-900 outline-none shadow-xs"
                  >
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 파싱 프리뷰 */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h4 className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
                  <span>📋 파싱된 목록 프리뷰 ({parsedRows.length}건)</span>
                </h4>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                    매핑 성공: {parsedRows.filter(r => r.status === 'matched').length}명
                  </span>
                  <span className="text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-full">
                    공제 총액: ₩{parsedRows.filter(r => r.status === 'matched').reduce((s, r) => s + r.amount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[var(--muted)] sticky top-0 text-[10px] text-[var(--toss-gray-4)] border-b border-[var(--border)] font-bold">
                    <tr>
                      <th className="p-2.5">고지서 성명</th>
                      <th className="p-2.5">생년월일</th>
                      <th className="p-2.5 text-right">국민연금 공제액</th>
                      <th className="p-2.5">시스템 매핑 결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-semibold text-[11px]">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[var(--muted)]/20">
                        <td className="p-2.5 font-bold text-[var(--foreground)]">{row.name}</td>
                        <td className="p-2.5 text-[var(--toss-gray-4)]">{row.residentNo ? row.residentNo.slice(0, 6) : '—'}</td>
                        <td className="p-2.5 text-right font-black">
                          {row.amount > 0 ? (
                            <span className="text-emerald-600">₩{row.amount.toLocaleString()}</span>
                          ) : (
                            <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                              ⚠️ 0원 (열 확인 필요)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {row.status === 'matched' ? (
                            <span className="text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 w-fit">
                              <span>✅</span> {row.matchedStaffName} 매핑완료 {row.amount > 0 ? `(₩${row.amount.toLocaleString()})` : ''}
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

              {/* 0원 경고 배너 */}
              {parsedRows.filter(r => r.status === 'matched').length > 0 &&
                parsedRows.filter(r => r.status === 'matched').reduce((s, r) => s + r.amount, 0) === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] text-xs text-amber-900 font-bold flex items-center gap-2 animate-pulse">
                  <span className="text-base">⚠️</span>
                  <span>
                    모든 직원의 공제액이 <b>0원</b>으로 인식되었습니다. 상단 <b>[💰 국민연금 공제액(결정세액) 열]</b> 드롭다운에서 실제 공제액(본인부담액/고지금액)이 적힌 열을 선택해 주세요.
                  </span>
                </div>
              )}
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
                  style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--page-bg)] flex justify-between items-center shrink-0">
          <div className="text-xs text-[var(--toss-gray-4)]">
            {parsedRows.filter(r => r.status === 'matched').length > 0 && (
              <span>
                매핑 대상 <b>{parsedRows.filter(r => r.status === 'matched').length}명</b> 선택됨
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={loading || parsedRows.filter(r => r.status === 'matched').length === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[var(--radius-md)] text-xs font-black transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
            >
              <span>⚡</span> 급여정산에 즉시 반영하기 ({parsedRows.filter(r => r.status === 'matched').length}명)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
