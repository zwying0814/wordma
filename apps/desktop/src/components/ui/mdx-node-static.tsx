import type { SlateElementProps } from 'platejs/static';
import { SlateElement } from 'platejs/static';

import type { TMdxElement } from '@/components/ui/mdx-node';

/**
 * MDX 块的静态形态：只输出岛占位 div，真正的渲染交给页面里的挂载脚本。
 * 组件缺失时留一句纯文本说明 —— 关掉 JS 也能看出这里原本有什么。
 */
export function MdxElementStatic(props: SlateElementProps<TMdxElement>) {
  const component = props.element.component ?? '';
  const propsText = props.element.props ?? '';

  return (
    <SlateElement {...props} className="py-2">
      <div
        className="wordma-island"
        data-props={propsText || '{}'}
        data-wordma-island={component}
      >
        {component ? null : '（未选择 MDX 组件）'}
      </div>
    </SlateElement>
  );
}
