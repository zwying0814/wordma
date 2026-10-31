import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  initialHref: string;
  onOpenChange: (open: boolean) => void;
  /** href 为 null 表示移除链接 */
  onApply: (href: string | null) => void;
}

/** 规范化并校验链接：拒绝脚本协议，缺少协议时补 https:// */
function normalizeLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function LinkDialog({
  open,
  initialHref,
  onOpenChange,
  onApply,
}: Props) {
  const [value, setValue] = useState(initialHref);

  useEffect(() => {
    if (open) setValue(initialHref);
  }, [open, initialHref]);

  const currentHref = normalizeLink(value);
  const openCurrent = () => {
    if (!currentHref) return;
    if (isTauri()) {
      void openUrl(currentHref).catch(() => {});
    } else {
      window.open(currentHref, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(normalizeLink(value));
          }}
        >
          <DialogHeader>
            <DialogTitle>链接</DialogTitle>
            <DialogDescription>
              输入地址后应用；留空或点「移除」可取消链接。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={value}
            placeholder="https://example.com"
            aria-label="链接地址"
            onChange={(event) => setValue(event.target.value)}
          />
          <DialogFooter>
            <div className="flex gap-2 sm:mr-auto">
              {initialHref ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!currentHref}
                  onClick={openCurrent}
                >
                  打开
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={!initialHref}
                onClick={() => onApply(null)}
              >
                移除
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              应用
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
