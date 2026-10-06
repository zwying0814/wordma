import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "./monaco.worker?worker";
import * as stylex from "@stylexjs/stylex";
import { Toolbar } from "./components/Toolbar";

// 本地 worker（无 CDN）：markdown 编辑只需基础 worker
(self as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export interface WordmaEditorProps {
  /** 初始 markdown 内容；编辑器为非受控，仅在挂载时读取（切换文章请用 key 重挂载） */
  initialValue: string;
  /** 内容变化回调，参数为 markdown 文本；请传入稳定引用（如 setState） */
  onChange: (markdown: string) => void;
  /** 右侧预览面板的完整 HTML（由应用经 Rust 渲染管线生成，防抖传入） */
  previewHtml?: string;
  /** 粘贴/拖入图片时调用：上传后返回插入 URL，返回 null 则忽略该图片 */
  onPasteImage?: (file: File) => Promise<string | null>;
  /** 工具栏“插入图片”点击时调用：返回插入 URL，null 表示取消 */
  onPickImage?: () => Promise<string | null>;
}

type SourceEditor = monaco.editor.IStandaloneCodeEditor;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
  },
  split: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
  },
  host: {
    flex: 1.2,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  previewPane: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--ant-color-border-secondary)",
    backgroundColor: "var(--ant-color-bg-container)",
  },
  previewFrame: {
    width: "100%",
    height: "100%",
    borderStyle: "none",
    backgroundColor: "#FFFFFF",
  },
  previewEmpty: {
    margin: "auto",
    fontSize: 13,
    color: "var(--ant-color-text-tertiary)",
  },
});

function insertText(ed: SourceEditor, text: string) {
  const sel = ed.getSelection();
  if (!sel) return;
  ed.executeEdits("wordma", [{ range: sel, text, forceMoveMarkers: true }]);
}

export function WordmaEditor({
  initialValue,
  onChange,
  onPasteImage,
  onPickImage,
  previewHtml,
}: WordmaEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<SourceEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<SourceEditor | null>(
    null,
  );
  // 编辑器选项闭包经 ref 取最新引用，避免过期捕获
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const pasteImageRef = useRef(onPasteImage);
  pasteImageRef.current = onPasteImage;

  // 创建 Monaco 实例（仅挂载一次；initialValue 只在此读取）
  useEffect(() => {
    if (!hostRef.current) return;
    const ed = monaco.editor.create(hostRef.current, {
      value: initialValue,
      language: "markdown",
      theme: "vs",
      fontSize: 15,
      lineHeight: 26,
      wordWrap: "on",
      minimap: { enabled: false },
      lineNumbers: "off",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      renderLineHighlight: "none",
      quickSuggestions: false,
      folding: false,
      scrollbar: { verticalScrollbarSize: 10 },
    });
    editorRef.current = ed;
    setEditorInstance(ed);
    const contentSub = ed.onDidChangeModelContent(() =>
      changeRef.current(ed.getValue()),
    );
    return () => {
      contentSub.dispose();
      ed.dispose();
      editorRef.current = null;
      setEditorInstance(null);
    };
    // initialValue 仅作初始值；onChange 经 ref 保持最新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 斜杠命令：输入 "/" 唤出 markdown 语法插入菜单
  useEffect(() => {
    const ed = editorInstance;
    if (!ed) return;
    const provider = monaco.languages.registerCompletionItemProvider(
      "markdown",
      {
        triggerCharacters: ["/"],
        provideCompletionItems(model, position) {
          const before = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          const match = before.match(/\/([^/\s]*)$/);
          if (!match) return { suggestions: [] };
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: position.column - match[0].length,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          const mk = (
            label: string,
            insertText: string,
            detail: string,
          ) => ({
            label,
            detail,
            kind: monaco.languages.CompletionItemKind.Text,
            insertText,
            range,
          });
          return {
            suggestions: [
              mk("标题 1", "# ", "章节大标题"),
              mk("标题 2", "## ", "小节标题"),
              mk("标题 3", "### ", "子标题"),
              mk("无序列表", "- ", "列表项"),
              mk("有序列表", "1. ", "编号列表"),
              mk("引用", "> ", "名言或摘录"),
              mk("代码块", "```\n\n```", "等宽字体"),
              mk("分割线", "---", "分隔内容"),
            ],
          };
        },
      },
    );
    return () => provider.dispose();
  }, [editorInstance]);

  // 粘贴/拖入图片 → 上传到媒体库后插入 markdown 引用
  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0 || !pasteImageRef.current) return;
    e.preventDefault();
    const ed = editorRef.current;
    for (const file of files) {
      pasteImageRef.current(file).then((url) => {
        if (url && ed) insertText(ed, `![](${url})`);
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    e.preventDefault();
    const ed = editorRef.current;
    for (const file of files) {
      pasteImageRef.current?.(file).then((url) => {
        if (url && ed) insertText(ed, `![](${url})`);
      });
    }
  };

  return (
    <div {...stylex.props(styles.root)}>
      <Toolbar editor={editorInstance} onPickImage={onPickImage} />
      <div {...stylex.props(styles.split)}>
        <div
          ref={hostRef}
          {...stylex.props(styles.host)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        />
        <div {...stylex.props(styles.previewPane)}>
          {previewHtml ? (
            <iframe
              title="预览"
              sandbox=""
              srcDoc={previewHtml}
              {...stylex.props(styles.previewFrame)}
            />
          ) : (
            <div {...stylex.props(styles.previewEmpty)}>预览生成中…</div>
          )}
        </div>
      </div>
    </div>
  );
}
