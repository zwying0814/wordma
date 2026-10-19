'use client';

import { createPlatePlugin } from 'platejs/react';

import { MdxElement } from '@/components/ui/mdx-node';

/** MDX 块的节点类型（plate 的 KEYS 里没有，自己定义） */
export const MDX_KEY = 'mdx';

/** MDX 岛块：引用站点 components/ 下的 tsx 组件，编辑器内实时渲染 */
export const MdxPlugin = createPlatePlugin({
  key: MDX_KEY,
  node: {
    component: MdxElement,
    isElement: true,
    isVoid: true,
  },
});

export const MdxKit = [MdxPlugin];
