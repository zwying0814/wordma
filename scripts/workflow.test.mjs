import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');

function loadWorkflow(name) {
  return parse(
    readFileSync(path.join(root, '.github/workflows', name), 'utf8'),
  );
}

function steps(job) {
  return job.steps ?? [];
}

function runScript(job) {
  return steps(job)
    .map((step) => step.run ?? '')
    .join('\n');
}

function uses(job) {
  return steps(job).map((step) => step.uses ?? '');
}

test('CI 触发 next/dev 的 push 与 pull request', () => {
  const ci = loadWorkflow('ci.yml');

  assert.deepEqual(ci.on.push.branches, ['next', 'dev']);
  assert.ok(ci.on.pull_request !== undefined);
});

test('CI 覆盖 contracts、desktop、Rust 与 engine 资源 job', () => {
  const ci = loadWorkflow('ci.yml');

  for (const id of ['contracts', 'desktop', 'rust', 'engine-resources']) {
    assert.ok(ci.jobs[id], `缺少 ${id} job`);
    assert.ok(
      ci.jobs[id]['timeout-minutes'] > 0,
      `${id} job 缺少超时限制`,
    );
  }

  const contracts = runScript(ci.jobs.contracts);
  assert.match(contracts, /pnpm version:check/);
  assert.match(contracts, /pnpm typecheck/);
  assert.match(contracts, /pnpm test:contracts/);
  assert.match(contracts, /pnpm schema:check/);
  assert.match(contracts, /fetch:bun -- --check/);

  const desktop = ci.jobs.desktop;
  assert.match(runScript(desktop), /pnpm --filter desktop typecheck/);
  assert.match(runScript(desktop), /pnpm --filter desktop test/);
  assert.match(runScript(desktop), /pnpm test:e2e/);
  assert.ok(
    steps(desktop).some((step) =>
      /playwright install.*chromium/.test(step.run ?? ''),
    ),
    'desktop job 必须安装 Playwright Chromium',
  );
  const artifact = steps(desktop).find((step) =>
    (step.uses ?? '').startsWith('actions/upload-artifact'),
  );
  assert.equal(artifact?.if, 'failure()');
  assert.match(String(artifact?.with?.path), /test-results/);
  assert.match(String(artifact?.with?.path), /playwright-report/);

  const rust = ci.jobs.rust;
  assert.deepEqual(rust.strategy.matrix.os, [
    'ubuntu-latest',
    'macos-latest',
  ]);
  assert.match(runScript(rust), /cargo test/);
  assert.ok(
    uses(rust).some((value) => value.startsWith('swatinem/rust-cache')),
    'rust job 必须缓存 Rust 构建',
  );
  assert.ok(
    steps(rust).some((step) =>
      /libwebkit2gtk-4\.1-dev/.test(step.run ?? ''),
    ),
    'rust job 必须安装 Linux 系统依赖',
  );

  const engine = runScript(ci.jobs['engine-resources']);
  assert.match(engine, /pnpm engine:stage/);
  assert.match(engine, /pnpm engine:smoke/);
});

test('CI 构建并校验 Linux deb/AppImage', () => {
  const ci = loadWorkflow('ci.yml');
  const job = ci.jobs['linux-bundles'];

  assert.ok(job, '缺少 linux-bundles job');
  assert.equal(job['runs-on'], 'ubuntu-22.04');
  assert.ok(job['timeout-minutes'] > 0);

  const script = runScript(job);
  assert.match(script, /tauri build --bundles deb,appimage/);
  assert.match(script, /verify-desktop-bundles\.mjs/);
  assert.match(script, /--platform linux/);
  assert.match(script, /bundle-artifacts\.mjs checksum/);

  assert.ok(
    steps(job).some((step) =>
      /swatinem\/rust-cache/.test(step.uses ?? ''),
    ),
    'linux-bundles 缺少 Rust 缓存',
  );
  assert.ok(
    steps(job).some((step) =>
      /libwebkit2gtk-4\.1-dev/.test(step.run ?? ''),
    ),
    'linux-bundles 缺少 Linux 系统依赖',
  );
  const cacheSteps = steps(job).filter((step) =>
    (step.uses ?? '').startsWith('actions/cache'),
  );
  assert.ok(
    cacheSteps.some((step) =>
      /binaries/.test(String(step.with?.path)),
    ),
    'linux-bundles 缺少 Bun sidecar 缓存',
  );
});

test('CI 缓存 pnpm、Bun sidecar 与 Playwright 浏览器', () => {
  const ci = loadWorkflow('ci.yml');

  for (const id of ['contracts', 'desktop', 'engine-resources']) {
    const cacheSteps = steps(ci.jobs[id]).filter((step) =>
      (step.uses ?? '').startsWith('actions/cache'),
    );

    if (id !== 'desktop') {
      assert.ok(
        cacheSteps.some((step) =>
          /binaries/.test(String(step.with?.path)),
        ),
        `${id} job 缺少 Bun sidecar 缓存`,
      );
    }
  }

  const desktopCaches = steps(ci.jobs.desktop).filter((step) =>
    (step.uses ?? '').startsWith('actions/cache'),
  );
  assert.ok(
    desktopCaches.some((step) =>
      /ms-playwright/.test(String(step.with?.path)),
    ),
    'desktop job 缺少 Playwright 浏览器缓存',
  );

  for (const id of ['contracts', 'desktop', 'engine-resources']) {
    const setupNode = steps(ci.jobs[id]).find((step) =>
      (step.uses ?? '').startsWith('actions/setup-node'),
    );
    assert.equal(
      setupNode?.with?.cache,
      'pnpm',
      `${id} job 缺少 pnpm 缓存`,
    );
  }
});

