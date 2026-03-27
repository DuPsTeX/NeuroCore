// tests/run-all.js — Runs all test files sequentially
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log(`\nNeuroCore Test Suite — ${testFiles.length} test files\n${'='.repeat(50)}\n`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of testFiles) {
  const path = join(__dirname, file);
  try {
    console.log(`--- ${file} ---`);
    execSync(`node "${path}"`, { stdio: 'inherit', timeout: 30000 });
    passed++;
    console.log('');
  } catch (err) {
    failed++;
    failures.push(file);
    console.error(`FAILED: ${file}\n`);
  }
}

console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${testFiles.length} total`);
if (failures.length > 0) {
  console.log(`Failures: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll tests passed!');
