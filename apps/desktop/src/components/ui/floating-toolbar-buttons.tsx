'use client';

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { MarkToolbarButton } from './mark-toolbar-button';
import { InlineEquationToolbarButton } from './equation-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { ToolbarGroup } from './toolbar';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <>
      {!readOnly && (
        <ToolbarGroup>
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

          <LinkToolbarButton />
          <InlineEquationToolbarButton />
        </ToolbarGroup>
      )}
    </>
  );
}
