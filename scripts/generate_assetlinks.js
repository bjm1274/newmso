/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/generate_assetlinks.js <packageName> <sha256Fingerprint> [outputPath]');
}

const [, , packageName, fingerprint, outputPathArg] = process.argv;

if (!packageName || !fingerprint) {
  usage();
  process.exit(1);
}

const payload = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: [fingerprint],
    },
  },
];

const outputPath = outputPathArg
  ? path.resolve(outputPathArg)
  : path.resolve(process.cwd(), 'public', '.well-known', 'assetlinks.json');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`assetlinks.json generated at ${outputPath}`);
