'use client';

import { useRef } from 'react';

interface AnnualLeaveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  staff: {
    id: string;
    name: string;
    department?: string | null;
    position?: string | null;
    totalLeave?: number;
    usedLeave?: number;
    remainingLeave?: number;
    expiryDateStr?: string | null;
    promotionStage?: number | null;
  } | null;
}

export default function AnnualLeaveDocumentModal({ isOpen, onClose, staff }: AnnualLeaveDocumentModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !staff) return null;

  const stageLabel = staff.promotionStage === 2 ? '2차' : '1차';
  const todayStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrint = () => {
    const printContent = printAreaRef.current?.innerHTML;
    if (!printContent) return;

    const style = `
      <style>
        body {
          font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
          color: #000;
          background: #fff;
          padding: 40px;
        }
        .print-container {
          width: 100%;
          max-width: 700px;
          margin: 0 auto;
        }
        .document-title {
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 35px;
          text-decoration: underline;
        }
        .doc-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        .doc-table th, .doc-table td {
          border: 1px solid #000;
          padding: 8px 12px;
          font-size: 12px;
          text-align: left;
        }
        .doc-table th {
          background-color: #f5f5f5;
          font-weight: bold;
          width: 25%;
        }
        .doc-body {
          font-size: 13px;
          line-height: 1.8;
          margin-bottom: 35px;
          text-align: justify;
        }
        .doc-footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #555;
        }
        .doc-signature {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
      </style>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>연차유급휴가 사용촉진 통보서 - ${staff.name}</title>
            ${style}
          </head>
          <body>
            <div class="print-container">
              ${printContent}
            </div>
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-5"
        style={{
          width: '90%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }} className="no-print">
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }} className="text-foreground">
            📄 연차유급휴가 촉진 서면 통보서 ({stageLabel})
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--z-500)' }}>
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 인쇄 영역 */}
        <div
          ref={printAreaRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            background: '#fff',
            color: '#000',
            padding: '30px 24px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
          className="print-target"
        >
          <div className="document-title">
            연차 유급휴가 사용촉진 통보서 ({stageLabel})
          </div>

          <table className="doc-table">
            <tbody>
              <tr>
                <th>성 명</th>
                <td style={{ width: '30%' }}>{staff.name}</td>
                <th>소 속</th>
                <td style={{ width: '30%' }}>{staff.department || '인사부'}</td>
              </tr>
              <tr>
                <th>직 급</th>
                <td>{staff.position || '사원'}</td>
                <th>미사용 연차</th>
                <td style={{ fontWeight: 'bold' }}>{staff.remainingLeave} 일</td>
              </tr>
            </tbody>
          </table>

          <div className="doc-body">
            {staff.promotionStage === 1 ? (
              <>
                귀하의 {new Date().getFullYear()}년도 발생 연차유급휴가 중 현재까지 사용하지 아니한 휴가는 <strong>총 {staff.remainingLeave}일</strong>입니다.<br /><br />
                이에 근로기준법 제61조 제1항에 의거하여, 회사는 귀하에게 미사용 연차유급휴가의 사용을 촉진하오니, 본 서면을 수령한 날로부터 10일 이내에 미사용 연차유급휴가에 대한 구체적인 사용계획서(계획 일자 지정)를 작성하여 전자결재 시스템을 통해 제출해 주시기 바랍니다.<br /><br />
                기한 내에 사용 계획을 제출하지 아니할 경우, 근로기준법 제61조 제2항에 의거하여 회사가 임의로 휴가 사용 시기를 지정하여 통보하게 되며, 이에 따른 휴가 미사용에 대하여는 수당이 지급되지 아니함을 알려드립니다.
              </>
            ) : (
              <>
                회사는 근로기준법 제61조 제1항에 의거하여 귀하에게 미사용 연차유급휴가 사용을 촉진하였으나, 귀하는 기한 내에 사용계획서를 제출하지 아니하였습니다.<br /><br />
                이에 회사는 근로기준법 제61조 제2항에 따라 귀하의 미사용 연차유급휴가 <strong>총 {staff.remainingLeave}일</strong>에 대하여 아래와 같이 사용 시기를 지정하여 통보합니다.<br /><br />
                귀하는 지정된 휴가일에 휴가를 사용하여야 하며, 지정된 휴가일에 출근하여 근로를 제공하더라도 회사는 수령거부 의사를 명확히 할 것이며 이에 따른 연차유급휴가 미사용 수당은 소멸됨을 재차 고지합니다.
              </>
            )}
          </div>

          <div className="doc-footer">
            통보일자: {todayStr}
          </div>

          <div className="doc-signature">
            <div style={{ borderTop: '1px solid #000', paddingTop: '8px', width: '40%', textAlign: 'center' }}>
              수령인 확인 서명: (인)
            </div>
            <div style={{ width: '45%', textAlign: 'right', fontWeight: 'bold' }}>
              MSO 주식회사 대표이사 (직인생략)
            </div>
          </div>
        </div>

        {/* 하단 제어 바 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 15 }} className="no-print">
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--toss-gray-4)' }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff' }}
          >
            🖨️ 인쇄 / PDF 저장
          </button>
        </div>
      </div>
    </div>
  );
}
