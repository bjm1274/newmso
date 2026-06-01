/**
 * HEX 색상 + 투명도 → rgba() 문자열.
 * 잘못된 입력은 기본 브랜드 색(rgba(21,94,239,…))으로 폴백.
 * 3자리 단축 HEX(#abc)도 지원.
 */
export function alphaColor(hexColor: string | undefined, alpha: number): string {
  if (!hexColor) return `rgba(21, 94, 239, ${alpha})`;
  const cleaned = hexColor.replace('#', '');
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : cleaned;

  if (expanded.length !== 6) return `rgba(21, 94, 239, ${alpha})`;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
