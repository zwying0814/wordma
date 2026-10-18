import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { dialog, ipcMain, app, net, protocol, shell } from 'electron';
import { closeDb, getDataDir, getDb, openSiteDb } from './db';
import {
  clearPreviewDir,
  getPreviewPort,
  setPreviewDir,
  startPreviewServer,
  stopPreviewServer,
  validatePort,
  getRunningPort,
} from './preview';
import {
  createArticle,
  deleteArticle,
  getArticle,
  listArticles,
  updateArticle,
} from './article';
import {
  createPage,
  deletePage,
  getPage,
  listPages,
  updatePage,
} from './pages';
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  listCategories,
  listTags,
  renameCategory,
  renameTag,
} from './taxonomy';
import {
  generatePath,
  getRoutingRules,
  getRoutingRulesFor,
  setRoutingRules,
  validateRoutingRules,
} from './routing';
import {
  deleteTheme,
  ensureBuiltinThemes,
  getActiveThemeName,
  getThemeSettings,
  listThemes,
  setActiveTheme,
  setThemeSettings,
  themesDir,
} from './theme';
import type { RoutingRules } from './routing';
import { deploySite, getDeployConfig, setDeployConfig } from './deploy';
import type { DeployConfig } from './deploy';
import { renderSitePreview } from './render';
import {
  deleteMedia,
  listMedia,
  uploadMediaData,
  uploadMediaFromPath,
} from './media';
import {
  createSite,
  deleteSite,
  getActiveSite,
  getSite,
  listSites,
  registryFile,
  resetRegistry,
  setActiveSite,
  updateSite,
} from './site';
import { getSetting, setSetting } from './settings';

type IpcHandler = (payload: any) => unknown | Promise<unknown>;

const registeredChannels = new Set<string>();

/** 切换激活站点：同步关旧库 → 开新库（必须全同步，避免在途 IPC 看到半初始化状态） */
function switchToSite(siteId: number): void {
  closeDb();
  setActiveSite(siteId);
  const site = getSite(siteId);
  openSiteDb(site.dir);
  ensureBuiltinThemes();
}

/** E2E 目录选择注入队列（见 select_directory handler） */
const e2eDirectoryQueue: string[] = [];

/** 注册一个 IPC 通道（白名单：只有注册过的 channel 才能被渲染层调用） */
function handleIpc(channel: string, handler: IpcHandler): void {
  registeredChannels.add(channel);
  ipcMain.handle(channel, (_event, payload) => handler(payload));
}

/** 预览要打开的路径：给了 target（文章/页面）就按当前路由规则生成，否则首页 */
function previewTargetPath(
  siteId: number,
  target?: { kind?: 'post' | 'page'; slug?: string }
): string {
  if (!target?.slug) return '/';

  const rules = getRoutingRulesFor(siteId);
  const route = target.kind === 'page' ? rules.page : rules.post;
  return generatePath(route, { slug: target.slug });
}

