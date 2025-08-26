import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, renameSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 获取项目根目录路径
 * @returns {string} 项目根目录路径
 */
function getProjectRoot() {
  return join(__dirname, '../../../../');
}

/**
 * 获取themes目录路径
 * @returns {string} themes目录路径
 */
function getThemesDir() {
  return join(getProjectRoot(), 'themes');
}

/**
 * 确保themes目录存在
 */
function ensureThemesDir() {
  const themesDir = getThemesDir();
  if (!existsSync(themesDir)) {
    mkdirSync(themesDir, { recursive: true });
    console.log(chalk.green('✓ 创建themes目录'));
  }
}

/**
 * 从Git URL添加主题
 * @param {string} url - Git仓库URL
 */
export function addTheme(url) {
  try {
    console.log(chalk.blue('正在添加主题...'));
    
    // 确保themes目录存在
    ensureThemesDir();
    
    // 从URL提取主题名称
    const themeName = url.split('/').pop().replace('.git', '');
    const themeDir = join(getThemesDir(), themeName);
    
    // 检查主题是否已存在
    if (existsSync(themeDir)) {
      console.log(chalk.yellow(`⚠ 主题 "${themeName}" 已存在`));
      return;
    }
    
    // 克隆仓库
    console.log(chalk.gray(`克隆仓库: ${url}`));
    execSync(`git clone ${url} "${themeDir}"`, { stdio: 'inherit' });
    
    console.log(chalk.green(`✓ 主题 "${themeName}" 添加成功`));
    console.log(chalk.gray(`位置: ${themeDir}`));
    
  } catch (error) {
    console.error(chalk.red('✗ 添加主题失败:'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}

/**
 * 运行主题的开发命令
 * @param {string} name - 主题名称
 */
export function devTheme(name) {
  try {
    const themeDir = join(getThemesDir(), name);
    
    // 检查主题是否存在
    if (!existsSync(themeDir)) {
      console.error(chalk.red(`✗ 主题 "${name}" 不存在`));
      process.exit(1);
    }
    
    // 检查package.json是否存在
    const packageJsonPath = join(themeDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
      console.error(chalk.red(`✗ 主题 "${name}" 中没有找到package.json文件`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`正在启动主题 "${name}" 的开发模式...`));
    console.log(chalk.gray(`目录: ${themeDir}`));
    
    // 执行pnpm run dev
    execSync('pnpm run dev', { 
      cwd: themeDir, 
      stdio: 'inherit' 
    });
    
  } catch (error) {
    console.error(chalk.red('✗ 启动开发模式失败:'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}

/**
 * 构建主题
 * @param {string} name - 主题名称
 */
export function buildTheme(name) {
  try {
    const themeDir = join(getThemesDir(), name);
    
    // 检查主题是否存在
    if (!existsSync(themeDir)) {
      console.error(chalk.red(`✗ 主题 "${name}" 不存在`));
      process.exit(1);
    }
    
    // 检查package.json是否存在
    const packageJsonPath = join(themeDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
      console.error(chalk.red(`✗ 主题 "${name}" 中没有找到package.json文件`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`正在构建主题 "${name}"...`));
    console.log(chalk.gray(`目录: ${themeDir}`));
    
    // 执行pnpm run build
    execSync('pnpm run build', { 
      cwd: themeDir, 
      stdio: 'inherit' 
    });
    
    console.log(chalk.green(`✓ 主题 "${name}" 构建完成`));
    
    // 处理构建结果目录
    const projectRoot = getProjectRoot();
    const deployDir = join(projectRoot, '.deploy');
    const tempDir = join(deployDir, '.temp');
    const targetDir = join(deployDir, name);
    
    if (existsSync(tempDir)) {
      console.log(chalk.blue(`📦 正在处理构建结果...`));
      
      // 如果目标目录已存在，先删除
      if (existsSync(targetDir)) {
        console.log(chalk.yellow(`⚠️  删除现有的构建结果: ${name}`));
        rmSync(targetDir, { recursive: true, force: true });
      }
      
      // 将 .temp 重命名为主题名称
      renameSync(tempDir, targetDir);
      console.log(chalk.green(`✓ 构建结果已保存到: .deploy/${name}`));
    } else {
      console.log(chalk.yellow(`⚠️  未找到构建输出目录 .deploy/.temp`));
    }
    
  } catch (error) {
    console.error(chalk.red('✗ 构建主题失败:'));
    console.error(chalk.gray(error.message));
    process.exit(1);
  }
}

/**
 * 更新主题
 * @param {string} name - 主题名称
 */
export function updateTheme(name) {
  try {
    const themeDir = join(getThemesDir(), name);
    
    // 检查主题是否存在
    if (!existsSync(themeDir)) {
      console.error(chalk.red(`✗ 主题 "${name}" 不存在`));
      process.exit(1);
    }
    
    // 检查是否是git仓库
    const gitDir = join(themeDir, '.git');
    if (!existsSync(gitDir)) {
      console.error(chalk.red(`✗ 主题 "${name}" 不是Git仓库，无法更新`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`正在更新主题 "${name}"...`));
    console.log(chalk.gray(`目录: ${themeDir}`));
    
    // 拉取最新代码
    execSync('git pull origin main', { 
      cwd: themeDir, 
      stdio: 'inherit' 
    });
    
    console.log(chalk.green(`✓ 主题 "${name}" 更新完成`));
    
  } catch (error) {
    console.error(chalk.red('✗ 更新主题失败:'));
    console.error(chalk.gray(error.message));
    
    // 如果main分支不存在，尝试master分支
    if (error.message.includes('main')) {
      try {
        console.log(chalk.yellow('尝试使用master分支...'));
        execSync('git pull origin master', { 
          cwd: join(getThemesDir(), name), 
          stdio: 'inherit' 
        });
        console.log(chalk.green(`✓ 主题 "${name}" 更新完成`));
      } catch (masterError) {
        console.error(chalk.red('✗ 使用master分支也失败了'));
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
}

/**
 * 询问用户确认
 * @param {string} message 确认消息
 * @returns {Promise<boolean>} 用户是否确认
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
 * 递归复制目录
 * @param {string} srcDir 源目录
 * @param {string} destDir 目标目录
 */
function copyDirectory(srcDir, destDir) {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  const items = readdirSync(srcDir);
  
  for (const item of items) {
    const srcPath = join(srcDir, item);
    const destPath = join(destDir, item);
    
    if (statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      console.log(chalk.gray(`  ✓ 复制: ${item}`));
    }
  }
}