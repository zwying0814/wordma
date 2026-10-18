export type DeployProvider = 'local-folder' | 'github-pages';

/** 发布配置（存 settings：deploy:{siteId}） */
export type DeployConfig = {
  provider: DeployProvider;
  /** 站点公开地址：渲染 baseUrl 用它（末尾斜杠会被补齐；留空按 '/' 处理） */
  siteUrl?: string;
  /** 本地文件夹导出的目标目录 */
  folder?: string;
  /** GitHub Pages（T24） */
  repo?: string;
  branch?: string;
};

export type DeployProgress = {
  stage: 'render' | 'upload';
  message: string;
  current?: number;
  total?: number;
};

export type DeployResult = {
  provider: DeployProvider;
  /** 发布构建产物目录（dist-publish/{siteId}） */
  outputDir: string;
  /** 产物文件数 */
  files: number;
  /** 本次发布的目标描述（本地文件夹路径 / 仓库分支） */
  target: string;
};

export type Deployer = {
  provider: DeployProvider;
  deploy(input: {
    outputDir: string;
    config: DeployConfig;
    onProgress?: (progress: DeployProgress) => void;
  }): Promise<DeployResult>;
};
