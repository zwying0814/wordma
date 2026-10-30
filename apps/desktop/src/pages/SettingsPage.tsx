import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSite } from "../context/SiteContext";
import { updateSite } from "../lib/site";
import {
  getRoutingRules,
  setRoutingRules,
  validateRouting,
  type RouteCheck,
  type RoutingRules,
} from "../lib/routing";
import { getPreviewPort, setPreviewPort } from "../lib/theme";
import { ListCard } from "../components/common/list-row";
import { PageHeader } from "../components/common/page-header";
import { PageView } from "../components/common/page-view";

const ROUTE_LABELS: Record<string, string> = {
  index: "首页",
  indexPagination: "首页分页",
  post: "文章",
  page: "页面",
  category: "分类",
  tag: "标签",
  archive: "归档",
  feed: "Feed",
};

const DEFAULT_RULES: RoutingRules = {
  index: "/",
  indexPagination: "/page/[num]/",
  post: "/post/[slug].html",
  page: "/[slug].html",
  category: "/category/[slug]/",
  tag: "/tag/[slug]/",
  archive: "/archive/",
  feed: "/feed.xml",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ListCard className="mb-4">
      <div className="flex items-center justify-between gap-2.5 border-b border-border px-[18px] py-3.5 text-sm font-semibold text-foreground">
        <span>{title}</span>
        {action}
      </div>
      <div className="flex flex-col gap-3 px-[18px] py-4">{children}</div>
    </ListCard>
  );
}

function FieldRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[13px] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { activeSite } = useSite();

  // ===== 站点信息 =====
  const [name, setName] = useState(activeSite.name);
  const [description, setDescription] = useState(activeSite.description ?? "");
  const [savingSite, setSavingSite] = useState(false);

  const handleSaveSite = async () => {
    if (!name.trim()) {
      toast.error("站点名称不能为空");
      return;
    }
    setSavingSite(true);
    try {
      await updateSite(activeSite.id, name.trim(), description.trim() || null);
      toast.success("站点信息已保存，即将刷新界面");
      // 站点名出现在侧边栏等多处，统一整页刷新
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingSite(false);
    }
  };

  // ===== 路由规则 =====
  const [rules, setRules] = useState<RoutingRules | null>(null);
  const [checks, setChecks] = useState<RouteCheck[]>([]);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    getRoutingRules(activeSite.id)
      .then(setRules)
      .catch((e) => toast.error(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSite.id]);

  // 规则变化后防抖校验，逐条给出示例路径或错误
  useEffect(() => {
    if (!rules) return;
    const timer = setTimeout(() => {
      validateRouting(rules)
        .then(setChecks)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [rules]);

  const checkByRoute = useMemo(() => {
    const map: Record<string, RouteCheck | undefined> = {};
    for (const c of checks) map[c.route] = c;
    return map;
  }, [checks]);

  const rulesValid = checks.length > 0 && checks.every((c) => c.ok);

  // ===== 预览端口 =====
  const [port, setPort] = useState<string>("");
  const [savingPort, setSavingPort] = useState(false);

  useEffect(() => {
    getPreviewPort()
      .then((p) => setPort(String(p)))
      .catch(() => {});
  }, []);

  const handleSavePort = async () => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      toast.error("端口需在 1024 - 65535 之间");
      return;
    }
    setSavingPort(true);
    try {
      await setPreviewPort(value);
      toast.success(`预览端口已固定为 ${value}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingPort(false);
    }
  };

  const handleSaveRules = async () => {
    if (!rules) return;
    setSavingRules(true);
    try {
      await setRoutingRules(activeSite.id, rules);
      toast.success("路由规则已保存");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSavingRules(false);
    }
  };

  const updatePattern = (route: string, pattern: string) => {
    setRules((prev) => (prev ? { ...prev, [route]: pattern } : prev));
  };

  return (
    <PageView>
      <PageHeader title="设置" subtitle="站点与全局配置" />

      {rules === null ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : (
        <>
          <Section title="站点信息">
            <FieldRow label="站点名称">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="站点名称"
              />
            </FieldRow>
            <FieldRow label="站点描述">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话介绍这个站点（可选）"
              />
            </FieldRow>
            <FieldRow>
              <Button disabled={savingSite} onClick={handleSaveSite}>
                {savingSite ? <Spinner className="size-4" /> : null}
                保存
              </Button>
            </FieldRow>
          </Section>

          <Section title="预览">
            <FieldRow label="预览端口">
              <Input
                className="w-[140px]"
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                placeholder="默认 12739"
              />
              <Button
                variant="outline"
                disabled={savingPort}
                onClick={handleSavePort}
              >
                {savingPort ? <Spinner className="size-4" /> : null}
                保存
              </Button>
            </FieldRow>
            <div className="text-xs text-muted-foreground">
              预览地址 http://127.0.0.1:端口/ ；端口被其他程序占用时保存会失败，请更换后重试。
            </div>
          </Section>

          <Section
            title="路由规则"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRules({ ...DEFAULT_RULES })}
              >
                恢复默认
              </Button>
            }
          >
            {(
              ["index", "post", "page", "category", "tag", "archive"] as const
            ).map((route) => {
              const check = checkByRoute[route];
              return (
                <div key={route} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[13px] font-medium text-muted-foreground">
                    {ROUTE_LABELS[route]}
                  </span>
                  <Input
                    className="min-w-0 flex-1 font-mono text-[12.5px]"
                    value={rules[route]}
                    onChange={(e) => updatePattern(route, e.target.value)}
                    aria-invalid={Boolean(check && !check.ok)}
                  />
                  <span
                    className={cn(
                      "w-[200px] shrink-0 text-xs",
                      check?.ok
                        ? "text-muted-foreground"
                        : "text-destructive",
                    )}
                  >
                    {!check
                      ? ""
                      : check.ok
                        ? `示例 ${check.example}`
                        : check.message}
                  </span>
                </div>
              );
            })}
            <FieldRow>
              <Button
                disabled={!rulesValid || savingRules}
                onClick={handleSaveRules}
              >
                {savingRules ? <Spinner className="size-4" /> : null}
                保存路由规则
              </Button>
            </FieldRow>
          </Section>
        </>
      )}
    </PageView>
  );
}
