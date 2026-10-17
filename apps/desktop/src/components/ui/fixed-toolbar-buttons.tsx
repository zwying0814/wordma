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

  /** 测量全部组的自然宽度（任一组被收纳后 offsetWidth=0，需先全量展开） */
  const fit = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const moreWidth = 44;
    const available = container.clientWidth - moreWidth;
    // 组宽在首次渲染时缓存一次；收纳只读缓存，不再依赖当前 DOM 宽度
    if (widthsRef.current.length === 0) {
      widthsRef.current = groupRefs.current.map((el) => el?.offsetWidth ?? 0);
    }
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
    setFitCount((prev) => (prev === Math.max(1, count) ? prev : Math.max(1, count)));
  }, []);

  React.useEffect(() => {
    // 组内容变化（如 readOnly 切换）时刷新宽度缓存
    widthsRef.current = [];
  }, [groups]);

  React.useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(() => {
      fit();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fit]);

  const visible = groups.slice(0, fitCount);
  const overflowed = groups.slice(fitCount);

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex w-full" data-testid="toolbar-groups" ref={containerRef}>
      {visible.map((group) => (
        <div
          key={group.key}
          ref={(el) => {
            const index = groups.findIndex((g) => g.key === group.key);
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
