import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchDesktop());
});

test.afterEach(async () => {
  await app.close();
});

test('箭头替换：-> 变 →', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('a -> b');

  await expect(page.getByText('a → b')).toBeVisible();
});

test('分数替换：1/2 变 ½', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('half 1/2');

  await expect(page.getByText('half ½')).toBeVisible();
});

test('高亮输入规则：==文字== 变高亮标记', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('==marked== ');

  // == 被高亮规则消费后不残留字面量，且 !== 智能等号替换
  const text = await page.evaluate(
    () => document.querySelector('[data-slate-editor]')?.textContent ?? ''
  );
  expect(text).toContain('marked');
  expect(text).not.toContain('==marked');
});

test('mod+enter 在块下方插入空段（exit break）', async () => {
  await page.getByText('这是一段引用。').click();
  // 先输入一个字符确认 Slate 选区已同步，避免快捷键作用于未同步选区
  await page.keyboard.type('X');
  await page.keyboard.press('ControlOrMeta+Enter');

  // 注意：Slate 段落渲染为 div.slate-p，不是 <p> 标签
  await page.keyboard.type('after exit break');

  await expect(
    page
      .locator('[data-slate-editor] [data-slate-node="element"]')
      .filter({ hasText: 'after exit break' })
  ).toBeVisible();

  const insideQuote = await page.evaluate(() => {
    const bq = document.querySelector('[data-slate-editor] blockquote');
    return bq?.textContent?.includes('after exit break') ?? false;
  });
  expect(insideQuote).toBeFalsy();
});

test('markdown 文档粘贴解析（标题/列表/代码围栏）', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  const md = [
    '# Pasted Title',
    '',
    '- paste item',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n');

  await page.evaluate((markdown) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', markdown);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    document
      .querySelector('[data-slate-editor]')
      ?.dispatchEvent(event as unknown as Event);
  }, md);

  await expect(page.getByText('Pasted Title')).toBeVisible();
  await expect(
    page.locator('[data-slate-editor] [role="listitem"]').filter({ hasText: 'paste item' })
  ).toBeVisible();
  await expect(
    page.locator('[data-slate-editor] pre').filter({ hasText: 'const x = 1;' })
  ).toBeVisible();
});
