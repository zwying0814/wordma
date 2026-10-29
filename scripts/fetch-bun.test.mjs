import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  computeSha256,
  loadBunConfig,
  validateBinaryArchitecture,
  verifyExistingSidecar,
  verifyIntegrity,
} from '../apps/desktop/scripts/fetch-bun.mjs';

function sha512Integrity(data) {
  return `sha512-${createHash('sha512')
    .update(data)
    .digest('base64')}`;
}

function macho(cpu) {
  const data = Buffer.alloc(32);
  data.writeUInt32LE(0xfeedfacf, 0);
  data.writeUInt32LE(cpu, 4);
  return data;
}

function elf(machine) {
  const data = Buffer.alloc(64);
  data[0] = 0x7f;
  data[1] = 0x45;
  data[2] = 0x4c;
  data[3] = 0x46;
  data[4] = 2;
  data.writeUInt16LE(machine, 18);
  return data;
}

function pe(machine) {
  const data = Buffer.alloc(0x100);
  data.write('MZ', 0, 'ascii');
  data.writeUInt32LE(0x80, 0x3c);
  data.write('PE\0\0', 0x80, 'ascii');
  data.writeUInt16LE(machine, 0x84);
  return data;
}

test('bun-version.json 固定版本、registry 与 integrity', () => {
  const config = loadBunConfig();

  assert.equal(config.version, '1.4.4');
  assert.ok(config.registry.startsWith('https://'));
  assert.equal(Object.keys(config.targets).length, 5);

  for (const target of Object.values(config.targets)) {
    assert.match(target.package, /^bun-/);
    assert.match(target.integrity, /^sha512-/);
  }
});

test('verifyIntegrity 识别篡改', () => {
  const data = Buffer.from('wordma-bun');
  const integrity = sha512Integrity(data);

  assert.equal(verifyIntegrity(data, integrity), true);
  assert.equal(
    verifyIntegrity(Buffer.from('tampered'), integrity),
    false,
  );
});

test('校验 Mach-O / ELF / PE 架构', () => {
  validateBinaryArchitecture(
    macho(0x0100000c),
    'aarch64-apple-darwin',
  );
  validateBinaryArchitecture(
    macho(0x01000007),
    'x86_64-apple-darwin',
  );
  assert.throws(
    () =>
      validateBinaryArchitecture(
        macho(0x01000007),
        'aarch64-apple-darwin',
      ),
    /架构不匹配/,
  );

  validateBinaryArchitecture(
    elf(62),
    'x86_64-unknown-linux-gnu',
  );
  validateBinaryArchitecture(
    elf(183),
    'aarch64-unknown-linux-gnu',
  );
  assert.throws(
    () =>
      validateBinaryArchitecture(
        elf(62),
        'aarch64-unknown-linux-gnu',
      ),
    /架构不匹配/,
  );

  validateBinaryArchitecture(
    pe(0x8664),
    'x86_64-pc-windows-msvc',
  );
  assert.throws(
    () =>
      validateBinaryArchitecture(
        pe(0xaa64),
        'x86_64-pc-windows-msvc',
      ),
    /架构不匹配/,
  );
  assert.throws(
    () =>
      validateBinaryArchitecture(
        Buffer.from('not-a-binary'),
        'aarch64-apple-darwin',
      ),
    /Mach-O/,
  );
});

test('已有 sidecar 必须匹配版本、integrity 与二进制 hash', () => {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-bun-marker-'),
  );
  const binary = path.join(root, 'bun-test');
  const marker = `${binary}.verified.json`;
  const data = Buffer.from('fake-bun-binary');
  const expected = {
    version: '1.4.4',
    target: 'aarch64-apple-darwin',
    package: 'bun-darwin-aarch64',
    integrity: 'sha512-test',
  };
  const markerValue = {
    ...expected,
    sha256: computeSha256(data),
    size: data.length,
  };

  try {
    writeFileSync(binary, data);
    writeFileSync(marker, JSON.stringify(markerValue));

    assert.equal(
      verifyExistingSidecar(binary, marker, expected),
      true,
    );

    writeFileSync(binary, Buffer.from('tampered'));
    assert.equal(
      verifyExistingSidecar(binary, marker, expected),
      false,
    );

    writeFileSync(binary, data);
    assert.equal(
      verifyExistingSidecar(binary, marker, {
        ...expected,
        version: '9.9.9',
      }),
      false,
    );
    assert.equal(
      verifyExistingSidecar(
        binary,
        `${marker}.missing`,
        expected,
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('配置 integrity 与下载的缓存文件可复算', () => {
  const config = loadBunConfig();
  const archive = process.env.WORDMA_BUN_TARBALL;

  if (!archive) return;

  const data = readFileSync(archive);
  for (const target of Object.values(config.targets)) {
    if (verifyIntegrity(data, target.integrity)) return;
  }

  assert.fail('缓存 tarball 与任何目标 integrity 不匹配');
});
