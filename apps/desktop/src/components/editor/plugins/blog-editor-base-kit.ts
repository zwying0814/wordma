import { BaseAlignKit } from './align-base-kit';
import { BaseBasicBlocksKit } from './basic-blocks-base-kit';
import { BaseBasicMarksKit } from './basic-marks-base-kit';
import { BaseCodeBlockKit } from './code-block-base-kit';
import { BaseLinkKit } from './link-base-kit';
import { BaseListKit } from './list-base-kit';
import { BaseMediaKit } from './media-base-kit';
import { BaseTableKit } from './table-base-kit';
import { BaseFontKit } from './font-base-kit';

/**
 * 静态序列化专用的 base 插件套件：
 * 组件全部为 *-static.tsx（platejs/static 的 SlateElement/SlateLeaf，零上下文 hook），
 * 供 createStaticEditor + serializeHtml 使用（保存 / 主题渲染 / 导出）。
 */
export const BlogEditorBaseKit = [
  // Elements
  ...BaseBasicBlocksKit,
  ...BaseCodeBlockKit,
  ...BaseTableKit,
  ...BaseMediaKit,
  ...BaseLinkKit,
  // Marks
  ...BaseBasicMarksKit,
  ...BaseFontKit,
  // Block style
  ...BaseListKit,
  ...BaseAlignKit,
];
