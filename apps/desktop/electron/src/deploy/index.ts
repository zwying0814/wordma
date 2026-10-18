import path from 'node:path';

import { getDataDir } from '../db';
import { renderSiteTo } from '../render';
import { getSetting, setSetting } from '../settings';
import { getSite } from '../site';
import { localFolderDeployer } from './local-folder';
import type { DeployConfig, Deployer, DeployProgress, DeployResult } from './types';

export type { DeployConfig, DeployProvider, DeployResult } from './types';

/** 已实现的发布方式（T24 追加 github-pages） */
const deployers: Record<string, Deployer> = {
  [localFolderDeployer.provider]: localFolderDeployer,
};

const KNOWN_PROVIDERS = ['local-folder', 'github-pages'];

function normalizeSiteUrl(siteUrl: string | undefined): string {
  const trimmed = (siteUrl ?? '').trim();
  if (!trimmed) return '/';

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('站点地址必须以 http:// 或 https:// 开头');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function getDeployConfig(siteId: number): DeployConfig | null {
  const raw = getSetting(`deploy:${siteId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DeployConfig;
  } catch {
    return null;
  }
}

/** 保存发布配置（严格校验，非法直接抛错） */
export function setDeployConfig(
  siteId: number,
  config: DeployConfig
): DeployConfig {
  if (!KNOWN_PROVIDERS.includes(config.provider)) {
    throw new Error(`不支持的发布方式：${config.provider}`);
  }

  const next: DeployConfig = { ...config };

  if (next.provider === 'local-folder' && !next.folder?.trim()) {
    throw new Error('本地文件夹发布需要填写目标文件夹');
  }
  if (next.provider === 'github-pages' && !next.repo?.trim()) {
    throw new Error('GitHub Pages 发布需要填写仓库（owner/name）');
  }

  // 校验站点地址格式（空表示部署在域名根目录）
  next.siteUrl = (next.siteUrl ?? '').trim();
  normalizeSiteUrl(next.siteUrl);

  setSetting(`deploy:${siteId}`, JSON.stringify(next));
  return next;
}

/** 发布构建产物目录（与预览目录分离） */
export function publishDir(siteId: number): string {
  return path.join(getDataDir(), 'dist-publish', String(siteId));
}

/**
 * 发布站点：用「排除草稿 + 站点地址」重新渲染，再交给对应 Deployer。
 * 与预览的关键差异：includeDrafts=false、baseUrl 是站点公开地址。
 */
export async function deploySite(
  siteId: number,
  onProgress?: (progress: DeployProgress) => void
): Promise<DeployResult> {
  const config = getDeployConfig(siteId);
  if (!config) {
    throw new Error('尚未配置发布方式，请先在设置页配置');
  }

  const deployer = deployers[config.provider];
  if (!deployer) {
    throw new Error(`发布方式「${config.provider}」尚未实现`);
  }

  const site = getSite(siteId);
  const outputDir = publishDir(siteId);

  onProgress?.({ stage: 'render', message: '渲染发布产物（不含草稿）' });
  const report = await renderSiteTo({
    site,
    siteId,
    outputDir,
    includeDrafts: false,
    baseUrl: normalizeSiteUrl(config.siteUrl),
  });

  const result = await deployer.deploy({ outputDir, config, onProgress });
  return { ...result, files: report.files };
}
