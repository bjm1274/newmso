/**
 * scripts/_archived-guard.mjs
 *
 * 2026-07-26 Cloudflare 계정 이전 때 쓰인 일회성 스크립트들을 봉인한다.
 *
 * 이 스크립트들은 구 DB 'pchos-d1' 을 겨누고 있다. 구 DB 가 사실상 비어 있어서
 * 지금은 실행해도 큰 피해가 없지만, 그건 설계가 아니라 우연이다.
 * "DB 이름이 옛것이네" 하고 pchos-d1-v2 로 고치는 순간 살아 있는 무기가 된다.
 *
 * 그래서 DB 이름을 현행으로 바꾸는 대신, 실행 자체를 막는다.
 * 정말 필요한 상황(재해복구 등)에서는 확인 문구를 명시적으로 넘겨야 한다.
 */

/**
 * @param {object} opts
 * @param {string} opts.name        스크립트 파일명
 * @param {string} opts.what        이 스크립트가 하는 일 (한 줄)
 * @param {string} opts.risk        지금 실행하면 벌어지는 일 (한 줄)
 * @param {string} [opts.insteadUse] 대신 써야 하는 현행 스크립트
 */
export function refuseArchivedScript({ name, what, risk, insteadUse }) {
  const phrase = `RUN ARCHIVED ${name}`;
  if (process.argv.slice(2).join(' ').trim() === phrase) {
    console.warn(`\n⚠ 봉인 해제: ${name} 을(를) 실행합니다. 대상 DB 가 구 DB('pchos-d1')임을 확인하세요.\n`);
    return;
  }

  console.error(
    [
      '',
      `⛔ ${name} 은(는) 2026-07-26 계정 이전용 일회성 스크립트입니다. 봉인되어 있습니다.`,
      '',
      `   하는 일 : ${what}`,
      `   위험    : ${risk}`,
      `   대상 DB : 구 DB 'pchos-d1' (현행 운영 DB 는 'pchos-d1-v2')`,
      '',
      insteadUse ? `   지금 필요한 작업이라면 → ${insteadUse}` : '   현행 운영 절차로 대체되었습니다.',
      '',
      '   ⚠ DB 이름만 pchos-d1-v2 로 바꿔 실행하지 마세요. 그 순간 운영 데이터를 겨눕니다.',
      '',
      '   그래도 원본 그대로 실행해야 한다면:',
      `     node scripts/${name} ${phrase}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}
