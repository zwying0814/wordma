import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Input, Spin } from "antd";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
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
import { pageStyles } from "../styles/page.stylex";

const ROUTE_LABELS: Record<string, string> = {
  index: "首页",
  post: "文章",
  page: "页面",
  category: "分类",
  tag: "标签",
  archive: "归档",
};

const DEFAULT_RULES: RoutingRules = {
  index: "/",
  post: "/post/[slug].html",
  page: "/[slug].html",
  category: "/category/[slug]/",
  tag: "/tag/[slug]/",
  archive: "/archive/",
};

const styles = stylex.create({
  section: {
    marginBottom: 16,
  },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 18px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ant-color-text)",
  },
  sectionBody: {
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  fieldRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  fieldLabel: {
    flexShrink: 0,
    width: 64,
    fontSize: 13,
    color: "var(--ant-color-text-secondary)",
  },
  ruleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  ruleLabel: {
    flexShrink: 0,
    width: 64,
    fontSize: 13,
    fontWeight: 500,
    color: "var(--ant-color-text-secondary)",
  },
  ruleInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: 12.5,
  },
  ruleStatus: {
    flexShrink: 0,
    width: 200,
    fontSize: 12,
  },
  statusOk: {
    color: "var(--ant-color-text-tertiary)",
  },
  statusError: {
    color: "var(--ant-color-error)",
  },
  portInput: {
    width: 140,
  },
  portHint: {
    fontSize: 12,
    color: "var(--ant-color-text-tertiary)",
  },
});

export default function SettingsPage() {
  const { message } = AntdApp.useApp();
  const { activeSite } = useSite();

  // ===== 站点信息 =====
  const [name, setName] = useState(activeSite.name);
  const [description, setDescription] = useState(activeSite.description ?? "");
  const [savingSite, setSavingSite] = useState(false);

  const handleSaveSite = async () => {
    if (!name.trim()) {
      message.error("站点名称不能为空");
      return;
    }
    setSavingSite(true);
    try {
      await updateSite(activeSite.id, name.trim(), description.trim() || null);
      message.success("站点信息已保存，即将刷新界面");
      // 站点名出现在侧边栏等多处，统一整页刷新
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      message.error(String(e));
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
      .catch((e) => message.error(String(e)));
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
      message.error("端口需在 1024 - 65535 之间");
      return;
    }
    setSavingPort(true);
    try {
      await setPreviewPort(value);
      message.success(`预览端口已固定为 ${value}`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setSavingPort(false);
    }
  };

  const handleSaveRules = async () => {
    if (!rules) return;
    setSavingRules(true);
    try {
      await setRoutingRules(activeSite.id, rules);
      message.success("路由规则已保存");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSavingRules(false);
    }
  };

  const updatePattern = (route: string, pattern: string) => {
    setRules((prev) => (prev ? { ...prev, [route]: pattern } : prev));
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>设置</div>
          <div {...stylex.props(pageStyles.pageSub)}>站点与全局配置</div>
        </div>
      </div>

      {rules === null ? (
        <div
          {...stylex.props(
            x.display.flex,
            x.justifyContent.center,
            x.padding._48px,
          )}
        >
          <Spin />
        </div>
      ) : (
        <>
          <div {...stylex.props(styles.section, pageStyles.card)}>
            <div {...stylex.props(styles.sectionHead)}>站点信息</div>
            <div {...stylex.props(styles.sectionBody)}>
              <div {...stylex.props(styles.fieldRow)}>
                <span {...stylex.props(styles.fieldLabel)}>站点名称</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="站点名称"
                />
              </div>
              <div {...stylex.props(styles.fieldRow)}>
                <span {...stylex.props(styles.fieldLabel)}>站点描述</span>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话介绍这个站点（可选）"
                />
              </div>
              <div {...stylex.props(styles.fieldRow)}>
                <span {...stylex.props(styles.fieldLabel)} />
                <Button
                  type="primary"
                  loading={savingSite}
                  onClick={handleSaveSite}
                >
                  保存
                </Button>
              </div>
            </div>
          </div>

          <div {...stylex.props(styles.section, pageStyles.card)}>
            <div {...stylex.props(styles.sectionHead)}>预览</div>
            <div {...stylex.props(styles.sectionBody)}>
              <div {...stylex.props(styles.fieldRow)}>
                <span {...stylex.props(styles.fieldLabel)}>预览端口</span>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                  placeholder="默认 12739"
                  {...stylex.props(styles.portInput)}
                />
                <Button loading={savingPort} onClick={handleSavePort}>
                  保存
                </Button>
              </div>
              <div {...stylex.props(styles.portHint)}>
                预览地址 http://127.0.0.1:端口/ ；端口被其他程序占用时保存会失败，请更换后重试。
              </div>
            </div>
          </div>

          <div {...stylex.props(styles.section, pageStyles.card)}>
            <div {...stylex.props(styles.sectionHead)}>
              路由规则
              <Button
                size="small"
                onClick={() => setRules({ ...DEFAULT_RULES })}
              >
                恢复默认
              </Button>
            </div>
            <div {...stylex.props(styles.sectionBody)}>
              {(
                [
                  "index",
                  "post",
                  "page",
                  "category",
                  "tag",
                  "archive",
                ] as const
              ).map((route) => {
                const check = checkByRoute[route];
                return (
                  <div key={route} {...stylex.props(styles.ruleRow)}>
                    <span {...stylex.props(styles.ruleLabel)}>
                      {ROUTE_LABELS[route]}
                    </span>
                    <Input
                      value={rules[route]}
                      onChange={(e) => updatePattern(route, e.target.value)}
                      status={check && !check.ok ? "error" : undefined}
                      {...stylex.props(styles.ruleInput)}
                    />
                    <span
                      {...stylex.props(
                        styles.ruleStatus,
                        check?.ok ? styles.statusOk : styles.statusError,
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
              <div {...stylex.props(styles.fieldRow)}>
                <span {...stylex.props(styles.fieldLabel)} />
                <Button
                  type="primary"
                  disabled={!rulesValid}
                  loading={savingRules}
                  onClick={handleSaveRules}
                >
                  保存路由规则
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