/** 注册全部 IPC 通道（对齐 Rust generate_handler! 的 v1 裁剪清单） */
export function registerAllIpc(): void {
  // 基建
  handleIpc('app_info', () => ({
    name: 'wordma',
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
  }));

  // 数据库调试通道（T2 验收用，保留为内部通道）
  handleIpc('db_tables', () =>
    getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: any) => row.name)
  );
  handleIpc('debug_theme', (payload) => {
    const siteId = (payload?.siteId ?? getActiveSite()?.id) as number;
    const name = getActiveThemeName(siteId);
    const dir = path.join(themesDir(), name);
    return {
      siteId,
      name,
      dir,
      hasYaml: existsSync(path.join(dir, 'theme.yaml')),
      templates: existsSync(path.join(dir, 'templates'))
        ? readdirSync(path.join(dir, 'templates'))
        : null,
    };
  });
  handleIpc('debug_protocol', () => ({
    handled: protocol.isProtocolHandled('wordma-media'),
  }));
  // 路由规则校验（T14 验收通道；设置 UI 二期）
  handleIpc('debug_validate_routing', (payload) =>
    validateRoutingRules(payload.rules as RoutingRules)
  );
  handleIpc('get_routing_rules', (payload) =>
    getRoutingRulesFor(payload.siteId as number)
  );
  handleIpc('validate_routing_rules', (payload) =>
    validateRoutingRules(
      (payload?.rules ?? getRoutingRules(payload.siteId as number)) as RoutingRules
    )
  );
  handleIpc('set_routing_rules', (payload) =>
    setRoutingRules(payload.siteId as number, payload.rules as RoutingRules)
  );

  // deploy
  handleIpc('get_deploy_config', (payload) =>
    getDeployConfig(payload.siteId as number)
  );
  handleIpc('set_deploy_config', (payload) =>
    setDeployConfig(payload.siteId as number, payload.config as DeployConfig)
  );
  handleIpc('deploy_site', (payload) => deploySite(payload.siteId as number));
  handleIpc('debug_fetch', async (payload) => {
    try {
      const res = await net.fetch(payload.url as string);
      return { status: res.status, body: (await res.text()).slice(0, 60) };
    } catch (err) {
      return { err: String(err) };
    }
  });

  // E2E 专用：把数据目录恢复成「全新启动」状态，让整个测试套件复用同一个 Electron 进程。
  // 只在 WORDMA_E2E=1 时注册；处理函数必须全程同步 —— 若在 closeDb 与 initDataDir 之间
  // 让出事件循环，在途 IPC 调 getDb() 会抛「数据库尚未初始化」。
  if (process.env.WORDMA_E2E === '1') {
    handleIpc('debug_reset_data', () => {
      if (process.env.WORDMA_E2E !== '1') {
        throw new Error('debug_reset_data 仅在 E2E 环境可用');
      }
      // 站点目录模型：预览先停（指向即将删除的目录）；
      // 删掉所有已登记的站点目录 + 重置 registry → 等价全新安装
      stopPreviewServer();
      clearPreviewDir();
      closeDb();
      for (const site of listSites()) {
        rmSync(site.dir, { recursive: true, force: true });
      }
      resetRegistry();
      return { dataDir: path.dirname(registryFile()) };
    });
  }

  // 站点目录模型：全部走 registry + 站点 YAML；siteId 参数兼容保留（主进程用当前站点）
  handleIpc('list_sites', () => listSites());
  handleIpc('get_site', (payload) => getSite(payload.id));
  handleIpc('create_site', (payload) => {
    const site = createSite({
      name: payload.name,
      description: payload.description,
      dir: payload.dir,
    });
    // 创建即激活并打开库（首个站点注册时 activeSiteId 已指向它）
    switchToSite(site.id);
    ensureBuiltinThemes();
    return site;
  });
  handleIpc('update_site', (payload) =>
    updateSite({
      id: payload.id,
      name: payload.name,
      description: payload.description,
    })
  );
  handleIpc('delete_site', (payload) => {
    deleteSite(payload.id);
    // 删的是激活站点时 registry 的 activeSiteId 已清空 → 关库回 Welcome 状态
    if (!getActiveSite()) closeDb();
  });
  handleIpc('set_active_site', (payload) => switchToSite(payload.id));
  handleIpc('get_active_site', () => getActiveSite());
  /** 系统目录选择对话框（创建/重开站点用）*/
  handleIpc('select_directory', async () => {
    // E2E：原生对话框会挂死 headless 套件，用注入队列替代（set_e2e_directory 入队）
    if (process.env.WORDMA_E2E === '1') {
      const next = e2eDirectoryQueue.shift();
      if (next) return next;
    }
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  // E2E 专用：预置接下来的目录选择结果
  if (process.env.WORDMA_E2E === '1') {
    handleIpc('set_e2e_directory', (payload) => {
      for (const dir of Array.isArray(payload?.paths) ? payload.paths : []) {
        if (typeof dir === 'string') e2eDirectoryQueue.push(dir);
      }
      return e2eDirectoryQueue.length;
    });
  }

  // settings
  handleIpc('get_setting', (payload) => getSetting(payload.key));
  handleIpc('set_setting', (payload) => setSetting(payload.key, payload.value));

  // article
  handleIpc('list_articles', () => listArticles());
  handleIpc('get_article', (payload) => getArticle(payload.id));
  handleIpc('create_article', (payload) =>
    createArticle({
      title: payload.title,
      content: payload.content,
      status: payload.status,
      slug: payload.slug,
      categoryIds: payload.categoryIds,
      tagIds: payload.tagIds,
    })
  );
  handleIpc('update_article', (payload) =>
    updateArticle({
      id: payload.id,
      title: payload.title,
      content: payload.content,
      status: payload.status,
      slug: payload.slug,
      categoryIds: payload.categoryIds,
      tagIds: payload.tagIds,
    })
  );
  handleIpc('delete_article', (payload) => deleteArticle(payload.id));

  // taxonomy
  handleIpc('list_tags', () => listTags());
  handleIpc('create_tag', (payload) => createTag({ name: payload.name }));
  handleIpc('rename_tag', (payload) =>
    renameTag({ id: payload.id, name: payload.name })
  );
  handleIpc('delete_tag', (payload) => deleteTag(payload.id));
  handleIpc('list_categories', () => listCategories());
  handleIpc('create_category', (payload) => createCategory({ name: payload.name }));
  handleIpc('rename_category', (payload) =>
    renameCategory({ id: payload.id, name: payload.name })
  );
  handleIpc('delete_category', (payload) => deleteCategory(payload.id));

  // media
  handleIpc('list_media', () => listMedia());
  handleIpc('upload_media_from_path', (payload) =>
    uploadMediaFromPath({
      filePath: payload.filePath,
      originalName: payload.originalName,
    })
  );
  handleIpc('upload_media_data', (payload) =>
    uploadMediaData({
      base64: payload.base64,
      originalName: payload.originalName,
    })
  );
  handleIpc('delete_media', (payload) => deleteMedia(payload.id));
  handleIpc('reveal_media', (payload) => {
    const filePath = payload.path as string;
    if (
      typeof filePath !== 'string' ||
      !filePath.startsWith(path.join(getDataDir(), 'media'))
    ) {
      throw new Error('路径不合法');
    }
    shell.showItemInFolder(filePath);
  });

  // render / preview
  handleIpc('render_site', async (payload) => {
    const report = await renderSitePreview(payload.siteId as number);
    setPreviewDir(report.outputDir);
    await startPreviewServer(getPreviewPort());
    return report;
  });
  handleIpc('open_preview', async (payload) => {
    const siteId = payload.siteId as number;
    const report = await renderSitePreview(siteId);
    setPreviewDir(report.outputDir);
    const port = await startPreviewServer(getPreviewPort());

    // target：直接打开对应内容页而不是首页（按当前路由规则生成 URL）
    const url = `http://127.0.0.1:${port}${previewTargetPath(siteId, payload.target)}`;
    await shell.openExternal(url);
    return { url };
  });
  handleIpc('get_preview_port', () => getPreviewPort());
  handleIpc('set_preview_port', async (payload) => {
    const port = Number(payload.port);
    validatePort(port);
    setSetting('preview_port', String(port));
    if (getRunningPort() !== null && getRunningPort() !== port) {
      await startPreviewServer(port);
    }
    return port;
  });

  // theme
  handleIpc('list_themes', (payload) => {
    const siteId =
      payload?.siteId as number ?? getActiveSite()?.id;
    return listThemes(siteId);
  });
  handleIpc('set_active_theme', (payload) =>
    setActiveTheme(
      (payload?.siteId ?? getActiveSite()?.id) as number,
      payload?.name as string
    )
  );
  handleIpc('delete_theme', (payload) => deleteTheme(payload.name as string));
  handleIpc('get_theme_settings', (payload) =>
    getThemeSettings(
      (payload?.siteId ?? getActiveSite()?.id) as number,
      payload?.themeName as string | undefined
    )
  );
  handleIpc('set_theme_settings', (payload) =>
    setThemeSettings(
      (payload?.siteId ?? getActiveSite()?.id) as number,
      payload?.themeName as string,
      (payload?.values ?? {}) as Record<string, unknown>
    )
  );

  // pages
  handleIpc('list_pages', () => listPages());
  handleIpc('get_page', (payload) => getPage(payload.id));
  handleIpc('create_page', (payload) =>
    createPage({
      title: payload.title,
      slug: payload.slug,
      content: payload.content,
      showInNav: payload.showInNav,
      sortOrder: payload.sortOrder,
    })
  );
  handleIpc('update_page', (payload) =>
    updatePage({
      id: payload.id,
      title: payload.title,
      content: payload.content,
      slug: payload.slug,
      showInNav: payload.showInNav,
      sortOrder: payload.sortOrder,
    })
  );
  handleIpc('delete_page', (payload) => deletePage(payload.id));
}
