import { ipcMain, app, net, protocol } from 'electron';
import { getDb } from './db';
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
  handleIpc('debug_protocol', () => ({
    handled: protocol.isProtocolHandled('wordma-media'),
  }));
  handleIpc('debug_fetch', async (payload) => {
    try {
      const res = await net.fetch(payload.url as string);
      return { status: res.status, body: (await res.text()).slice(0, 60) };
    } catch (err) {
      return { err: String(err) };
    }
  });

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
