#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const TAURI_DIR = path.join(REPO_ROOT, 'apps/desktop/src-tauri');

export const REQUIRED_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
];

const FORBIDDEN_PREFIXES = [
  'com.apple.security.network.',
  'com.apple.security.files.',
  'com.apple.security.device.',
];

export function parseCodesignDisplay(output) {
  const flagsMatch = output.match(
    /flags=0x[0-9a-f]+\(([^)]*)\)/i,
  );
  const flags = new Set(
    flagsMatch
      ? flagsMatch[1]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
  );

  return {
    flags,
    signature:
      output.match(/^Signature=(.+)$/m)?.[1].trim() ?? null,
    identifier:
      output.match(/^Identifier=(.+)$/m)?.[1].trim() ?? null,
    teamIdentifier:
      output.match(/^TeamIdentifier=(.+)$/m)?.[1].trim() ?? null,
  };
}

export function isRealSignature(info) {
  return Boolean(
    info.signature &&
      info.signature !== 'adhoc' &&
      !info.flags.has('adhoc') &&
      !info.flags.has('linker-signed'),
  );
}

export function parseEntitlements(xml) {
  const values = new Map();
  const pattern =
    /<key>([^<]+)<\/key>\s*<(true|false)\s*\/?>/g;
  let match;

  while ((match = pattern.exec(xml)) !== null) {
    values.set(match[1], match[2] === 'true');
  }

  return values;
}

export function entitlementErrors(entitlements) {
  const errors = [];

  for (const key of REQUIRED_ENTITLEMENTS) {
    if (entitlements.get(key) !== true) {
      errors.push(`缺少 entitlement: ${key}`);
    }
  }

  for (const [key, enabled] of entitlements) {
    if (
      enabled &&
      FORBIDDEN_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      errors.push(`不应申请的 entitlement: ${key}`);
    }
  }

  return errors;
}

export function findArtifacts(bundleDir) {
  const macosDir = path.join(bundleDir, 'macos');
  const dmgDir = path.join(bundleDir, 'dmg');

  let app = null;
  if (existsSync(macosDir)) {
    const names = readdirSync(macosDir)
      .filter((name) => name.endsWith('.app'))
      .sort();
    const name = names.find((value) => value === 'Wordma.app') ?? names[0];
    if (name) app = path.join(macosDir, name);
  }

  let dmg = null;
  if (existsSync(dmgDir)) {
    const names = readdirSync(dmgDir)
      .filter((name) => name.endsWith('.dmg'))
      .sort();
    if (names.length > 0) {
      dmg = path.join(dmgDir, names[names.length - 1]);
    }
  }

  return { app, dmg };
}

export function findNativeModules(appPath) {
  const root = path.join(
    appPath,
    'Contents/Resources/engine',
  );
  const modules = [];

  if (!existsSync(root)) return modules;

  const walk = (directory) => {
    for (const entry of readdirSync(directory, {
      withFileTypes: true,
    })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.node')) {
        modules.push(fullPath);
      }
    }
  };

  walk(root);
  return modules;
}

export function defaultBundleDir(target) {
  return path.join(
    TAURI_DIR,
    'target',
    ...(target ? [target] : []),
    'release/bundle',
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function usage() {
  return [
    'Usage: node scripts/verify-macos-release.mjs [options]',
    '',
    'Options:',
    '  --target <triple>   Verify target/<triple>/release/bundle',
    '  --bundle-dir <dir>  Verify an explicit bundle directory',
    '  --app <path>        Verify an explicit .app bundle',
    '  --dmg <path>        Verify an explicit .dmg',
    '  --notarized         Require Gatekeeper acceptance and stapled notarization',
    '  --allow-unsigned    Structure-only audit for local unsigned builds',
    '  --help              Show this message',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    target: null,
    bundleDir: null,
    app: null,
    dmg: null,
    notarized: false,
    allowUnsigned: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case '--target':
        options.target = argv[++index];
        break;
      case '--bundle-dir':
        options.bundleDir = argv[++index];
        break;
      case '--app':
        options.app = argv[++index];
        break;
      case '--dmg':
        options.dmg = argv[++index];
        break;
      case '--notarized':
        options.notarized = true;
        break;
      case '--allow-unsigned':
        options.allowUnsigned = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`未知参数: ${value}`);
    }
  }

  return options;
}

