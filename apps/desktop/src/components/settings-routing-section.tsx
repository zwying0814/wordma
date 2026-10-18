'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getRoutingRules,
  setRoutingRules,
  validateRoutingRules,
  type RouteCheck,
  type RouteKey,
  type RoutingRules,
} from '@/lib/routing';
import { errorMessage } from '@/lib/errors';
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
        if (!cancelled) setError(errorMessage(err));
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
        setError(errorMessage(err));
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
      setError(errorMessage(err));
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
    <Card data-testid="routing-section">
      <CardHeader>
        <CardTitle>路由规则</CardTitle>
        <span className="ml-auto text-muted-foreground text-xs">
          决定静态产物的路径结构
        </span>
      </CardHeader>

      <CardBody className="grid-cols-1 gap-2.5">
        {ROUTE_ORDER.map((key) => {
          const check = checks.find((item) => item.key === key);
          return (
            <div className="flex flex-col gap-1" key={key}>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-semibold text-xs">
                  {ROUTE_LABELS[key]}
                </span>
                <Input
                  className="font-mono text-xs"
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
      </CardBody>

      <CardFooter>
        {(error || saved) && (
          <span
            className={cn(
              'text-xs',
              error ? 'text-destructive' : 'text-muted-foreground'
            )}
            data-testid="routing-result"
          >
            {error ?? '已保存'}
          </span>
        )}
        <Button
          data-testid="routing-reset"
          disabled={busy}
          onClick={() => void handleReset()}
          variant="outline"
        >
          恢复默认
        </Button>
        <Button
          data-testid="routing-save"
          disabled={busy || hasError}
          onClick={() => void handleSave()}
        >
          保存路由规则
        </Button>
      </CardFooter>
    </Card>
  );
}
