import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';

/**
 * 站点模型（新程序逻辑）：
 * - 一站点一目录，目录自述：{站点目录}/wordma.site.yaml 是站点元信息的唯一数据源
 * - 库（wordma.db）退化为服务单个站点，不再有 sites 表
 * - 多站点 = 应用级 registry.json 登记多个目录，registry 由 main.ts 在启动时注入根目录
 */

export type Site = {
  id: number;
  name: string;
  description: string | null;
  /** 站点数据根目录（registry 登记） */
  dir: string;
  createdAt: string;
};

const SITE_NAME_MAX = 30;
const SITE_DESCRIPTION_MAX = 100;
/** registry.json 的文件名（位于应用私有根，由 setRegistryRoot 注入） */
const REGISTRY_FILE = 'registry.json';
const SITE_YAML_FILE = 'wordma.site.yaml';

// ---------------------------------------------------------------------------
// registry：应用级站点登记
// ---------------------------------------------------------------------------

type RegistryEntry = {
  id: number;
  name: string;
  dir: string;
  createdAt: string;
};

type Registry = {
  sites: RegistryEntry[];
  activeSiteId: number | null;
};

let registryRoot: string | null = null;
let registryCache: Registry | null = null;

function registryPath(): string {
  if (!registryRoot) throw new Error('registry 尚未初始化');
  return path.join(registryRoot, REGISTRY_FILE);
}

function emptyRegistry(): Registry {
  return { sites: [], activeSiteId: null };
}

function readRegistry(): Registry {
  if (!registryCache) {
    const file = registryPath();
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Registry;
      registryCache = {
        sites: Array.isArray(raw.sites) ? raw.sites : [],
        activeSiteId: raw.activeSiteId ?? null,
      };
    } catch {
      registryCache = emptyRegistry();
    }
  }
  return registryCache;
}

/** 原子写（.tmp → rename）并立即可读回 */
function writeRegistry(next: Registry): void {
  mkdirSync(registryRoot!, { recursive: true });
  const file = registryPath();
  const tmp = `${file}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, file);
  registryCache = next;
}

/** main.ts 启动时注入应用私有根（registry.json 所在目录） */
export function setRegistryRoot(root: string): void {
  registryRoot = root;
}

/** registry.json 的完整路径（E2E reset 后返回应用私有根用） */
export function registryFile(): string {
  return registryPath();
}

/** E2E 专用：清空登记回到全新安装状态 */
export function resetRegistry(): void {
  writeRegistry(emptyRegistry());
}

function nextRegistryId(sites: RegistryEntry[]): number {
  return sites.reduce((max, s) => Math.max(max, s.id), 0) + 1;
}

// ---------------------------------------------------------------------------
// wordma.site.yaml：站点名片（站点元信息数据源）
// ---------------------------------------------------------------------------

type SiteYaml = {
  siteId: number;
  name: string;
  description: string | null;
  createdAt: string;
  appVersion: string;
};

export function siteYamlPath(siteDir: string): string {
  return path.join(siteDir, SITE_YAML_FILE);
}

function readSiteYaml(siteDir: string): SiteYaml | null {
  const file = siteYamlPath(siteDir);
  if (!existsSync(file)) return null;
  try {
    return parse(readFileSync(file, 'utf8')) as SiteYaml;
  } catch {
    return null;
  }
}

function writeSiteYaml(siteDir: string, data: SiteYaml): void {
  // 手写头部注释便于用户直接读懂这个目录是什么
  const body = stringify(data, { lineWidth: 0 });
  writeFileSync(
    siteYamlPath(siteDir),
    `# Wordma 站点名片：站点元信息（由应用维护，勿随意改名）\n${body}`
  );
}

// ---------------------------------------------------------------------------
// 站点生命周期（Site 接口 = registry + YAML 的组合视图）
// ---------------------------------------------------------------------------

function toSite(entry: RegistryEntry): Site {
  return {
    id: entry.id,
    name: entry.name,
    description: null,
    dir: entry.dir,
    createdAt: entry.createdAt,
  };
}

/** 读取站点完整信息（含描述）：YAML 为源，YAML 缺失时回退 registry */
export function readSiteInfo(site: Site): Site {
  const yaml = readSiteYaml(site.dir);
  if (!yaml) return site;
  return {
    ...site,
    name: yaml.name ?? site.name,
    description: yaml.description ?? null,
    createdAt: yaml.createdAt ?? site.createdAt,
  };
}

function validateSiteInput(name: string, description?: string | null): void {
  if (!name || name.trim().length === 0) {
    throw new Error('站点名称不能为空');
  }
  if (name.length > SITE_NAME_MAX) {
    throw new Error(`站点名称不能超过 ${SITE_NAME_MAX} 个字符`);
  }
  if (description && description.length > SITE_DESCRIPTION_MAX) {
    throw new Error(`站点描述不能超过 ${SITE_DESCRIPTION_MAX} 个字符`);
  }
}

export function listSites(): Site[] {
  return readRegistry().sites.map(toSite).map(readSiteInfo);
}

export function getSite(id: number): Site {
  const entry = readRegistry().sites.find((s) => s.id === id);
  if (!entry) throw new Error('站点不存在');
  return readSiteInfo(toSite(entry));
}

