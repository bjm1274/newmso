/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = rawLine.indexOf('=');
    if (eqIndex === -1) continue;
    const key = rawLine.slice(0, eqIndex).trim();
    let value = rawLine.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const options = {
    year: Number(argv[2] || new Date().getFullYear()),
    company: argv[3] || '전체',
    official: argv.includes('--official'),
    bracketFile: null,
  };
  const bracketIndex = argv.indexOf('--bracket-file');
  if (bracketIndex >= 0 && argv[bracketIndex + 1]) {
    options.bracketFile = argv[bracketIndex + 1];
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let incomeTaxBracket = [];
  if (options.bracketFile) {
    const fullPath = path.resolve(process.cwd(), options.bracketFile);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new Error('세율표 파일은 JSON 배열이어야 합니다.');
    }
    incomeTaxBracket = parsed.map((entry) => ({
      ...entry,
      official: options.official,
    }));
  }

  const payload = {
    effective_year: options.year,
    company_name: options.company,
    national_pension_rate: 0.0475,
    health_insurance_rate: 0.03545,
    long_term_care_rate: 0.00459,
    employment_insurance_rate: 0.009,
    income_tax_bracket: incomeTaxBracket,
  };

  const result = await supabase
    .from('tax_insurance_rates')
    .upsert(payload, { onConflict: 'effective_year,company_name' })
    .select();

  if (result.error) {
    throw result.error;
  }

  console.log(JSON.stringify({
    saved: true,
    year: options.year,
    company: options.company,
    officialBracket: options.official,
    bracketCount: incomeTaxBracket.length,
    data: result.data,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
