import * as React from 'react';

import { CircleAlert, CircleCheck } from 'lucide-react';

import { ToastContext } from '@/lib/use-toast';
import { cn } from '@/lib/utils';

/**
 * 浮层提示（design .toast-wrap / .toast）：底部居中的深色小条，
 * 2 秒后淡出，指针事件穿透（不挡操作）。
 */
import type { ToastKind } from '@/lib/use-toast';

type ToastItem = {
  id: number;
  kind: ToastKind;
  /** 到点后先淡出，再移除（design：2000ms 淡出，2300ms 移除） */
  leaving?: boolean;
  message: string;
};


/** 与 design 一致：2000ms 后开始淡出，2300ms 移除 */
const FADE_AFTER = 2000;
const REMOVE_AFTER = 2300;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  const toast = React.useCallback((message: string, kind: ToastKind = 'success') => {
    const id = (nextId.current += 1);
    setItems((prev) => [...prev, { id, kind, message }]);
    timers.current.push(
      setTimeout(
        () =>
          setItems((prev) =>
            prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
          ),
        FADE_AFTER
      ),
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), REMOVE_AFTER)
    );
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-8.5 left-1/2 z-90 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {items.map((item) => (
          <div
            className={cn(
              'flex animate-toast-in items-center gap-2 rounded-lg bg-toast px-4 py-2 text-toast-foreground text-sm shadow-pop transition-opacity duration-200',
              item.leaving && 'opacity-0'
            )}
            data-kind={item.kind}
            data-slot="toast"
            data-testid="toast"
            key={item.id}
            role="status"
          >
            {item.kind === 'error' ? (
              <CircleAlert className="size-4 shrink-0 text-toast-destructive" />
            ) : (
              <CircleCheck className="size-4 shrink-0 text-toast-success" />
            )}
            <span className={cn('whitespace-nowrap')}>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
