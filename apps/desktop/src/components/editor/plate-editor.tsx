import type { Value } from 'platejs';

import { Plate, usePlateEditor } from 'platejs/react';

import { BlogEditorKit } from '@/components/editor/plugins/blog-editor-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons';
import { FloatingToolbar } from '@/components/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@/components/ui/floating-toolbar-buttons';

const initialValue: Value = [
  { type: 'h1', children: [{ text: '用 Plate 写博客' }] },
  {
    type: 'p',
    children: [
      { text: '支持 ' },
      { bold: true, text: '粗体' },
      { text: '、' },
      { italic: true, text: '斜体' },
      { text: '、' },
      { underline: true, text: '下划线' },
      { text: '、' },
      { code: true, text: 'inline code' },
      { text: '、' },
      { kbd: true, text: '⌘+B' },
      { text: ' 和 ' },
      { highlight: true, text: '高亮' },
      { text: '。' },
    ],
  },
  {
    type: 'blockquote',
    children: [{ type: 'p', children: [{ text: '这是一段引用。' }] }],
  },
  { type: 'p', children: [{ text: '' }] },
];

export function BlogEditor() {
  const editor = usePlateEditor({
    plugins: BlogEditorKit,
    value: initialValue,
  });

  return (
    <Plate editor={editor}>
      <EditorContainer className="h-screen">
        <FixedToolbar className="justify-start gap-1">
          <FixedToolbarButtons />
        </FixedToolbar>
        <Editor variant="demo" placeholder="输入您精彩的内容..." />
        <FloatingToolbar>
          <FloatingToolbarButtons />
        </FloatingToolbar>
      </EditorContainer>
    </Plate>
  );
}
