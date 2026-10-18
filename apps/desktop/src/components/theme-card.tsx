import * as React from 'react';

import { Check, Eye, Trash2 } from 'lucide-react';

import type { ThemeMeta } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * 主题配色（theme.yaml 的 preview 字段，data 驱动）：
 * 缺字段时回退到应用令牌，保证第三方主题没写 preview 也能看。
 */
type PreviewPalette = {
  bg: string;
  chromeBg: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
};

function paletteOf(theme: ThemeMeta): PreviewPalette {
  const p = theme.preview ?? {};
  return {
    bg: p.bg ?? 'var(--card)',
    chromeBg: p.chromeBg ?? 'var(--muted)',
    ink: p.ink ?? 'var(--foreground)',
    muted: p.muted ?? 'var(--muted-foreground)',
    line: p.line ?? 'var(--border)',
    accent: p.accent ?? 'var(--primary)',
  };
}

/** 主题缩略图（design .theme-thumb）：按 layout 画三种版式骨架 */
export function ThemeThumb({ theme }: { theme: ThemeMeta }) {
  const p = paletteOf(theme);

  const line = (key: string, extra?: React.CSSProperties) => (
    <i
      className="block h-[5px] rounded-[3px]"
      key={key}
      style={{ background: p.line, ...extra }}
    />
  );
  const title = (
    <i
      className="block h-2 w-[58%] rounded-[3px]"
      key="title"
      style={{ background: p.ink }}
    />
  );
  const meta = (
    <i
      className="block h-1 w-[34%] rounded-[3px] opacity-55"
      key="meta"
      style={{ background: p.ink }}
    />
  );

  let body: React.ReactNode;
  if (theme.layout === 'cards') {
    const card = (key: string) => (
      <div
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-[5px] p-1.5"
        key={key}
        style={{ background: p.chromeBg, border: `1px solid ${p.line}` }}
      >
        {title}
        {meta}
        {line(`${key}-l`)}
      </div>
    );
    body = (
      <>
        <div className="flex min-h-0 flex-1 gap-[8%]">
          {card('a')}
          {card('b')}
        </div>
        {line('c')}
      </>
    );
  } else if (theme.layout === 'magazine') {
    body = (
      <div className="flex min-h-0 flex-1 gap-[8%]">
        <div className="flex min-w-0 flex-[1.6] flex-col gap-1.5">
          {title}
          {meta}
          {['a', 'b', 'c'].map((k) => line(k))}
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col gap-1.5 pl-[6%]"
          style={{ borderLeft: `1px solid ${p.line}` }}
        >
          {['d', 'e', 'f', 'g'].map((k) => line(k))}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {title}
        {meta}
        {line('sep')}
        {['a', 'b', 'c', 'd'].map((k) => line(k))}
      </>
    );
  }

  return (
    <div
      className="relative aspect-video overflow-hidden border-b"
      style={{ background: p.bg, borderColor: p.line }}
    >
      <div
        className="flex h-[13%] min-h-3.5 items-center gap-1 px-[8%]"
        style={{ background: p.chromeBg }}
      >
        <i className="size-[5px] rounded-full" style={{ background: p.accent }} />
        <i className="size-[5px] rounded-full" style={{ background: p.line }} />
        <i className="size-[5px] rounded-full" style={{ background: p.line }} />
      </div>
      <div className="flex flex-col gap-1.5 px-[9%] py-[7%]">{body}</div>
      <span
        className="absolute right-0 bottom-0 h-[3px] w-[34%]"
        style={{ background: p.accent }}
      />
    </div>
  );
}

