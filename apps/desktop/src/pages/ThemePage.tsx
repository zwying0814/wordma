import { useCallback, useEffect, useState } from "react";
import { Check, Eye, FolderOpen, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import {
  deleteTheme,
  listThemes,
  openPreview,
  openThemesDir,
  renderSite,
  setActiveTheme,
  type ThemeMeta,
} from "../lib/theme";
import ThemeSettingsModal from "../components/ThemeSettingsModal";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { EmptyState } from "../components/common/empty-state";
import { PageHeader } from "../components/common/page-header";
import { PageView } from "../components/common/page-view";

// 缩略图使用应用设计令牌，不再从 theme.yaml 读取配色
const THUMB = {
  bg: "var(--card)",
  chromeBg: "var(--muted)",
  ink: "var(--foreground)",
  line: "var(--border)",
  accent: "var(--primary)",
} as const;

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
  const p = THUMB;
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
    <div
      className="relative block aspect-[16/9] overflow-hidden border-b border-border"
      style={{ background: p.bg }}
      aria-hidden
    >
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
  const { activeSite } = useSite();
  const [themes, setThemes] = useState<ThemeMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsTheme, setSettingsTheme] = useState<ThemeMeta | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ThemeMeta | null>(null);

  const reload = useCallback(() => {
    listThemes(activeSite.id)
      .then(setThemes)
      .catch((e) => toast.error(String(e)));
  }, [activeSite.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleActivate = async (theme: ThemeMeta) => {
    setBusy(theme.name);
    try {
      await setActiveTheme(activeSite.id, theme.name);
      reload();
      toast.success(
        `站点「${activeSite.name}」已启用「${theme.displayName}」，点「生成预览」查看效果`,
      );
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(pendingDelete.name);
    try {
      await deleteTheme(pendingDelete.name);
      reload();
      toast.success(`主题「${pendingDelete.displayName}」已删除`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
      setPendingDelete(null);
    }
  };

  const handlePreview = async () => {
    setBusy("__preview__");
    try {
      const report = await renderSite(activeSite.id);
      await openPreview(activeSite.id);
      toast.success(`已生成 ${report.files} 个文件，正在浏览器中打开预览`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageView>
      <PageHeader
        title="主题"
        subtitle={`当前站点「${activeSite.name}」· 已启用 ${
          themes?.find((t) => t.active)?.displayName ?? "未启用"
        }`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy === "__preview__"}
              onClick={handlePreview}
            >
              {busy === "__preview__" ? (
                <Spinner className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
              生成预览
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                openThemesDir().catch((e) => toast.error(String(e)))
              }
            >
              <FolderOpen className="size-3.5" />
              打开主题目录
            </Button>
            <Button variant="outline" onClick={reload}>
              <RefreshCw className="size-3.5" />
              刷新列表
            </Button>
          </>
        }
      />

      {themes === null ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : themes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="还没有主题"
            description="把主题文件夹放进主题目录，或打开目录查看内置主题。"
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[18px]">
          {themes.map((theme) => {
            const usable = theme.invalidMessage === null;
            return (
              <div
                key={theme.name}
                className={
                  "flex flex-col overflow-hidden rounded-lg border bg-card shadow-card " +
                  (theme.active ? "border-primary/45" : "border-border")
                }
              >
                <ThemeThumb theme={theme} />
                <div className="flex flex-1 flex-col gap-[5px] px-4 pt-[13px] pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-bold text-foreground">
                      {theme.displayName}
                    </span>
                    {theme.active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-px text-[11.5px] font-medium text-accent-foreground">
                        <Check className="size-3" />
                        使用中
                      </span>
                    )}
                  </div>
                  <span className="text-[12.5px] text-muted-foreground">
                    {theme.invalidMessage ?? theme.description}
                  </span>
                  {usable && theme.tags.length > 0 && (
                    <div className="mt-[3px] flex flex-wrap gap-1.5">
                      {theme.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-foreground/5 px-2 text-[11px] leading-[18px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {theme.active && theme.previewUrl && (
                    <div
                      className="truncate text-[11.5px] text-primary"
                      title={theme.previewUrl}
                    >
                      预览地址：{theme.previewUrl}
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-2 pt-3">
                    {theme.active && usable && theme.settings.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettingsTheme(theme)}
                      >
                        <Settings2 className="size-3.5" />
                        设置
                      </Button>
                    )}
                    {theme.invalidMessage ? (
                      <Button variant="outline" size="sm" disabled>
                        主题结构异常
                      </Button>
                    ) : theme.active ? (
                      <Button variant="outline" size="sm" disabled>
                        当前主题
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === theme.name}
                        onClick={() => handleActivate(theme)}
                      >
                        {busy === theme.name ? (
                          <Spinner className="size-3.5" />
                        ) : null}
                        启用此主题
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!usable || busy === `preview:${theme.name}`}
                      onClick={async () => {
                        if (!theme.active) await handleActivate(theme);
                        await handlePreview();
                      }}
                    >
                      {busy === `preview:${theme.name}` ? (
                        <Spinner className="size-3.5" />
                      ) : null}
                      预览
                    </Button>
                    {theme.name !== "default" && !theme.active && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                        aria-label={`删除主题「${theme.displayName}」`}
                        onClick={() => setPendingDelete(theme)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ThemeSettingsModal
        siteId={activeSite.id}
        theme={settingsTheme}
        onClose={() => setSettingsTheme(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除主题"
        description="主题文件将被移除，确定删除？"
        confirmLabel="删除"
        destructive
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </PageView>
  );
}
