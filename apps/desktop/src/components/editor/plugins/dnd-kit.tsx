'use client';

import { DndPlugin } from '@platejs/dnd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { BlockDraggable } from '@/components/ui/block-draggable';

export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
      // 参考实现里还有 onDropFiles（拖文件插入媒体），依赖未移植的
      // PlaceholderPlugin，这里不接：拖文件不会插入媒体
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => (
        <DndProvider backend={HTML5Backend}>{children}</DndProvider>
      ),
    },
  }),
];
