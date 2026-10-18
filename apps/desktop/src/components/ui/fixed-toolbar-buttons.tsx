'use client';

import * as React from 'react';

import {
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  HighlighterIcon,
  ItalicIcon,
  PaintBucketIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { AlignToolbarButton } from './align-toolbar-button';
import { EmojiToolbarButton } from './emoji-toolbar-button';
import { FontColorToolbarButton } from './font-color-toolbar-button';
import { RedoToolbarButton, UndoToolbarButton } from './history-toolbar-button';
import {
  IndentToolbarButton,
  OutdentToolbarButton,
} from './indent-toolbar-button';
import { InsertToolbarButton } from './insert-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
  TodoListToolbarButton,
} from './list-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { TableToolbarButton } from './table-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';
import { ImageToolbarButton } from './image-toolbar-button';

type ToolbarGroupDef = {
  key: string;
  node: React.ReactNode;
};

/** 分组定义：按优先级排列，溢出的组自动收纳进 More 菜单 */
function buildGroups(): ToolbarGroupDef[] {
  return [
    {
      key: 'history',
      node: (
        <>
          <UndoToolbarButton />
          <RedoToolbarButton />
        </>
      ),
    },
    {
      key: 'insert-turninto',
      node: (
        <>
          <InsertToolbarButton />
          <TurnIntoToolbarButton />
        </>
      ),
    },
    {
      key: 'marks',
      node: (
        <>
          <MarkToolbarButton
            aria-label="Bold"
            nodeType={KEYS.bold}
            tooltip="Bold (⌘+B)"
          >
            <BoldIcon />
          </MarkToolbarButton>
          <MarkToolbarButton
            aria-label="Italic"
            nodeType={KEYS.italic}
            tooltip="Italic (⌘+I)"
          >
            <ItalicIcon />
          </MarkToolbarButton>
          <MarkToolbarButton
            aria-label="Underline"
            nodeType={KEYS.underline}
            tooltip="Underline (⌘+U)"
          >
            <UnderlineIcon />
          </MarkToolbarButton>
          <MarkToolbarButton
            aria-label="Strikethrough"
            nodeType={KEYS.strikethrough}
            tooltip="Strikethrough (⌘+⇧+M)"
          >
            <StrikethroughIcon />
          </MarkToolbarButton>
          <MarkToolbarButton
            aria-label="Code"
            nodeType={KEYS.code}
            tooltip="Code (⌘+E)"
          >
            <Code2Icon />
          </MarkToolbarButton>
        </>
      ),
    },
    {
      key: 'font',
      node: (
        <>
          <FontColorToolbarButton nodeType={KEYS.color} tooltip="Text Color">
            <BaselineIcon />
          </FontColorToolbarButton>
          <FontColorToolbarButton
            nodeType={KEYS.backgroundColor}
            tooltip="Background Color"
          >
            <PaintBucketIcon />
          </FontColorToolbarButton>
          <MarkToolbarButton
            aria-label="Highlight"
            nodeType={KEYS.highlight}
            tooltip="Highlight"
          >
            <HighlighterIcon />
          </MarkToolbarButton>
        </>
      ),
    },
    {
      key: 'align-list',
      node: (
        <>
          <AlignToolbarButton />
          <BulletedListToolbarButton />
          <NumberedListToolbarButton />
          <TodoListToolbarButton />
          <OutdentToolbarButton />
          <IndentToolbarButton />
        </>
      ),
    },
    {
      key: 'media-link',
      node: (
        <>
          <LinkToolbarButton />
          <TableToolbarButton />
          <ImageToolbarButton />
          <EmojiToolbarButton aria-label="Emoji" />
        </>
      ),
    },
  ];
}

/** 固定工具栏：按容器宽度动态收纳溢出分组到 More 菜单 */
export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();

  const groups = React.useMemo(() => buildGroups(), []);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const groupRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const widthsRef = React.useRef<number[]>([]);
  const [fitCount, setFitCount] = React.useState(groups.length);

  // 供 ResizeObserver 回调读取当前值（避免闭包过期）
  const fitCountRef = React.useRef(fitCount);
  fitCountRef.current = fitCount;

  /** 测量各组自然宽度：只在「全部可见」时测（收纳后的组 offsetWidth 为 0） */
  const measure = React.useCallback(() => {
    if (fitCountRef.current !== groups.length) return;
    widthsRef.current = groupRefs.current.map((el) => el?.offsetWidth ?? 0);
  }, [groups.length]);

  const fit = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const moreWidth = 44;
    const available = container.clientWidth - moreWidth;
    if (widthsRef.current.length === 0) measure();

    let used = 0;
    let count = 0;
    for (const width of widthsRef.current) {
      if (used + width <= available) {
        used += width;
        count += 1;
      } else {
        break;
      }
    }

    const next = Math.max(1, count);
    setFitCount((prev) => (prev === next ? prev : next));
  }, [measure]);

  React.useLayoutEffect(() => {
    // 首帧 fitCount = groups.length，全部可见，此时测量才准
    measure();
    fit();
    const ro = new ResizeObserver(() => {
      fit();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fit, measure]);

  const overflowed = groups.slice(fitCount);

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex w-full" data-testid="toolbar-groups" ref={containerRef}>
      {/*
        始终渲染全部组，溢出的只用 CSS 隐藏：
        若按 fitCount 条件渲染，分组在「可见 ↔ 溢出」之间切换时 React 会卸载再挂载，
        DOM 节点被重建 —— 鼠标正好在那一刻点击就会点空（E2E 里表现为
        element was detached from the DOM）。
        隐藏的副本不参与可访问性树，getByRole 不会匹配到，因此不会与 More 菜单里的
        副本撞 strict mode。
      */}
      {groups.map((group, index) => (
        <div
          className={index >= fitCount ? 'hidden' : undefined}
          key={group.key}
          ref={(el) => {
            groupRefs.current[index] = el;
          }}
        >
          <ToolbarGroup>{group.node}</ToolbarGroup>
        </div>
      ))}

      <ToolbarGroup>
        <MoreToolbarButton>
          {overflowed.map((group) => (
            <div className="flex items-center justify-center gap-1 py-1" key={group.key}>
              {group.node}
            </div>
          ))}
        </MoreToolbarButton>
      </ToolbarGroup>
    </div>
  );
}
