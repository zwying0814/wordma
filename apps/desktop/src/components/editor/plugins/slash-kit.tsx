'use client';

import { SlashInputPlugin, SlashPlugin } from '@platejs/slash-command/react';
import { KEYS, type SlateEditor } from 'platejs';

import { SlashInputElement } from '@/components/ui/slash-node';

export const SlashKit = [
  SlashPlugin.configure({
    options: {
      // 代码块内不唤出命令面板（其余触发边界由插件默认的
      // triggerPreviousCharPattern=/^\s?$/ 保证：只在块首或空格后触发）
      triggerQuery: (editor: SlateEditor) =>
        !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } }),
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];
