import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { createInterface } from 'readline';

/**
 * 检查是否在项目根目录（必须包含 package.json）
 */
function checkProjectRoot() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(chalk.red('❌ 错误: 当前目录不是项目根目录，未找到 package.json 文件'));
    console.error(chalk.gray('请在包含 package.json 的项目根目录下运行此命令'));
    process.exit(1);
  }
}

/**
 * 提示用户确认操作
 * @param {string} message 确认消息
 * @returns {Promise<boolean>} 用户确认结果
 */
function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * 初始化部署目录
 * @param {string} url Git 仓库 URL
 */
export async function initDeploy(url) {
  try {
    console.log(chalk.blue('🚀 初始化部署环境...'));
    
    // 检查项目根目录
    checkProjectRoot();
    
    const deployDir = join(process.cwd(), '.deploy');
    
    // 检查 .deploy 目录是否已存在
    if (existsSync(deployDir)) {
      console.log(chalk.yellow('⚠️  .deploy 目录已存在'));
      const confirmed = await askConfirmation('是否删除现有的 .deploy 目录并重新初始化？');
      
      if (!confirmed) {
        console.log(chalk.gray('操作已取消'));
        return;
      }
      
      console.log(chalk.blue('🗑️  删除现有的 .deploy 目录...'));
      try {
        // 使用 Node.js fs.rmSync 跨平台删除目录
        rmSync(deployDir, { recursive: true, force: true });
        console.log(chalk.green('✓ 现有 .deploy 目录已删除'));
      } catch (error) {
        console.error(chalk.red('❌ 删除 .deploy 目录失败:'));
        console.error(chalk.gray(error.message));
        process.exit(1);
      }
    }
    
    // 克隆仓库到 .deploy 目录
    console.log(chalk.blue(`📦 正在克隆仓库: ${url}`));
    console.log(chalk.gray(`目标目录: ${deployDir}`));
    
    try {
      execSync(`git clone "${url}" ".deploy"`, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log(chalk.green('✓ 部署仓库克隆完成'));
      console.log('');
      console.log(chalk.blue('📋 后续操作指引:'));
      console.log(chalk.gray('1. 构建您的项目: pnpm run build'));
      console.log(chalk.gray('2. 部署到远程仓库: wordma deploy push'));
      console.log(chalk.gray('3. 查看部署状态: wordma deploy status'));
      
    } catch (error) {
      console.error(chalk.red('❌ 克隆仓库失败:'));
      console.error(chalk.gray(error.message));
      console.error('');
      console.error(chalk.yellow('💡 请检查:'));
      console.error(chalk.gray('- Git 仓库 URL 是否正确'));
      console.error(chalk.gray('- 是否有访问该仓库的权限'));
      console.error(chalk.gray('- 网络连接是否正常'));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ 初始化部署环境失败:'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}

/**
 * 删除部署目录
 */
export async function deleteDeploy() {
  try {
    console.log(chalk.blue('🗑️  删除部署环境...'));
    
    // 检查项目根目录
    checkProjectRoot();
    
    const deployDir = join(process.cwd(), '.deploy');
    
    // 检查 .deploy 目录是否存在
    if (!existsSync(deployDir)) {
      console.log(chalk.yellow('⚠️  .deploy 目录不存在，无需删除'));
      return;
    }
    
    // 提示用户确认删除操作
    console.log(chalk.yellow('⚠️  此操作将删除整个 .deploy 目录及其所有内容'));
    console.log(chalk.gray('删除后需要重新运行 "wordma deploy init <url>" 来初始化部署目录'));
    const confirmed = await askConfirmation('确定要删除 .deploy 目录吗？');
    
    if (!confirmed) {
      console.log(chalk.gray('操作已取消'));
      return;
    }
    
    // 删除 .deploy 目录
    console.log(chalk.blue('🗑️  正在删除 .deploy 目录...'));
    try {
      rmSync(deployDir, { recursive: true, force: true });
      console.log(chalk.green('✓ .deploy 目录已成功删除'));
      console.log('');
      console.log(chalk.blue('📋 后续操作指引:'));
      console.log(chalk.gray('重新初始化部署目录: wordma deploy init <git-repo-url>'));
    } catch (error) {
      console.error(chalk.red('❌ 删除 .deploy 目录失败:'));
      console.error(chalk.gray(error.message));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ 删除部署环境失败:'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}