/**
 * 연차촉진 통보서 PDF 생성
 * 근로기준법 제61조 기반 공식 통보서 양식
 */

export type LeavePromotionNoticeParams = {
  companyName: string;
  representativeName: string;
  staffName: string;
  department: string;
  position: string;
  hireDate: string;
  step: 1 | 2;
  remainingDays: number;
  expiryDate: string;
  noticeDate: string;
  usagePlanDeadline: string;
};

/**
 * jsPDF로 연차촉진 통보서 PDF Blob 생성
 */
export async function generateLeavePromotionNoticePDF(
  params: LeavePromotionNoticeParams,
): Promise<Blob> {
  const jsPDFModule = await import('jspdf');
  const doc = new (jsPDFModule.default || jsPDFModule.jsPDF)('p', 'mm', 'a4');

  // 한글 폰트 대신 기본 폰트 사용 (실 운영 시 NanumGothic 등 임베드 권장)
  doc.setFont('Helvetica');

  const pageWidth = 210;
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  let y = 30;

  // 제목
  doc.setFontSize(18);
  doc.text(
    params.step === 1
      ? '연차유급휴가 사용촉진 통보서 (1차)'
      : '연차유급휴가 사용시기 지정 통보서 (2차)',
    pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 15;

  // 법적 근거
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('(근로기준법 제61조에 의한 연차유급휴가 사용촉진)', pageWidth / 2, y, {
    align: 'center',
  });
  doc.setTextColor(0);
  y += 15;

  // 수신 정보
  doc.setFontSize(11);
  const infoLines = [
    ['수 신', `${params.department} ${params.position} ${params.staffName}`],
    ['입사일', params.hireDate],
    ['연차만료일', params.expiryDate],
    ['잔여연차', `${params.remainingDays}일`],
    ['통보일자', params.noticeDate],
  ];

  for (const [label, value] of infoLines) {
    doc.setFont('Helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(value, margin + 35, y);
    y += 8;
  }

  y += 10;

  // 본문
  doc.setFontSize(10);
  const bodyText =
    params.step === 1
      ? [
          `귀하의 연차유급휴가 중 ${params.remainingDays}일이 미사용 상태입니다.`,
          '',
          '근로기준법 제61조 제1항에 따라 연차유급휴가의 사용을 촉진하고자',
          '아래와 같이 통보합니다.',
          '',
          `1. 귀하의 연차유급휴가 만료일은 ${params.expiryDate}입니다.`,
          `2. 현재 미사용 연차일수는 ${params.remainingDays}일입니다.`,
          `3. ${params.usagePlanDeadline}까지 연차사용 시기를 정하여`,
          '   회사에 서면으로 통보하여 주시기 바랍니다.',
          '',
          '위 기한까지 사용시기를 통보하지 않을 경우,',
          '근로기준법 제61조 제2항에 따라 회사가 사용시기를 지정할 수 있으며,',
          '지정된 시기에 사용하지 아니한 연차에 대해서는',
          '보상 의무가 소멸될 수 있음을 알려드립니다.',
        ]
      : [
          `귀하의 연차유급휴가 중 ${params.remainingDays}일이 여전히 미사용 상태입니다.`,
          '',
          '근로기준법 제61조 제2항에 따라 회사는 아래와 같이',
          '미사용 연차의 사용시기를 지정하여 통보합니다.',
          '',
          `1. 귀하의 연차유급휴가 만료일은 ${params.expiryDate}입니다.`,
          `2. 현재 미사용 연차일수는 ${params.remainingDays}일입니다.`,
          '3. 회사는 아래 기간 중 연차를 사용하시도록 지정합니다.',
          `   사용기한: ${params.expiryDate} 이전`,
          '',
          '본 통보에도 불구하고 지정된 시기에 연차를 사용하지 아니한 경우,',
          '근로기준법 제61조에 따라 해당 미사용 연차에 대한',
          '보상 의무가 소멸됩니다.',
        ];

  for (const line of bodyText) {
    doc.text(line, margin, y);
    y += 6;
  }

  y += 20;

  // 서명란
  doc.setFontSize(11);
  doc.text(params.noticeDate, pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.setFont('Helvetica', 'bold');
  doc.text(params.companyName, pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.text(`대표이사 ${params.representativeName}  (인)`, pageWidth / 2, y, {
    align: 'center',
  });

  return doc.output('blob');
}

/**
 * PDF를 다운로드 트리거
 */
export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
