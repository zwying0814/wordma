import { BlogEditor } from '@/components/editor/plate-editor';

/** 文章编辑器页：/editor/:id（T8 起接入 DB 加载/保存，当前为编辑器直连渲染） */
export function ArticleEditorPage() {
  return <BlogEditor />;
}
