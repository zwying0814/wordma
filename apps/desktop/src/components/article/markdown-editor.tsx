import { useEffect, useRef } from "react"
import * as monaco from "monaco-editor"
// ⚠️ 子路径不带 esm/vs 前缀：monaco-editor 的 exports 映射是 `./*` → `./esm/vs/*.js`，
// 写全 `monaco-editor/esm/vs/...` 反而解析失败（会被拼成两层 esm/vs）
import EditorWorker from "monaco-editor/editor/editor.worker?worker"

/**
 * 编辑器基础 worker（词法补全、撤销合并等）。Markdown 没有独立的语言 worker，
 * 一个 editor worker 就够了；没有它 Monaco 会在控制台持续报 worker 创建失败。
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

/**
 * 极简 Markdown 编辑器：Monaco 的薄包装。
 *
 * 刻意不用 `@monaco-editor/react`：那个包装走 CDN loader（默认从 jsdelivr 拉编辑器），
 * 桌面端离线就挂；这里直接 import 本地包，Vite 把它打进产物，离线可用。
 *
 * 生命周期约定：
 *  - 编辑器实例**只创建一次**（空挂载 effect），`value` 变化通过 `setValue` 外部同步，
 *    且仅在与当前模型内容不同才写——避免每次父组件重渲染都重置光标位置。
 *  - `onChange` / `onSave` 经由 ref 转发进闭包，回调 identity 变化不会重建编辑器。
 */
export function MarkdownEditor({
  value,
  onChange,
  onSave,
}: {
  value: string
  onChange: (value: string) => void
  /** Ctrl/Cmd+S 触发；组件负责注册快捷键，调用方无需自己监听键盘 */
  onSave: () => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const editor = monaco.editor.create(host, {
      value,
      language: "markdown",
      // 极简：对齐写作页观感——不要行号/小地图/折叠/高亮行/缩进参考线，
      // 只留正文、光标与一纵细滚动条
      theme: "vs",
      fontSize: 15,
      lineHeight: 26,
      fontFamily:
        'ui-monospace, "Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace',
      fontLigatures: false,
      wordWrap: "on",
      lineNumbers: "off",
      folding: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      padding: { top: 12, bottom: 64 },
      guides: {
        indentation: false,
        highlightActiveIndentation: false,
        bracketPairs: false,
      },
      occurrencesHighlight: "off",
      selectionHighlight: false,
      matchBrackets: "never",
      stickyScroll: { enabled: false },
      cursorBlinking: "smooth",
      smoothScrolling: true,
      // 容器尺寸随窗口变化时自动重排（否则窗口缩放后视口量错）
      automaticLayout: true,
    })
    editorRef.current = editor

    const contentDisposable = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue())
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current()
    })

    return () => {
      contentDisposable.dispose()
      editor.dispose()
      editorRef.current = null
    }
    // value 只作初始值；后续同步走下面的 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化（载入完成/保存后回填）时同步进模型；内容一致则跳过，
  // 避免 setValue 重置光标与撤销栈
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) {
      model.setValue(value)
    }
  }, [value])

  return <div ref={hostRef} className="h-full w-full" aria-label="文章正文编辑器" />
}
