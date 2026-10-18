'use client';

import { insertInlineEquation } from '@platejs/math';
import { RadicalIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';
import * as React from 'react';

import { ToolbarButton } from './toolbar';

/** 把选中的文本标记为行内公式（浮动工具栏） */
export function InlineEquationToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();

  return (
    <ToolbarButton
      aria-label="Mark as equation"
      onClick={() => {
        insertInlineEquation(editor);
      }}
      tooltip="Mark as equation"
      {...props}
    >
      <RadicalIcon />
    </ToolbarButton>
  );
}