function assertValue(value, flag) {
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

function readPlistValue(plistPath, key) {
  const result = run('plutil', [
    '-extract',
    key,
    'raw',
    '-o',
    '-',
    plistPath,
  ]);
  return result.ok ? result.output : null;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.target) {
      options.target = assertValue(options.target, '--target');
    }
    if (options.bundleDir) {
      options.bundleDir = assertValue(options.bundleDir, '--bundle-dir');
    }
    if (options.app) {
      options.app = assertValue(options.app, '--app');
    }
    if (options.dmg) {
      options.dmg = assertValue(options.dmg, '--dmg');
    }
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  if (process.platform !== 'darwin') {
    console.error('macOS 产物只能在 macOS 上验证');
    process.exit(2);
  }

  const bundleDir =
    options.bundleDir ?? defaultBundleDir(options.target);
  const discovered = findArtifacts(bundleDir);
  const appPath = options.app ?? discovered.app;
  const dmgPath = options.dmg ?? discovered.dmg;
  const failures = [];
  const warnings = [];

  const check = (ok, label, detail = '') => {
    if (ok) {
      console.log(`PASS ${label}`);
      return true;
    }
    failures.push(detail ? `${label}: ${detail}` : label);
    console.log(`FAIL ${label}${detail ? ` (${detail})` : ''}`);
    return false;
  };

  if (!check(Boolean(appPath), 'app bundle 存在', bundleDir)) {
    process.exit(1);
  }

  if (!check(existsSync(appPath), 'app bundle 路径有效', appPath)) {
    process.exit(1);
  }

  const contents = path.join(appPath, 'Contents');
  const infoPlist = path.join(contents, 'Info.plist');
  const mainBinary = path.join(contents, 'MacOS/desktop');
  const sidecar = path.join(contents, 'MacOS/bun');
  const packageJson = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  );
  const tauriConfig = JSON.parse(
    readFileSync(
      path.join(TAURI_DIR, 'tauri.conf.json'),
      'utf8',
    ),
  );

  check(existsSync(infoPlist), 'Info.plist 存在');
  check(existsSync(mainBinary), '主程序存在');
  check(existsSync(sidecar), 'Bun sidecar 存在');

  const version = readPlistValue(
    infoPlist,
    'CFBundleShortVersionString',
  );
  check(
    version === packageJson.version,
    'Info.plist 版本与根版本一致',
    `Info.plist=${version} root=${packageJson.version}`,
  );

  const identifier = readPlistValue(infoPlist, 'CFBundleIdentifier');
  check(
    identifier === tauriConfig.identifier,
    'bundle identifier 一致',
    `Info.plist=${identifier} config=${tauriConfig.identifier}`,
  );

  const display = run('codesign', [
    '-dv',
    '--verbose=4',
    appPath,
  ]);
  const info = parseCodesignDisplay(display.output);
  const signed = isRealSignature(info);
  const adhoc = !signed && (info.signature === 'adhoc' || info.flags.has('adhoc'));

  if (!signed && !options.allowUnsigned) {
    failures.push('app 未使用 Developer ID 签名');
    console.log('FAIL app 未使用 Developer ID 签名');
  } else if (!signed) {
    warnings.push(
      `app 未签名或为 ad-hoc 签名（${info.signature ?? '无签名'}），仅做结构审计`,
    );
  }

  if (signed || (adhoc && options.allowUnsigned)) {
    check(
      info.flags.has('runtime'),
      'app 启用 Hardened Runtime',
      [...info.flags].join(',') || 'no flags',
    );

    const verify = run('codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      appPath,
    ]);
    check(verify.ok, 'app 签名校验通过', verify.output);

    const entitlementsResult = run('codesign', [
      '-d',
      '--entitlements',
      ':-',
      appPath,
    ]);
    const entitlements = parseEntitlements(
      entitlementsResult.output,
    );
    const errors = entitlementErrors(entitlements);

    for (const key of REQUIRED_ENTITLEMENTS) {
      check(
        entitlements.get(key) === true,
        `entitlement ${key}`,
      );
    }
    for (const error of errors) {
      if (!error.startsWith('缺少 entitlement')) {
        failures.push(error);
        console.log(`FAIL ${error}`);
      }
    }

    const sidecarVerify = run('codesign', [
      '--verify',
      '--strict',
      '--verbose=2',
      sidecar,
    ]);
    check(sidecarVerify.ok, 'Bun sidecar 签名有效', sidecarVerify.output);

    const sidecarInfo = parseCodesignDisplay(
      run('codesign', ['-dv', '--verbose=4', sidecar]).output,
    );
    check(
      sidecarInfo.flags.has('runtime'),
      'Bun sidecar 启用 Hardened Runtime',
      [...sidecarInfo.flags].join(',') || 'no flags',
    );

    if (signed) {
      check(
        Boolean(info.teamIdentifier) &&
          sidecarInfo.teamIdentifier === info.teamIdentifier,
        'Bun sidecar 与 app 使用同一 Team ID',
        `app=${info.teamIdentifier ?? 'none'} sidecar=${sidecarInfo.teamIdentifier ?? 'none'}`,
      );
    }

    const sidecarEntitlements =
      run('codesign', [
        '-d',
        '--entitlements',
        ':-',
        sidecar,
      ]);
    const sidecarValues = parseEntitlements(
      sidecarEntitlements.output,
    );
    for (const key of REQUIRED_ENTITLEMENTS) {
      check(
        sidecarValues.get(key) === true,
        `Bun sidecar entitlement ${key}`,
      );
    }

    const nativeModules = findNativeModules(appPath);
    if (nativeModules.length > 0) {
      const untrusted = nativeModules.filter((module) => {
        const moduleInfo = parseCodesignDisplay(
          run('codesign', ['-dv', '--verbose=4', module]).output,
        );
        return !isRealSignature(moduleInfo);
      });

      if (untrusted.length > 0) {
        check(
          entitlements.get(
            'com.apple.security.cs.disable-library-validation',
          ) === true,
          '未签名原生模块由 disable-library-validation 覆盖',
          `${untrusted.length}/${nativeModules.length} 个非 Developer ID 签名`,
        );
      }
    }

    if (!signed) {
      warnings.push('ad-hoc 构建跳过 DMG 签名校验');
    } else if (dmgPath) {
      const dmgVerify = run('codesign', [
        '--verify',
        '--strict',
        dmgPath,
      ]);
      check(dmgVerify.ok, 'DMG 签名有效', dmgVerify.output);
    } else {
      warnings.push('未找到 DMG 产物');
      console.log('WARN 未找到 DMG 产物');
    }
  }

  if (options.notarized) {
    if (!signed) {
      failures.push('公证校验需要 Developer ID 签名');
      console.log('FAIL 公证校验需要 Developer ID 签名');
    } else {
      const assess = run('spctl', [
        '--assess',
        '--type',
        'execute',
        '--verbose=4',
        appPath,
      ]);
      check(
        assess.ok && /accepted/i.test(assess.output),
        'Gatekeeper 接受 app',
        assess.output,
      );

      const staple = run('xcrun', [
        'stapler',
        'validate',
        appPath,
      ]);
      check(staple.ok, 'app 已完成 staple', staple.output);
    }
  }

  if (adhoc) {
    warnings.push('ad-hoc 签名仍需要用户手动放行，不能替代公证');
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} 项校验失败`);
    for (const warning of warnings) console.error(`警告: ${warning}`);
    process.exit(1);
  }

  for (const warning of warnings) console.log(`WARN ${warning}`);
  console.log('\nmacOS 产物校验通过');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
