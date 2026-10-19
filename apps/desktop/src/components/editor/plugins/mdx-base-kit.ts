import { createSlatePlugin } from 'platejs';

import { MdxElementStatic } from '@/components/ui/mdx-node-static';
import { MDX_KEY } from './mdx-kit';

/**
 * MDX 块的静态形态：base 套件漏了它，保存出来的 HTML 就只剩空段落
 * （与公式/分栏同一个坑，两个套件都要注册）。
 */
export const BaseMdxPlugin = createSlatePlugin({
  key: MDX_KEY,
  node: { isElement: true, isVoid: true },
}).withComponent(MdxElementStatic);

export const BaseMdxKit = [BaseMdxPlugin];