/** 按目录找已登记站点（重开判定用） */
export function findSiteByDir(
  dir: string
): { site: Site | null; resolvedDir: string } {
  const resolved = path.resolve(dir);
  const entry = readRegistry().sites.find((s) => path.resolve(s.dir) === resolved);
  return { site: entry ? readSiteInfo(toSite(entry)) : null, resolvedDir: resolved };
}

/** 目录里是否已有 Wordma 数据（wordma.site.yaml 或 wordma.db）——真 → 视为「重开」 */
export function isWordmaDir(dir: string): boolean {
  return (
    existsSync(siteYamlPath(dir)) || existsSync(path.join(dir, 'wordma.db'))
  );
}

/**
 * 目录是否是别的 Wordma 站点已登记在案的 —— 防止同一目录被登记两次。
 */
export function assertDirNotRegistered(dir: string): void {
  const { site } = findSiteByDir(dir);
  if (site) {
    throw new Error(`该目录已被站点「${site.name}」使用，请在站点切换中直接选择它`);
  }
}

/**
 * 创建站点：
 * - 目录既可以是空/不存在（新建），也可以是已有 Wordma 数据的目录（重开，内容原样保留）
 * - 目录里若已有 wordma.site.yaml，沿用其 name（入参 name 校验后覆盖写回）
 */
export function createSite(payload: {
  name: string;
  description?: string | null;
  dir: string;
}): Site {
  validateSiteInput(payload.name, payload.description);

  const dir = (payload.dir ?? '').trim();
  if (!dir) throw new Error('必须选择站点数据目录');
  if (!path.isAbsolute(dir)) throw new Error('站点目录必须是绝对路径');
  assertDirNotRegistered(dir);

  const registry = readRegistry();
  const reopened = isWordmaDir(dir);
  const previousYaml = readSiteYaml(dir);
  const siteId = nextRegistryId(registry.sites);
  const createdAt = previousYaml?.createdAt ?? new Date().toISOString();

  // 重开不要求目录存在（wordma.db 在就得有目录）；新建则建目录
  if (!reopened) mkdirSync(dir, { recursive: true });

  writeSiteYaml(dir, {
    siteId,
    name: payload.name.trim(),
    description: payload.description ?? null,
    createdAt,
    appVersion: '0.0.0', // desktop 包版本（要求随应用走，写死避免打包解析）
  });

  const entry: RegistryEntry = {
    id: siteId,
    name: payload.name.trim(),
    dir,
    createdAt,
  };
  writeRegistry({
    sites: [...registry.sites, entry],
    activeSiteId: registry.activeSiteId ?? siteId, // 第一个站点自动激活
  });

  return toSite(entry);
}

export function updateSite(payload: {
  id: number;
  name: string;
  description?: string | null;
}): Site {
  validateSiteInput(payload.name, payload.description);

  const registry = readRegistry();
  const entry = registry.sites.find((s) => s.id === payload.id);
  if (!entry) throw new Error('站点不存在');

  const yaml = readSiteYaml(entry.dir);
  // description 未传（undefined）→ 保留旧值；显式 null → 清空
  const description =
    payload.description !== undefined ? payload.description : yaml?.description ?? null;
  entry.name = payload.name.trim();
  writeRegistry(registry);

  // YAML 为站点元信息源：registry 展示名与 YAML 同步写
  writeSiteYaml(entry.dir, {
    siteId: entry.id,
    name: payload.name.trim(),
    description,
    createdAt: yaml?.createdAt ?? entry.createdAt,
    appVersion: '0.0.0', // desktop 包版本（要求随应用走，写死避免打包解析）
  });

  return readSiteInfo(toSite(entry));
}

/** 删除站点：只移除登记，用户磁盘目录保留不动 */
export function deleteSite(id: number): void {
  const registry = readRegistry();
  if (!registry.sites.some((s) => s.id === id)) throw new Error('站点不存在');

  writeRegistry({
    sites: registry.sites.filter((s) => s.id !== id),
    activeSiteId: registry.activeSiteId === id ? null : registry.activeSiteId,
  });
}

export function getActiveSite(): Site | null {
  const registry = readRegistry();
  if (registry.activeSiteId === null) return null;
  const entry = registry.sites.find((s) => s.id === registry.activeSiteId);
  return entry ? readSiteInfo(toSite(entry)) : null;
}

export function setActiveSite(id: number): void {
  const registry = readRegistry();
  if (!registry.sites.some((s) => s.id === id)) throw new Error('站点不存在');
  writeRegistry({ ...registry, activeSiteId: id });
}

export function getActiveSiteId(): number | null {
  return readRegistry().activeSiteId;
}

/** 当前打开的库对应的登记 id（无激活站点时抛错，与 getSite 一致的语义） */
export function getCurrentSiteId(): number {
  const id = getActiveSiteId();
  if (id === null) throw new Error('没有激活站点');
  return id;
}

/** 激活站点依附的站点目录（无站点返回 null） */
export function getActiveSiteDir(): string | null {
  const site = getActiveSite();
  return site?.dir ?? null;
}

