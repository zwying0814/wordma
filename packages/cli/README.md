# Wordma CLI 工具

这是 Wordma 博客系统的命令行工具，提供项目管理和版本查询功能。

## 功能特性

- ✅ 版本查询：显示当前项目的版本信息
- 🔧 项目管理：未来将支持更多项目管理功能

## 安装方法

### 方法一：全局安装（推荐）

在项目根目录执行：

```bash
# 安装依赖并全局链接 CLI 工具
pnpm run cli:install

# 现在可以在任何地方使用 wordma 命令
wordma version
```

### 方法二：直接运行

在项目根目录执行：

```bash
# 直接运行 CLI 工具
pnpm wordma version

# 或者直接使用 node
node packages/cli/bin/wordma.js version
```

## 使用方法

### 查看版本信息

```bash
wordma version
```

输出示例：
```
Wordma 博客系统
版本: 1.0.0
项目名称: wordma
描述: 基于 PNPM Monorepo 架构的现代化多主题静态博客系统
```

### 查看帮助信息

```bash
wordma --help
```

## 测试方案

### 1. 基础功能测试

#### 测试步骤：

1. **安装依赖**
   ```bash
   cd packages/cli
   pnpm install
   ```

2. **测试版本命令（方法一：直接运行）**
   ```bash
   cd ../../  # 回到项目根目录
   node packages/cli/bin/wordma.js version
   ```
   
   **期望输出：**
   ```
   Wordma 博客系统
   版本: 1.0.0
   项目名称: wordma
   描述: 基于 PNPM Monorepo 架构的现代化多主题静态博客系统
   ```

3. **测试版本命令（方法二：通过 pnpm script）**
   ```bash
   pnpm wordma version
   ```
   
   **期望输出：** 同上

4. **测试帮助命令**
   ```bash
   node packages/cli/bin/wordma.js --help
   ```
   
   **期望输出：**
   ```
   Usage: wordma [options] [command]
   
   Wordma 博客系统 CLI 工具
   
   Options:
     -V, --version   display version number
     -h, --help      display help for command
   
   Commands:
     version         显示当前项目版本信息
     help [command]  display help for command
   ```

### 2. 全局安装测试

#### 测试步骤：

1. **全局安装 CLI 工具**
   ```bash
   pnpm run cli:install
   ```

2. **测试全局命令**
   ```bash
   wordma version
   ```
   
   **期望输出：** 显示版本信息

3. **在其他目录测试**
   ```bash
   cd /tmp  # 或任意其他目录
   wordma version
   ```
   
   **期望结果：** 应该显示错误信息，因为不在项目目录中

4. **卸载测试**
   ```bash
   cd /path/to/wordma/project
   pnpm run cli:uninstall
   wordma version  # 应该提示命令不存在
   ```

### 3. 错误处理测试

#### 测试步骤：

1. **测试无效命令**
   ```bash
   node packages/cli/bin/wordma.js invalid-command
   ```
   
   **期望输出：** 显示帮助信息或错误提示

2. **测试损坏的 package.json**
   ```bash
   # 临时重命名 package.json
   mv package.json package.json.bak
   node packages/cli/bin/wordma.js version
   # 恢复 package.json
   mv package.json.bak package.json
   ```
   
   **期望输出：** 显示错误信息

### 4. 版本信息准确性测试

#### 测试步骤：

1. **修改项目版本**
   ```bash
   # 在 package.json 中将版本改为 1.0.1
   # 然后运行
   node packages/cli/bin/wordma.js version
   ```
   
   **期望输出：** 显示新版本 1.0.1

2. **恢复原版本**
   ```bash
   # 将版本改回 1.0.0
   ```

## 技术实现

- **框架**: Commander.js - 命令行参数解析
- **样式**: Chalk - 彩色输出
- **模块系统**: ES Modules
- **Node.js 版本**: >= 16.0.0

## 目录结构

```
packages/cli/
├── package.json          # CLI 包配置
├── README.md            # 文档
├── bin/
│   └── wordma.js        # 可执行入口文件
└── src/
    └── index.js         # 主程序逻辑
```

## 开发说明

- CLI 工具通过读取项目根目录的 `package.json` 获取版本信息
- 使用相对路径 `../../../package.json` 定位项目根目录
- 支持彩色输出，提升用户体验
- 错误处理完善，提供友好的错误信息