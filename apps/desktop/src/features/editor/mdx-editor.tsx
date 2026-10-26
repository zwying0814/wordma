import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useTheme } from 'next-themes';

type MdxEditorProps = {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave?: () => void;
};

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '16px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

const jsLanguage = javascript({
  jsx: true,
  typescript: true,
}).language;

function codeLanguage(info: string) {
  if (
    ['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(
      info.toLowerCase(),
    )
  ) {
    return jsLanguage;
  }

  return null;
}

function readOnlyExtensions(readOnly: boolean) {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
}

export function MdxEditor({
  value,
  readOnly = false,
  onChange,
  onSave,
}: MdxEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const initialValueRef = useRef(value);
  const initialReadOnlyRef = useRef(readOnly);
  const themeCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          markdown({ codeLanguages: codeLanguage }),
          editorTheme,
          themeCompartment.of(dark ? [oneDark] : []),
          readOnlyCompartment.of(
            readOnlyExtensions(initialReadOnlyRef.current),
          ),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(
                update.state.doc.toString(),
              );
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnlyCompartment, themeCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(
        dark ? [oneDark] : [],
      ),
    });
  }, [dark, themeCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(
        readOnlyExtensions(readOnly),
      ),
    });
  }, [readOnly, readOnlyCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full"
    />
  );
}
