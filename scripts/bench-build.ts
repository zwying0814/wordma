import { runBuildBenchmark } from '../packages/engine/src/benchmark';

function readNumber(
  flag: string,
  fallback: number,
): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;

  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} 需要正整数`);
  }

  return value;
}

const posts = readNumber('--posts', 100);
const repeats = readNumber('--repeats', 3);
const keepWorkspace = process.argv.includes('--keep');
const strict = process.argv.includes('--strict');

const result = await runBuildBenchmark({
  posts,
  repeats,
  keepWorkspace,
});

console.log(JSON.stringify(result, null, 2));

for (const warning of result.warnings) {
  console.error(`warning: ${warning}`);
}

if (strict && result.warnings.length > 0) {
  process.exit(1);
}
