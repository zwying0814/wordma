import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Popconfirm, Spin } from "antd";
import { Check, Eye, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useSite } from "../context/SiteContext";
import {
  deleteTheme,
  listThemes,
  openPreview,
  openThemesDir,
  renderSite,
  setActiveTheme,
  type ThemeMeta,
  type ThemePreview,
} from "../lib/theme";
import { pageStyles } from "../styles/page.stylex";

// 与设计稿 .theme-grid / .theme-card / .theme-thumb 对齐
const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: 18,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    overflow: "hidden",
  },
  cardActive: {
    // 设计稿 .theme-card.active：激活卡片使用主题色描边
    borderColor: "rgba(53, 99, 217, 0.45)",
  },
  thumb: {
    position: "relative",
    display: "block",
    aspectRatio: "16 / 9",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
    overflow: "hidden",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: "13px 16px 16px",
    flex: 1,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 14.5,
    fontWeight: 700,
    color: "var(--ant-color-text)",
  },
  activeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--ant-color-primary)",
    backgroundColor: "var(--ant-color-primary-bg)",
    borderRadius: 999,
    padding: "1px 9px",
  },
  desc: {
    fontSize: 12.5,
    color: "var(--ant-color-text-tertiary)",
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  tagChip: {
    fontSize: 11,
    lineHeight: "18px",
    padding: "0 8px",
    borderRadius: 999,
    color: "var(--ant-color-text-secondary)",
    backgroundColor: "var(--ant-color-fill-secondary)",
  },
  previewUrl: {
    fontSize: 11.5,
    color: "var(--ant-color-primary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  foot: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: "auto",
    paddingTop: 12,
  },
});

// theme.json 未声明 preview 时的兜底配色
const FALLBACK_PREVIEW: ThemePreview = {
  bg: "#FFFFFF",
  chromeBg: "#FAFAFA",
  ink: "#1F2328",
  muted: "#6B7280",
  line: "#E5E7EB",
  accent: "#3563D9",
};

function Line({
  color,
  width,
  short,
}: {
  color: string;
  width?: string;
  short?: boolean;
}) {
  return (
    <i
      style={{
        display: "block",
        height: short ? 4 : 5,
        borderRadius: 3,
        background: color,
        width,
        opacity: short ? 0.55 : 1,
      }}
    />
  );
}

function IconDot({ color }: { color: string }) {
  return (
    <i style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
  );
}

/** 按设计稿 themeThumb 画的迷你站点示意图（纯 CSS 绘制，无截图） */
function ThemeThumb({ theme }: { theme: ThemeMeta }) {
  const p = theme.preview ?? FALLBACK_PREVIEW;
  const chrome = (
    <div
      style={{
        background: p.chromeBg,
        height: "13%",
        minHeight: 14,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 8%",
        borderBottom: `1px solid ${p.line}`,
      }}
    >
      <IconDot color={p.accent} />
      <IconDot color={p.line} />
      <IconDot color={p.line} />
    </div>
  );
  const title = <Line color={p.ink} width="58%" />;
  const meta = <Line color={p.ink} width="34%" short />;
  const line = <Line color={p.line} />;

  let body: React.ReactNode;
  if (theme.layout === "cards") {
    const card = (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 5,
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          background: p.chromeBg,
          border: `1px solid ${p.line}`,
        }}
      >
        {title}
        {meta}
        {line}
      </div>
    );
    body = (
      <>
        <div style={{ display: "flex", gap: "8%", flex: 1, minHeight: 0 }}>
          {card}
          {card}
        </div>
        {line}
      </>
    );
  } else if (theme.layout === "magazine") {
    body = (
      <div style={{ display: "flex", gap: "8%", flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: 1.6,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {title}
          {meta}
          {line}
          {line}
          {line}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            borderLeft: `1px solid ${p.line}`,
            paddingLeft: "6%",
          }}
        >
          {line}
          {line}
          {line}
          {line}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {title}
        {meta}
        {line}
        {line}
        {line}
        {line}
        {line}
      </>
    );
  }

  return (
    <div {...stylex.props(styles.thumb)} style={{ background: p.bg }} aria-hidden>
      {chrome}
      <div
        style={{
          padding: "7% 9%",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
          minHeight: 0,
        }}
      >
        {body}
      </div>
      <i
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: "34%",
          height: 3,
          background: p.accent,
        }}
      />
    </div>
  );
}