/** 主题卡片（design .theme-card） */
export function ThemeCard({
  busy,
  onActivate,
  onDelete,
  onPreview,
  theme,
}: {
  busy: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  theme: ThemeMeta;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow',
        theme.active ? 'border-primary/45' : 'hover:shadow-pop'
      )}
      data-testid="theme-card"
    >
      <ThemeThumb theme={theme} />

      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{theme.displayName}</span>
          {theme.active && (
            <Chip data-testid="theme-card-active" variant="accent">
              <Check className="size-3" />
              使用中
            </Chip>
          )}
        </div>

        <span className="text-muted-foreground text-xs">
          {theme.description || `${theme.name} · v${theme.version}`}
        </span>

        {theme.invalidMessage ? (
          <span className="text-destructive text-xs">{theme.invalidMessage}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5 pt-0.5">
            {theme.tags.map((tag) => (
              <Chip key={tag} variant="secondary">
                {tag}
              </Chip>
            ))}
            <Chip variant="secondary">{theme.layout}</Chip>
          </span>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          <Button
            data-testid={`theme-activate-${theme.name}`}
            disabled={busy || theme.active}
            onClick={onActivate}
            size="sm"
          >
            {theme.active ? '当前主题' : '启用此主题'}
          </Button>
          <Button
            data-testid={`theme-preview-${theme.name}`}
            aria-label={`预览主题「${theme.displayName}」`}
            onClick={onPreview}
            size="sm"
            variant="outline"
          >
            <Eye className="size-3.5" />
            预览
          </Button>
          <Button
            className="ml-auto"
            data-testid={`theme-delete-${theme.name}`}
            aria-label={`删除主题「${theme.displayName}」`}
            disabled={busy || theme.active}
            onClick={onDelete}
            size="icon-sm"
            variant="destructiveGhost"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 主题预览弹窗（design .dialog-wide）：用主题自己的配色渲染一份站点预览 */
export function ThemePreviewDialog({
  onActivate,
  onOpenChange,
  open,
  posts,
  site,
  theme,
}: {
  onActivate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  posts: { id: number; title: string; meta: string }[];
  site: { name: string; description: string | null };
  theme: ThemeMeta | null;
}) {
  if (!theme) return null;
  const p = paletteOf(theme);
  const serif = theme.layout === 'magazine';

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[660px] gap-0 overflow-hidden p-0 sm:max-w-[660px]">
        <div style={{ background: p.bg, color: p.ink }}>
          <div
            className="flex items-center gap-2 px-5 py-3 font-semibold text-sm"
            style={{ background: p.chromeBg }}
          >
            <i className="size-2.5 rounded-full" style={{ background: p.accent }} />
            {site.name}
          </div>

          <div className="px-5 pt-6 pb-4">
            <span
              className={cn('block font-bold text-2xl leading-tight', serif && 'font-editor')}
            >
              {site.name}
            </span>
            <span className="mt-1 block text-xs" style={{ color: p.muted }}>
              {site.description || '一个安静的博客'}
            </span>
          </div>

          <div className="max-h-[46vh] overflow-y-auto px-5 pb-5">
            {posts.length === 0 ? (
              <div
                className="border-t py-3 text-xs"
                style={{ borderColor: p.line, color: p.muted }}
              >
                这个站点还没有文章，启用后从这里开始。
              </div>
            ) : (
              posts.map((post) => (
                <div
                  className="border-t py-3"
                  key={post.id}
                  style={{ borderColor: p.line }}
                >
                  <span
                    className={cn('block font-semibold text-sm', serif && 'font-editor')}
                  >
                    {post.title}
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: p.muted }}>
                    {post.meta}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 弹窗是 p-0：抵消 DialogFooter 默认的负外边距，否则页脚会超出圆角 */}
        <DialogFooter className="mx-0 mb-0 mt-0 rounded-none border-t border-border px-4 py-3.5">
          <span className="mr-auto min-w-0 truncate text-muted-foreground text-xs">
            「{theme.displayName}」· {theme.description || theme.name}
          </span>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            关闭
          </Button>
          <Button disabled={theme.active} onClick={onActivate}>
            {theme.active ? '使用中' : '启用此主题'}
          </Button>
        </DialogFooter>
        <DialogTitle className="sr-only">预览主题 {theme.displayName}</DialogTitle>
        <DialogDescription className="sr-only">
          用主题配色渲染的站点预览
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
