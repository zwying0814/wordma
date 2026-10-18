'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getRoutingRules,
  setRoutingRules,
  validateRoutingRules,
  type RouteCheck,
  type RouteKey,
  type RoutingRules,
} from '@/lib/routing';
import { cn } from '@/lib/utils';

/** 8 条路由的中文名（与主进程 routing.ts 的 RouteKey 一一对应） */
const ROUTE_LABELS: Record<RouteKey, string> = {
  index: '首页',
  indexPagination: '首页分页',
  post: '文章详情',
  page: '独立页面',
  category: '分类列表',
  tag: '标签列表',
  archive: '归档',
  feed: 'RSS',
};

const ROUTE_ORDER: RouteKey[] = [
  'index',
  'indexPagination',
  'post',
  'page',
  'category',
  'tag',
  'archive',
  'feed',
];

/** 默认规则（与主进程 DEFAULT_ROUTING_RULES 一致，「恢复默认」用） */
const DEFAULT_RULES: RoutingRules = {
  index: '/',
  indexPagination: '/page/[num]/',
  post: '/post/[slug].html',
  page: '/[slug].html',
  category: '/category/[slug]/',
  tag: '/tag/[slug]/',
  archive: '/archive/',
  feed: '/feed.xml',
};

/** 路由规则区：8 条路由输入 + 逐条校验结果 + 示例 URL */
export function RoutingSection({ siteId }: { siteId: number }) {
  const [rules, setRules] = React.useState<RoutingRules>(DEFAULT_RULES);
  const [checks, setChecks] = React.useState<RouteCheck[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getRoutingRules(siteId);
        if (cancelled) return;
        setRules(stored);
        setChecks(await validateRoutingRules(siteId, stored));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const revalidate = React.useCallback(
    async (next: RoutingRules) => {
      try {
        setChecks(await validateRoutingRules(siteId, next));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [siteId]
  );

  const updateRule = (key: RouteKey, value: string) => {
    setSaved(false);
    const next = { ...rules, [key]: value };
    setRules(next);
    void revalidate(next);
  };

  const hasError = checks.some((check) => !check.ok);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setChecks(await setRoutingRules(siteId, rules));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setSaved(false);
    setRules(DEFAULT_RULES);
    await revalidate(DEFAULT_RULES);
  };

  return (
    <section className="flex max-w-2xl flex-col gap-3" data-testid="routing-section">
      <h2 className="font-semibold text-sm">路由规则</h2>

      <div className="flex flex-col gap-2">
        {ROUTE_ORDER.map((key) => {
          const check = checks.find((item) => item.key === key);
          return (
            <div className="flex flex-col gap-1" key={key}>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-muted-foreground text-sm">
                  {ROUTE_LABELS[key]}
                </span>
                <Input
                  className="h-8 font-mono text-xs"
                  data-testid={`route-${key}`}
                  onChange={(event) => updateRule(key, event.target.value)}
                  value={rules[key]}
                />
              </div>
              {check && (
                <span
                  className={cn(
                    'pl-26 text-xs',
                    check.ok ? 'text-muted-foreground' : 'text-destructive'
                  )}
                  data-testid={`route-check-${key}`}
                >
                  {check.ok
                    ? check.example
                      ? `示例：${check.example}`
                      : '通过'
                    : check.message}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          data-testid="routing-save"
          disabled={busy || hasError}
          onClick={() => void handleSave()}
          size="sm"
        >
          保存路由规则
        </Button>
        <Button
          data-testid="routing-reset"
          disabled={busy}
          onClick={() => void handleReset()}
          size="sm"
          variant="outline"
        >
          恢复默认
        </Button>
        {(error || saved) && (
          <span
            className={cn(
              'text-sm',
              error ? 'text-destructive' : 'text-muted-foreground'
            )}
            data-testid="routing-result"
          >
            {error ?? '已保存'}
          </span>
        )}
      </div>
    </section>
  );
}
