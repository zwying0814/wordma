#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { addTheme, devTheme, buildTheme, updateTheme } from './commands/theme.js';
import { initDeploy, deleteDeploy } from './commands/deploy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 读取项目根目录的 package.json 文件
 * @returns {Object} package.json 内容
 */
function getProjectPackageJson() {
  try {
    // 从 CLI 包位置向上查找项目根目录的 package.json
    const projectRoot = join(__dirname, '../../../');
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson;
  } catch (error) {
    console.error(chalk.red('错误: 无法读取项目 package.json 文件'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}

/**
 * 显示版本信息
 */
function showVersion() {
  const packageJson = getProjectPackageJson();
  
  console.log(chalk.blue.bold('Wordma 博客系统'));
  console.log(chalk.green(`版本: ${packageJson.version}`));
  console.log(chalk.gray(`项目名称: ${packageJson.name}`));
  console.log(chalk.gray(`描述: ${packageJson.description}`));
}

// 创建 CLI 程序
const program = new Command();

program
  .name('wordma')
  .description('Wordma 博客系统 CLI 工具')
  .version('1.0.0', '-v, --version', 'output the version number');

// 版本命令
program
  .command('version')
  .description('显示当前项目版本信息')
  .action(showVersion);

// 主题管理命令
const themeCommand = program
  .command('theme')
  .description('主题管理工具');

// 添加主题
themeCommand
  .command('add <url>')
  .description('从Git URL添加主题到themes文件夹')
  .action(addTheme);

// 开发主题
themeCommand
  .command('dev <name>')
  .description('启动指定主题的开发模式')
  .action(devTheme);

// 构建主题
themeCommand
  .command('build <name>')
  .description('构建指定主题')
  .action(buildTheme);

// 更新主题
themeCommand
  .command('update <name>')
  .description('更新指定主题到最新版本')
  .action(updateTheme);



// 部署管理命令
const deployCommand = program
  .command('deploy')
  .description('部署管理工具');

// deploy init 子命令
deployCommand
  .command('init <url>')
  .description('初始化或重新创建 .deploy 目录，通过克隆指定的 Git 仓库')
  .action(initDeploy);

// deploy delete 子命令
deployCommand
  .command('delete')
  .description('删除 .deploy 目录及其所有内容')
  .action(deleteDeploy);



// 解析命令行参数
program.parse(process.argv);

// 如果没有提供任何命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export default program;