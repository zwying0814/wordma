'use client';

import { TrailingBlockPlugin } from 'platejs';

import { AlignKit } from './align-kit';
import { BasicBlocksKit } from './basic-blocks-kit';
import { BasicMarksKit } from './basic-marks-kit';
import { CodeBlockKit } from './code-block-kit';
import { EmojiKit } from './emoji-kit';
import { ExitBreakKit } from './exit-break-kit';
import { FontKit } from './font-kit';
import { LinkKit } from './link-kit';
import { ListKit } from './list-kit';
import { MarkdownKit } from './markdown-kit';
import { MediaKit } from './media-kit';
import { TableKit } from './table-kit';
import { AutoformatKit } from './autoformat-kit';

export const BlogEditorKit = [
  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...MediaKit,
  ...LinkKit,
  // Marks
  ...BasicMarksKit,
  ...FontKit,
  // Block style
  ...ListKit,
  ...AlignKit,
  // Editing
  ...AutoformatKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,
  // Parsers
  ...MarkdownKit,
];