test('release 在构建前执行 checks，并让构建矩阵依赖它', () => {
  const release = loadWorkflow('release.yml');
  const checks = release.jobs.checks;

  assert.ok(checks, '缺少 checks job');
  assert.equal(release.jobs['publish-tauri'].needs, 'checks');
  assert.ok(checks['timeout-minutes'] > 0);

  const script = runScript(checks);
  for (const command of [
    'pnpm version:check',
    'pnpm typecheck',
    'pnpm test:scripts',
    'pnpm test:contracts',
    'pnpm --filter desktop test',
    'pnpm test:e2e',
    'pnpm engine:stage',
    'pnpm engine:smoke',
  ]) {
    assert.ok(
      script.includes(command),
      `checks job 缺少 ${command}`,
    );
  }

  assert.match(
    script,
    /test "v\$VERSION" = "\$GITHUB_REF_NAME"/,
    'release 必须在构建前校验 tag 与版本一致',
  );

  const artifact = steps(checks).find((step) =>
    (step.uses ?? '').startsWith('actions/upload-artifact'),
  );
  assert.equal(artifact?.if, 'failure()');
});

test('release 构建矩阵使用固定 Bun target 与 draft 发布', () => {
  const release = loadWorkflow('release.yml');
  const publish = release.jobs['publish-tauri'];

  assert.deepEqual(
    publish.strategy.matrix.include.map((entry) => entry.bun_target),
    [
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'x86_64-unknown-linux-gnu',
      'x86_64-pc-windows-msvc',
    ],
  );

  for (const entry of publish.strategy.matrix.include) {
    assert.match(entry.bundle_dir, /release\/bundle$/);
    assert.match(
      entry.artifact_suffix,
      /^(macos-aarch64|macos-x64|linux-x64|windows-x64)$/,
    );
  }

  for (const step of steps(publish)) {
    if (!/fetch:bun/.test(step.run ?? '')) continue;
    assert.match(step.run, /\$\{\{ matrix\.bun_target \}\}/);
  }

  const tauri = steps(publish).find((step) =>
    (step.uses ?? '').startsWith('tauri-apps/tauri-action'),
  );
  assert.ok(tauri, '缺少 tauri-action 步骤');
  assert.equal(tauri.with.releaseDraft, true);
  assert.equal(tauri.with.tagName, 'v__VERSION__');
  assert.equal(tauri.with.projectPath, 'apps/desktop');
});

test('release 按需注入 Apple 凭据并校验 macOS 产物', () => {
  const release = loadWorkflow('release.yml');
  const publish = release.jobs['publish-tauri'];

  const configure = steps(publish).find(
    (step) => step.name === 'Configure Apple signing',
  );
  assert.ok(configure, '缺少 Apple 签名配置步骤');
  assert.equal(
    configure.if,
    "startsWith(matrix.platform, 'macos')",
  );

  for (const key of [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_ID',
    'APPLE_PASSWORD',
    'APPLE_TEAM_ID',
    'APPLE_API_KEY',
    'APPLE_API_ISSUER',
    'APPLE_API_KEY_PATH',
  ]) {
    assert.ok(
      Object.hasOwn(configure.env, key),
      `签名配置步骤缺少 ${key}`,
    );
  }

  assert.match(configure.run, /\$\{!name\}/);
  assert.match(configure.run, /-n "\$value"/);
  assert.match(configure.run, /GITHUB_ENV/);

  const tauri = steps(publish).find((step) =>
    (step.uses ?? '').startsWith('tauri-apps/tauri-action'),
  );
  assert.deepEqual(Object.keys(tauri.env), ['GITHUB_TOKEN']);

  const verify = steps(publish).find(
    (step) => step.name === 'Verify macOS artifacts',
  );
  assert.ok(verify, '缺少 macOS 产物校验步骤');
  assert.equal(
    verify.if,
    "startsWith(matrix.platform, 'macos')",
  );
  assert.match(verify.run, /verify-macos-release\.mjs/);
  assert.match(verify.run, /--notarized/);
  assert.match(verify.run, /--allow-unsigned/);
  assert.match(verify.run, /matrix\.bun_target/);
});

test('release 校验 Linux / Windows 安装包并上传 checksum', () => {
  const release = loadWorkflow('release.yml');
  const publish = release.jobs['publish-tauri'];

  const verify = steps(publish).find(
    (step) => step.name === 'Verify Linux / Windows installers',
  );
  assert.ok(verify, '缺少 Linux / Windows 安装包校验');
  assert.equal(
    verify.if,
    "${{ !startsWith(matrix.platform, 'macos') }}",
  );
  assert.equal(verify.shell, 'bash');
  assert.match(verify.run, /verify-desktop-bundles\.mjs/);
  assert.match(verify.run, /matrix\.bundle_dir/);
  assert.match(verify.run, /matrix\.bun_target/);

  const checksum = steps(publish).find(
    (step) => step.name === 'Generate checksums',
  );
  assert.ok(checksum, '缺少 checksum 生成步骤');
  assert.equal(checksum.shell, 'bash');
  assert.match(checksum.run, /bundle-artifacts\.mjs checksum/);
  assert.match(checksum.run, /matrix\.bundle_dir/);
  assert.match(checksum.run, /artifact_suffix/);

  const upload = steps(publish).find(
    (step) => step.name === 'Upload checksums',
  );
  assert.ok(upload, '缺少 checksum 上传步骤');
  assert.equal(upload.shell, 'bash');
  assert.match(upload.run, /gh release upload/);
  assert.match(upload.run, /--clobber/);
  assert.equal(
    upload.env.GH_TOKEN,
    '${{ secrets.GITHUB_TOKEN }}',
  );
});
