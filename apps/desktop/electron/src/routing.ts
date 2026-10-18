import { getSetting, setSetting } from './settings';

// 注意：本文件在渲染层纯函数与主进程间共享，get/set 依赖仅主进程使用

export type RouteKey =
  | 'index'
  | 'indexPagination'
  | 'post'
  | 'page'
  | 'category'
  | 'tag'
  | 'archive'
  | 'feed';

export type RoutingRules = Record<RouteKey, string>;

export type RouteCheck = {
  key: RouteKey;
  route: string;
  ok: boolean;
  message?: string;
  example?: string;
};

/** 默认路由规则（对齐 Rust 版默认值） */
export const DEFAULT_ROUTING_RULES: RoutingRules = {
  index: '/',
  indexPagination: '/page/[num]/',
  post: '/post/[slug].html',
  page: '/[slug].html',
  category: '/category/[slug]/',
  tag: '/tag/[slug]/',
  archive: '/archive/',
  feed: '/feed.xml',
};

/** 每条路由允许的占位符 */
const ALLOWED_PLACEHOLDERS: Record<RouteKey, string[]> = {
  index: [],
  indexPagination: ['num'],
  post: ['slug', 'id', 'year', 'month', 'day'],
  page: ['slug', 'id'],
  category: ['slug', 'id'],
  tag: ['slug', 'id'],
  archive: [],
  feed: [],
};

/** 每条路由必须包含的占位符 */
const REQUIRED_PLACEHOLDERS: Partial<Record<RouteKey, string[]>> = {
  indexPagination: ['num'],
};

/** URL 字符白名单（路径安全字符 + 占位符括号） */
const ROUTE_CHARSET_RE = /^[a-z0-9/[\]._~-]*$/;

const EXAMPLE_VALUES: Record<string, string> = {
  slug: 'hello-world',
  id: '1',
  year: '2026',
  month: '06',
  day: '01',
  num: '2',
};

function extractPlaceholders(route: string): string[] {
  const names: string[] = [];
  for (const match of route.matchAll(/\[([a-z]+)\]/g)) {
    names.push(match[1]);
  }
  return names;
}

/** 按占位符填充示例值，生成示例 URL */
export function generatePath(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\[([a-z]+)\]/g, (_, name: string) =>
    vars[name] !== undefined ? vars[name] : `[${name}]`
  );
}

/** 校验单条路由（对齐 Rust routing.rs 的校验集合） */
function checkRoute(key: RouteKey, rawRoute: string): RouteCheck {
  const route = rawRoute.trim();
  const base: RouteCheck = { key, route, ok: true };

  if (route.length === 0) {
    return { ...base, ok: false, message: '路由不能为空' };
  }
  if (!route.startsWith('/')) {
    return { ...base, ok: false, message: '路由必须以 / 开头' };
  }
  if (route.includes('..')) {
    return { ...base, ok: false, message: '路由不能包含 ..' };
  }
  if (route.includes('//')) {
    return { ...base, ok: false, message: '路由不能包含连续的 //' };
  }
  if (route === '/assets' || route.startsWith('/assets/')) {
    return { ...base, ok: false, message: '/assets 前缀为静态资源保留' };
  }
  if (key === 'index' && route !== '/') {
    return { ...base, ok: false, message: 'index 路由必须为 /' };
  }
  if (!ROUTE_CHARSET_RE.test(route)) {
    return {
      ...base,
      ok: false,
      message: '路由只能包含小写字母、数字和 / - _ . [ ] ~',
    };
  }

  const placeholders = extractPlaceholders(route);
  const allowed = ALLOWED_PLACEHOLDERS[key];
  for (const name of placeholders) {
    if (!allowed.includes(name)) {
      return {
        ...base,
        ok: false,
        message: `[${name}] 不是 ${key} 路由允许的占位符（允许：${allowed.join(', ') || '无'}）`,
      };
    }
  }
  for (const required of REQUIRED_PLACEHOLDERS[key] ?? []) {
    if (!placeholders.includes(required)) {
      return {
        ...base,
        ok: false,
        message: `${key} 路由必须包含 [${required}]`,
      };
    }
  }

  const example = generatePath(route, EXAMPLE_VALUES);
  return { ...base, ok: true, example };
}

/** 校验整组路由规则：逐条检查 + 示例 URL 全站唯一 */
export function validateRoutingRules(rules: RoutingRules): RouteCheck[] {
  const checks = (Object.keys(DEFAULT_ROUTING_RULES) as RouteKey[]).map((key) =>
    checkRoute(key, rules[key] ?? '')
  );

  // 示例 URL 全站唯一（对齐 Rust 渲染期的 URL 冲突检测语义）
  const seen = new Map<string, RouteKey>();
  for (const check of checks) {
    if (!check.ok || check.example === undefined) continue;
    const owner = seen.get(check.example);
    if (owner !== undefined) {
      check.ok = false;
      check.message = `与 ${owner} 路由生成的 URL 冲突（${check.example}）`;
    } else {
      seen.set(check.example, check.key);
    }
  }

  return checks;
}

/** 读取站点路由规则（未设置时返回默认值；损坏时回退默认值） */
export function getRoutingRules(siteId: number): RoutingRules {
  const raw = getSetting(`routing_rules:${siteId}`);
  if (!raw) return { ...DEFAULT_ROUTING_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<RoutingRules>;
    return { ...DEFAULT_ROUTING_RULES, ...parsed };
  } catch {
    return { ...DEFAULT_ROUTING_RULES };
  }
}

/**
 * 保存站点路由规则：先逐条校验，任一条不通过直接抛错（整体不落库）。
 * 渲染期仍会再校验一次（防御存储被外部改坏）。
 */
export function setRoutingRules(siteId: number, rules: RoutingRules): RouteCheck[] {
  const checks = validateRoutingRules(rules);
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      failed
        .map((check) => `${check.key}：${check.message ?? '规则不合法'}`)
        .join('；')
    );
  }

  setSetting(`routing_rules:${siteId}`, JSON.stringify(rules));
  return checks;
}

export function getRoutingRulesFor(siteId: number): RoutingRules {
  const raw = getSetting(`routing_rules:${siteId}`);
  if (!raw) return { ...DEFAULT_ROUTING_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<RoutingRules>;
    return { ...DEFAULT_ROUTING_RULES, ...parsed };
  } catch {
    return { ...DEFAULT_ROUTING_RULES };
  }
}
