import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Deployer, DeployProgress, DeployResult } from './types';

/** 目标目录的标记文件：只清理「自己发布过」的目录，避免误删用户目录 */
const MARKER = '.wordma-publish.json';

/**
 * 本地文件夹发布：把发布构建产物同步到用户指定的目录。
 * 有标记文件 ⇒ 先清空再整目录拷贝（重命名 slug 后不留死页）；
 * 目录非空且没有标记 ⇒ 拒绝，避免误删用户自己的文件。
 */
export const localFolderDeployer: Deployer = {
  provider: 'local-folder',

  async deploy({ outputDir, config, onProgress }): Promise<DeployResult> {
    const folder = config.folder?.trim();
    if (!folder) {
      throw new Error('请先配置发布文件夹');
    }

    const target = path.resolve(folder);
    if (target === path.resolve(outputDir)) {
      throw new Error('发布文件夹不能是发布构建产物目录');
    }

    const emit = (progress: DeployProgress) => onProgress?.(progress);

    if (existsSync(target)) {
      const entries = readdirSync(target);
      const hasMarker = entries.includes(MARKER);
      if (entries.length > 0 && !hasMarker) {
        throw new Error(
          `目标文件夹不是空的，且不是 Wordma 发布目录（缺少 ${MARKER}），请换一个空文件夹`
        );
      }
      emit({ stage: 'upload', message: '清空目标文件夹' });
      rmSync(target, { recursive: true, force: true });
    }

    mkdirSync(target, { recursive: true });
    emit({ stage: 'upload', message: '拷贝发布产物' });
    cpSync(outputDir, target, { recursive: true });

    const files = readdirSync(outputDir, { recursive: true }).length;
    writeFileSync(
      path.join(target, MARKER),
      `${JSON.stringify({ publishedAt: new Date().toISOString(), files }, null, 2)}\n`
    );

    return {
      provider: 'local-folder',
      outputDir,
      files,
      target,
    };
  },
};
