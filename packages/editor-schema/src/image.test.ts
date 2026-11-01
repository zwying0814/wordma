import { describe, expect, test } from "bun:test";
import { renderToHTML } from "./render";

const doc = (content: unknown[]) => ({ type: "doc", content }) as never;

describe("image node", () => {
  test("静态渲染保留宽度、对齐与 alt", () => {
    const html = renderToHTML(
      doc([
        {
          type: "image",
          attrs: {
            src: "/media/a.png",
            alt: "示例图",
            align: "right",
            width: "50%",
          },
        },
      ]),
    );
    expect(html).toContain('src="/media/a.png"');
    expect(html).toContain('alt="示例图"');
    expect(html).toContain('data-align="right"');
    expect(html).toContain("width: 50%");
  });

  test("旧版数字宽度按 px 输出", () => {
    const html = renderToHTML(
      doc([
        {
          type: "image",
          attrs: { src: "/media/b.png", align: "center", width: 320 },
        },
      ]),
    );
    expect(html).toContain("width: 320px");
    expect(html).toContain('data-align="center"');
  });
});
