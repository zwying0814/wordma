'use client';

import * as React from 'react';

import { compileComponent } from '@/lib/mdx';
import { errorMessage } from '@/lib/errors';

/** 宿主 React 运行时（index.html 的 importmap 指向同一个地址） */
const RUNTIME_URL = 'wordma-island://runtime/react.js';

/**
 * 岛挂载器：把编译好的组件挂到一个独立 React root 上。
 *
 * 为什么不直接 import 组件？组件是运行时编译出来的模块（wordma-island://…），
 * 只能动态 import；而它自带 React 运行时（与应用不是同一个实例），所以用嵌套
 * root 隔离，只通过 props 通信。
 */
export function IslandMount({
  className,
  name,
  props,
  onError,
}: {
  className?: string;
  name: string;
  props?: Record<string, unknown>;
  onError?: (message: string | null) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const propsKey = JSON.stringify(props ?? {});

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !name) return;

    let cancelled = false;
    let root: { render: (node: unknown) => void; unmount: () => void } | null = null;

    setError(null);
    onError?.(null);

    void (async () => {
      try {
        const compiled = await compileComponent(name);
        if (cancelled) return;

        if (!compiled.ok) {
          const message = compiled.errors.join('\n');
          setError(message);
          onError?.(message);
          return;
        }

        // 运行时与岛都来自自定义协议：用变量 import，避免打包器尝试静态解析
        const runtimeUrl = RUNTIME_URL;
        const islandUrl = compiled.url;
        const [runtime, mod] = await Promise.all([
          import(/* @vite-ignore */ runtimeUrl),
          import(/* @vite-ignore */ islandUrl),
        ]);
        if (cancelled) return;

        const Component = (mod as { default?: unknown }).default;
        if (typeof Component !== 'function') {
          throw new Error('组件需要 default 导出一个 React 组件');
        }

        const ReactRuntime = runtime as unknown as {
          createElement: (type: unknown, props: unknown) => unknown;
          createRoot: (el: Element) => { render: (node: unknown) => void; unmount: () => void };
        };
        root = ReactRuntime.createRoot(host);
        root.render(ReactRuntime.createElement(Component, JSON.parse(propsKey)));
      } catch (err) {
        if (cancelled) return;
        const message = errorMessage(err);
        setError(message);
        onError?.(message);
      }
    })();

    return () => {
      cancelled = true;
      // 卸载时销毁嵌套 root，避免组件里的定时器/订阅泄漏
      try {
        root?.unmount();
      } catch {
        /* root 可能已经随 DOM 一起消失 */
      }
    };
  }, [name, propsKey, onError]);

  return (
    <div className={className}>
      <div data-island-host={name} ref={hostRef} />
      {error && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 font-mono text-destructive text-xs">
          {error}
        </pre>
      )}
    </div>
  );
}
