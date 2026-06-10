import { execSync } from 'child_process';

try {
  const output = execSync('npx wrangler d1 execute newmso-db --remote --command="SELECT staff_id, contract_type, COUNT(*) FROM employment_contracts GROUP BY staff_id, contract_type HAVING COUNT(*) > 1;"', { encoding: 'utf-8' });
  console.log("DUPLICATES:", output);

  const schema = execSync('npx wrangler d1 execute newmso-db --remote --command="SELECT name, type, sql FROM sqlite_master WHERE tbl_name=\'employment_contracts\';"', { encoding: 'utf-8' });
  console.log("SCHEMA:", schema);
} catch (err) {
  console.error("ERROR:", err.stdout || err.message);
}
