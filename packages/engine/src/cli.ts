#!/usr/bin/env bun
import { ENGINE_VERSION } from './index';

const help = `wordma-engine ${ENGINE_VERSION}

用法:
  wordma-engine <command> [options]

命令:
  build     构建静态站点（尚未实现）
  dev       启动开发服务器（尚未实现）
  inspect   输出站点和主题的 schema 信息（M0.8）

选项:
  -h, --help      显示帮助
  -v, --version   显示版本
`;

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`wordma-engine ${ENGINE_VERSION}`);
  process.exit(0);
}

const command = args[0];

console.error(`未知命令：${command ?? '(空)'}`);
console.error(help);
process.exit(1);
