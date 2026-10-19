'use client';

import * as React from 'react';

import { Blocks, ChevronDown, Plus } from 'lucide-react';
import type { TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import { PlateElement, useEditorRef } from 'platejs/react';

import { IslandMount } from '@/components/island-mount';
import { listComponents } from '@/lib/mdx';
import type { ComponentMeta } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

/** MDX 块的数据形状（与 mdx-node-static 序列化一致） */
export type TMdxElement = TElement & {
  type: 'mdx';
  component: string;
  props?: string;
};

/** props 文本 → 对象；坏 JSON 不抛错，直接报给用户 */
function parseMdxProps(text: string | undefined): {
  ok: boolean;
  value: Record<string, unknown>;
} {
  if (!text?.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, value: {} };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, value: {} };
  }
}

/**
 * MDX 块（实时）：选组件 + 填 props + 直接渲染编译出来的岛。
 * 与图片一样是 void 元素，但保留 children 供 slate 占位。
 */
export function MdxElement(props: PlateElementProps<TMdxElement>) {
  const editor = useEditorRef();
  const { element } = props;
  const component = element.component ?? '';
  const propsText = element.props ?? '';

  const [components, setComponents] = React.useState<ComponentMeta[]>([]);
  const [draftProps, setDraftProps] = React.useState(propsText);
  const parsed = parseMdxProps(draftProps);

  React.useEffect(() => {
    let cancelled = false;
    void listComponents()
      .then((list) => {
        if (!cancelled) setComponents(list);
      })
      .catch(() => {
        if (!cancelled) setComponents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 外部（撤销/重载）改了 props 时同步回输入框
  React.useEffect(() => {
    setDraftProps(propsText);
  }, [propsText]);

  const setField = (field: Partial<TMdxElement>) => {
    const path = editor.api.findPath(element);
    if (!path) return;
    editor.tf.setNodes(field, { at: path });
  };

  return (
    <PlateElement {...props} className="py-2">
      <div
        className="rounded-xl border border-border bg-card shadow-card"
        contentEditable={false}
        data-testid="mdx-block"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs">
            <Blocks className="size-3.5" />
            MDX 组件
          </span>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button
                  className="h-7 px-2.5 text-xs"
                  data-testid="mdx-component-selector"
                  size="sm"
                  variant="outline"
                >
                  {component || '选择组件'}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
              {components.length === 0 && (
                <div className="px-2.5 py-2 text-muted-foreground text-xs">
                  还没有组件，去「组件」页新建一个
                </div>
              )}
              {components.map((item) => (
                <DropdownMenuItem
                  data-testid={`mdx-option-${item.name}`}
                  key={item.name}
                  onClick={() => setField({ component: item.name })}
                >
                  {item.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            className="h-7 w-64 font-mono text-xs"
            data-testid="mdx-props-input"
            onChange={(event) => setDraftProps(event.target.value)}
            onBlur={() => {
              if (parsed.ok) setField({ props: draftProps });
            }}
            placeholder='props（JSON，可留空）：{"start":5}'
            value={draftProps}
          />

          {!parsed.ok && (
            <span className="text-destructive text-xs" data-testid="mdx-props-error">
              props 必须是 JSON 对象
            </span>
          )}
        </div>

        <div className="p-3">
          {component ? (
            <IslandMount
              className="[&_[data-island-host]]:min-h-8"
              name={component}
              props={parsed.ok ? parsed.value : {}}
            />
          ) : (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <Plus className="size-4" />
              选一个组件后，这里会实时渲染它的效果
            </div>
          )}
        </div>
      </div>
      {props.children}
    </PlateElement>
  );
}
