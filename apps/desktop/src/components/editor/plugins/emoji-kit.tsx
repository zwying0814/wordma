'use client';

import emojiMartData from '@emoji-mart/data';
import { EmojiPlugin } from '@platejs/emoji/react';

export const EmojiKit = [
  EmojiPlugin.configure({
    options: { data: emojiMartData as any },
  }),
];