export default function ThemePage() {
  const { message } = AntdApp.useApp();
  const { activeSite } = useSite();
  const [themes, setThemes] = useState<ThemeMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    listThemes(activeSite.id)
      .then(setThemes)
      .catch((e) => message.error(String(e)));
  }, [activeSite.id, message]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleActivate = async (theme: ThemeMeta) => {
    setBusy(theme.name);
    try {
      await setActiveTheme(activeSite.id, theme.name);
      reload();
      message.success(
        `站点「${activeSite.name}」已启用「${theme.displayName}」，点「生成预览」查看效果`,
      );
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (theme: ThemeMeta) => {
    setBusy(theme.name);
    try {
      await deleteTheme(theme.name);
      reload();
      message.success(`主题「${theme.displayName}」已删除`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handlePreview = async () => {
    setBusy("__preview__");
    try {
      const report = await renderSite(activeSite.id);
      await openPreview(activeSite.id);
      message.success(`已生成 ${report.files} 个文件，正在浏览器中打开预览`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>主题</div>
          <div {...stylex.props(pageStyles.pageSub)}>
            当前站点「{activeSite.name}」· 已启用{" "}
            {themes?.find((t) => t.active)?.displayName ?? "未启用"}
          </div>
        </div>
        <div {...stylex.props(x.display.flex, x.gap._8px)}>
          <Button
            icon={<Eye size={14} />}
            loading={busy === "__preview__"}
            onClick={handlePreview}
          >
            生成预览
          </Button>
          <Button
            icon={<FolderOpen size={14} />}
            onClick={() => openThemesDir().catch((e) => message.error(String(e)))}
          >
            打开主题目录
          </Button>
          <Button icon={<RefreshCw size={14} />} onClick={reload}>
            刷新列表
          </Button>
        </div>
      </div>

      {themes === null ? (
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
        <div {...stylex.props(styles.grid)}>
          {themes.map((theme) => {
            const usable = theme.invalidMessage === null;
            return (
              <div
                key={theme.name}
                {...stylex.props(
                  styles.card,
                  theme.active && styles.cardActive,
                )}
              >
                <ThemeThumb theme={theme} />
                <div {...stylex.props(styles.body)}>
                  <div {...stylex.props(styles.nameRow)}>
                    <span {...stylex.props(styles.name)}>
                      {theme.displayName}
                    </span>
                    {theme.active && (
                      <span {...stylex.props(styles.activeBadge)}>
                        <Check size={12} />
                        使用中
                      </span>
                    )}
                  </div>
                  <span {...stylex.props(styles.desc)}>
                    {theme.invalidMessage ?? theme.description}
                  </span>
                  {usable && theme.tags.length > 0 && (
                    <div {...stylex.props(styles.tagsRow)}>
                      {theme.tags.map((tag) => (
                        <span key={tag} {...stylex.props(styles.tagChip)}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {theme.active && theme.previewUrl && (
                    <div
                      {...stylex.props(styles.previewUrl)}
                      title={theme.previewUrl}
                    >
                      预览地址：{theme.previewUrl}
                    </div>
                  )}
                  <div {...stylex.props(styles.foot)}>
                    {theme.invalidMessage ? (
                      <Button size="small" disabled>
                        主题结构异常
                      </Button>
                    ) : theme.active ? (
                      <Button size="small" disabled>
                        当前主题
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        loading={busy === theme.name}
                        onClick={() => handleActivate(theme)}
                      >
                        启用此主题
                      </Button>
                    )}
                    <Button
                      size="small"
                      disabled={!usable}
                      loading={busy === `preview:${theme.name}`}
                      onClick={async () => {
                        if (!theme.active) await handleActivate(theme);
                        await handlePreview();
                      }}
                    >
                      预览
                    </Button>
                    {theme.name !== "default" && !theme.active && (
                      <Popconfirm
                        title="删除主题"
                        description="主题文件将被移除，确定删除？"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDelete(theme)}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<Trash2 size={14} />}
                          aria-label={`删除主题「${theme.displayName}」`}
                        />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
