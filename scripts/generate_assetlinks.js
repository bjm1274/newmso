/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/generate_assetlinks.js <packageName> <sha256Fingerprint> [outputPath]');
}

function normalizeFingerprint(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9:]/g, '');
}

const [, , packageNameArg, fingerprintArg, outputPathArg] = process.argv;
const packageName = String(packageNameArg || '').trim();
const fingerprint = normalizeFingerprint(fingerprintArg);

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
console.log('Next steps:');
console.log('1. Deploy the generated file to /.well-known/assetlinks.json');
console.log('2. Verify the URL opens publicly on your production domain');
console.log('3. Build/sign the Android app with the same package name and SHA-256 fingerprint');
