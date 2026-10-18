import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { ipcMain, app, net, protocol, shell } from 'electron';
import { closeDb, getDb, getDataDir, initDataDir } from './db';
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
  setActiveSite,
  updateSite,
} from './site';
import { getSetting, setSetting } from './settings';

type IpcHandler = (payload: any) => unknown | Promise<unknown>;

const registeredChannels = new Set<string>();

/** 注册一个 IPC 通道（白名单：只有注册过的 channel 才能被渲染层调用） */
function handleIpc(channel: string, handler: IpcHandler): void {
  registeredChannels.add(channel);
  ipcMain.handle(channel, (_event, payload) => handler(payload));
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
      // 预览服务器与目录都要先断开，否则它们继续指向即将被删除的路径
      stopPreviewServer();
      clearPreviewDir();
      const dir = getDataDir();
      closeDb();
      rmSync(dir, { recursive: true, force: true });
      initDataDir(dir);
      // 内置主题是磁盘上的目录，重建后要重新提取
      ensureBuiltinThemes();
      return { dataDir: dir };
    });
  }

  // site
  handleIpc('list_sites', () => listSites());
  handleIpc('get_site', (payload) => getSite(payload.id));
  handleIpc('create_site', (payload) =>
    createSite({ name: payload.name, description: payload.description })
  );
  handleIpc('update_site', (payload) =>
    updateSite({
      id: payload.id,
      name: payload.name,
      description: payload.description,
    })
  );
  handleIpc('delete_site', (payload) => deleteSite(payload.id));
  handleIpc('get_active_site', () => getActiveSite());
  handleIpc('set_active_site', (payload) => setActiveSite(payload));

  // settings
  handleIpc('get_setting', (payload) => getSetting(payload.key));
  handleIpc('set_setting', (payload) => setSetting(payload.key, payload.value));

  // article
  handleIpc('list_articles', (payload) => listArticles(payload.siteId));
  handleIpc('get_article', (payload) => getArticle(payload.id));
  handleIpc('create_article', (payload) =>
    createArticle({
      siteId: payload.siteId,
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
  handleIpc('list_tags', (payload) => listTags(payload.siteId));
  handleIpc('create_tag', (payload) =>
    createTag({ siteId: payload.siteId, name: payload.name })
  );
  handleIpc('rename_tag', (payload) =>
    renameTag({ id: payload.id, name: payload.name })
  );
  handleIpc('delete_tag', (payload) => deleteTag(payload.id));
  handleIpc('list_categories', (payload) => listCategories(payload.siteId));
  handleIpc('create_category', (payload) =>
    createCategory({ siteId: payload.siteId, name: payload.name })
  );
  handleIpc('rename_category', (payload) =>
    renameCategory({ id: payload.id, name: payload.name })
  );
  handleIpc('delete_category', (payload) => deleteCategory(payload.id));

  // media
  handleIpc('list_media', (payload) => listMedia(payload.siteId));
  handleIpc('upload_media_from_path', (payload) =>
    uploadMediaFromPath({
      siteId: payload.siteId,
      filePath: payload.filePath,
      originalName: payload.originalName,
    })
  );
  handleIpc('upload_media_data', (payload) =>
    uploadMediaData({
      siteId: payload.siteId,
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
    const url = `http://127.0.0.1:${port}/`;
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
  handleIpc('list_pages', (payload) => listPages(payload.siteId));
  handleIpc('get_page', (payload) => getPage(payload.id));
  handleIpc('create_page', (payload) =>
    createPage({
      siteId: payload.siteId,
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
