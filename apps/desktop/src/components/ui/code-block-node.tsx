'use client';

import { formatCodeBlock, isLangSupported } from '@platejs/code-block';
import { BracesIcon, CheckIcon, CopyIcon } from 'lucide-react';
import { NodeApi, type TCodeBlockElement, type TCodeSyntaxLeaf } from 'platejs';
import {
  PlateElement,
  type PlateElementProps,
  PlateLeaf,
  type PlateLeafProps,
  useEditorRef,
  useElement,
  useReadOnly,
} from 'platejs/react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type CodeBlockElementProps = PlateElementProps<TCodeBlockElement> & {
  showLanguageLabel?: boolean;
};

const codeBlockLanguages: { label: string; value: string }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Plain Text', value: 'plaintext' },
  { label: 'Bash', value: 'bash' },
  { label: 'C', value: 'c' },
  { label: 'C#', value: 'csharp' },
  { label: 'C++', value: 'cpp' },
  { label: 'CSS', value: 'css' },
  { label: 'Dart', value: 'dart' },
  { label: 'Docker', value: 'dockerfile' },
  { label: 'Go', value: 'go' },
  { label: 'GraphQL', value: 'graphql' },
  { label: 'HTML', value: 'html' },
  { label: 'Java', value: 'java' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'JSON', value: 'json' },
  { label: 'Kotlin', value: 'kotlin' },
  { label: 'Less', value: 'less' },
  { label: 'Lua', value: 'lua' },
  { label: 'Makefile', value: 'makefile' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Objective-C', value: 'objectivec' },
  { label: 'PHP', value: 'php' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'Python', value: 'python' },
  { label: 'R', value: 'r' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'Rust', value: 'rust' },
  { label: 'Sass', value: 'scss' },
  { label: 'Scala', value: 'scala' },
  { label: 'Shell', value: 'shell' },
  { label: 'SQL', value: 'sql' },
  { label: 'Swift', value: 'swift' },
  { label: 'TOML', value: 'toml' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'XML', value: 'xml' },
  { label: 'YAML', value: 'yaml' },
];

function getCodeBlockLanguageLabel(lang?: string | null) {
  const value = lang?.trim();

  if (!value) return null;

  return (
    codeBlockLanguages.find((language) => language.value === value)?.label ??
    value
  );
}

export function CodeBlockElement({
  showLanguageLabel = true,
  ...props
}: CodeBlockElementProps) {
  const { editor, element } = props;

  return (
    <PlateElement
      className="py-1 **:[.hljs-addition]:bg-success/12 **:[.hljs-addition]:text-success **:[.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable]:text-syntax-number **:[.hljs-built\_in,.hljs-symbol]:text-syntax-function **:[.hljs-bullet]:text-syntax-punctuation **:[.hljs-comment,.hljs-code,.hljs-formula]:text-syntax-comment **:[.hljs-deletion]:bg-destructive/12 **:[.hljs-deletion]:text-destructive **:[.hljs-emphasis]:italic **:[.hljs-keyword,.hljs-doctag,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language\_]:text-syntax-keyword **:[.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo]:text-syntax-string **:[.hljs-regexp,.hljs-string,.hljs-meta_.hljs-string]:text-syntax-string **:[.hljs-section]:font-bold **:[.hljs-section]:text-syntax-function **:[.hljs-strong]:font-bold **:[.hljs-title,.hljs-title.class\_,.hljs-title.class\_.inherited\_\_,.hljs-title.function\_]:text-syntax-function"
      {...props}
    >
      <div className="relative rounded-md bg-muted/50">
        <pre className="overflow-x-auto p-8 pr-4 font-mono text-sm leading-[normal] [tab-size:2] print:break-inside-avoid">
          <code>{props.children}</code>
        </pre>

        <div
          className="absolute top-1 right-1 z-10 flex select-none gap-0.5"
          contentEditable={false}
        >
          {isLangSupported(element.lang) && (
            <Button
              className="size-6 text-xs"
              onClick={() => formatCodeBlock(editor, { element })}
              size="icon"
              title="Format code"
              variant="ghost"
            >
              <BracesIcon className="!size-3.5 text-muted-foreground" />
            </Button>
          )}

          <CodeBlockCombobox showLanguageLabel={showLanguageLabel} />

          <CopyButton
            className="size-6 gap-1 text-muted-foreground text-xs"
            size="icon"
            value={() => NodeApi.string(element)}
            variant="ghost"
          />
        </div>
      </div>
    </PlateElement>
  );
}

function CodeBlockCombobox({
  showLanguageLabel,
}: {
  showLanguageLabel: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const readOnly = useReadOnly();
  const editor = useEditorRef();
  const element = useElement<TCodeBlockElement>();
  const value = element.lang || 'plaintext';

  const items = React.useMemo(
    () =>
      codeBlockLanguages.filter(
        (language) =>
          !searchValue ||
          language.label.toLowerCase().includes(searchValue.toLowerCase())
      ),
    [searchValue]
  );

  if (readOnly) {
    if (!showLanguageLabel) return null;

    return <CodeBlockLanguageLabel lang={element.lang} />;
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchValue('');
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            className="h-6 select-none justify-between gap-1 px-2 text-muted-foreground text-xs"
            size="sm"
            variant="ghost"
          >
            {getCodeBlockLanguageLabel(value) ?? 'Plain Text'}
          </Button>
        }
      />
      <PopoverContent className="w-[200px] rounded-md border bg-popover p-0 shadow-md">
        <div className="flex flex-col">
          <input
            autoFocus
            className="h-9 border-b border-b-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search language..."
            value={searchValue}
          />

          <div className="h-[280px] overflow-y-auto p-1">
            {items.map((language) => (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                key={language.label}
                onClick={() => {
                  // 显式解析路径：at 直接传 Node 对象在部分时序下会丢内容
                  const path = editor.api.findPath(element);
                  if (!path) return;
                  editor.tf.setNodes<TCodeBlockElement>(
                    { lang: language.value },
                    { at: path }
                  );
                  setOpen(false);
                }}
                type="button"
              >
                <CheckIcon
                  className={cn(
                    'size-3.5',
                    value === language.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {language.label}
              </button>
            ))}
            {items.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-sm">
                No language found.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CodeBlockLanguageLabel({ lang }: { lang?: string | null }) {
  const label = getCodeBlockLanguageLabel(lang);

  if (!label) return null;

  return (
    <span className="flex h-6 select-none items-center px-2 text-muted-foreground text-xs">
      {label}
    </span>
  );
}

function CopyButton({
  value,
  ...props
}: { value: (() => string) | string } & Omit<
  React.ComponentProps<typeof Button>,
  'value'
>) {
  const [hasCopied, setHasCopied] = React.useState(false);

  React.useEffect(() => {
    setTimeout(() => {
      setHasCopied(false);
    }, 2000);
  }, [hasCopied]);

  return (
    <Button
      aria-label="Copy code"
      onClick={() => {
        void navigator.clipboard.writeText(
          typeof value === 'function' ? value() : value
        );
        setHasCopied(true);
      }}
      {...props}
    >
      <span className="sr-only">Copy</span>
      {hasCopied ? (
        <CheckIcon className="!size-3" />
      ) : (
        <CopyIcon className="!size-3" />
      )}
    </Button>
  );
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} />;
}

export function CodeSyntaxLeaf(props: PlateLeafProps<TCodeSyntaxLeaf>) {
  const tokenClassName = props.leaf.className as string;

  return <PlateLeaf className={tokenClassName} {...props} />;
}
