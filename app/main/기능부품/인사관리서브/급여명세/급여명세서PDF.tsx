'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type PayrollSlipDesign = {
  title?: string;
  subtitle?: string;
  companyLabel?: string;
  primaryColor?: string;
  borderColor?: string;
  footerText?: string;
  showSignArea?: boolean;
  titleXPercent?: number;
  titleYPercent?: number;
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  signXPercent?: number;
  signYPercent?: number;
};

export default function PayrollSlipPDF({ staff, record, yearMonth }: any) {
  const printRef = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState<PayrollSlipDesign | null>(null);

  useEffect(() => {
    const loadDesign = async () => {
      try {
        // 1순위: 통합 서식 디자인(form_template_designs) 중 급여명세서(payroll_slip)
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        let target: any = null;

        if (!error && data?.value) {
          try {
            const parsed =
              typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            if (parsed && parsed.payroll_slip) {
              target = parsed.payroll_slip;
            }
          } catch (e) {
            console.warn('form_template_designs JSON 파싱 실패:', e);
          }
        }

        // 2순위(하위 호환): 예전 단일 키(payroll_slip_design)
        if (!target) {
          const { data: legacy, error: legacyError } = await supabase
            .from('system_settings')
            .select('*')
            .eq('key', 'payroll_slip_design')
            .maybeSingle();

          if (!legacyError && legacy?.value) {
            try {
              const parsedLegacy =
                typeof legacy.value === 'string'
                  ? JSON.parse(legacy.value)
                  : legacy.value;
              target = parsedLegacy || null;
            } catch (e) {
              console.warn('payroll_slip_design JSON 파싱 실패:', e);
            }
          }
        }

        if (target) {
          setDesign(target);
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadDesign();
  }, []);

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank');
    if (!w) return;

    const primaryColor = design?.primaryColor || '#2563eb';
    const borderColor = design?.borderColor || '#e5e7eb';
    const titleText = design?.title || '급여명세서';

    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>${titleText}</title>
      <style>
        body{font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto}
        table{width:100%;border-collapse:collapse} td,th{padding:8px;border:1px solid #ddd}
        .title{font-size:18px;font-weight:bold;margin-bottom:20px;color:${primaryColor}}
        .total{font-size:16px;font-weight:bold;color:${primaryColor}}
        .wrapper{border:1px solid ${borderColor};padding:24px;border-radius:16px;}
      </style></head><body>
      <div class="wrapper">
        ${printRef.current.innerHTML}
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
    w.close();
  };

  const advancePay = record ? Number(record.advance_pay) || 0 : 0;
  const isAdvancePay = advancePay > 0;
  const base = record?.base_salary ?? staff?.base_salary ?? staff?.base ?? 0;
  const net = record?.net_pay ?? 0;

  const companyName = staff?.company || (design?.companyLabel || '박철홍정형외과');
  const ym = String(yearMonth || new Date().toISOString().slice(0, 7));
  const [y, m] = ym.split('-');
  const monthLabel = `${y}-${Number(m || '1')}월`;
  const title = `${companyName} ${monthLabel} 급여명세서${isAdvancePay ? ' (선지급)' : ''}`;
  const footerText = design?.footerText || '';
  const showSignArea = design?.showSignArea ?? true;

  return (
    <div className="p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div ref={printRef} className="relative min-h-[220px]">
        {/* 제목 – 회사명 + 해당 월 급여명세서 (위치는 디자인 설정 사용) */}
        <div
          className="absolute font-extrabold text-lg text-gray-900"
          style={{
            top: `${design?.titleYPercent ?? 8}%`,
            left: `${design?.titleXPercent ?? 5}%`,
            transform: 'translate(-0%, -0%)',
          }}
        >
          {title}
        </div>

        {/* 부제: 직원/월 정보만 간단히 표시 */}
        <div
          className="absolute text-[11px] text-gray-600 font-bold"
          style={{
            top: `${design?.subtitleYPercent ?? 20}%`,
            left: `${design?.subtitleXPercent ?? 5}%`,
            transform: 'translate(-0%, -0%)',
          }}
        >
          <span className="mr-1">{ym}</span>
          <span className="mr-1">· {staff?.name}</span>
          <span>· {companyName}</span>
        </div>

        {/* 급여 표 영역 – 선지급 건은 본급·공제 0원, 선지급 금액만 표시 */}
        <div className="absolute left-0 right-0" style={{ top: '40%' }}>
          <table className="w-full text-xs">
            <tbody>
              {isAdvancePay ? (
                <>
                  <tr>
                    <td>선지급 (본 건은 선지급 건입니다. 본급·공제·차인 0원)</td>
                    <td className="text-right font-bold text-amber-600">
                      {advancePay.toLocaleString()}원
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">실지급액 (선지급)</td>
                    <td className="text-right font-bold text-blue-600 total">
                      {net.toLocaleString()}원
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <td>기본급</td>
                    <td className="text-right">{base.toLocaleString()}원</td>
                  </tr>
                  <tr>
                    <td>식대</td>
                    <td className="text-right">
                      {(record?.meal_allowance ?? staff?.meal_allowance ?? 0).toLocaleString()}원
                    </td>
                  </tr>
                  <tr>
                    <td>공제합계</td>
                    <td className="text-right text-red-600">
                      -{(record?.total_deduction ?? 0).toLocaleString()}원
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">실지급액</td>
                    <td className="text-right font-bold text-blue-600 total">
                      {net.toLocaleString()}원
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 문구 */}
        {footerText && (
          <div className="absolute left-0 right-0 text-center text-[11px] text-gray-500" style={{ bottom: '18%' }}>
            {footerText}
          </div>
        )}

        {/* 서명 위치도 관리화면 값 사용 */}
        {showSignArea && (
          <div
            className="absolute text-[11px] text-gray-500"
            style={{
              top: `${design?.signYPercent ?? 82}%`,
              left: `${design?.signXPercent ?? 70}%`,
              transform: 'translate(-0%, -0%)',
            }}
          >
            직원 서명: ____________________
          </div>
        )}
      </div>
      <button onClick={handlePrint} className="mt-4 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
        PDF 인쇄
      </button>
    </div>
  );
}

