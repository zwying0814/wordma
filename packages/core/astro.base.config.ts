import { defineConfig } from 'astro/config';
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeMathjax from 'rehype-mathjax';
import rehypeExternalLinks from "rehype-external-links";
import codeHighlightIntegration from "./codeHighlight.ts";

const baseConfig = {
    output: 'static',
    outDir: '../../.deploy/.temp',
    markdown: {
        remarkPlugins: [remarkMath],
        rehypePlugins: [rehypeMathjax, [
            rehypeExternalLinks,
            {
                target: '_blank',
                rel: ['noopener', 'noreferrer']
            },
        ]],
        syntaxHighlight: {
            excludeLangs: ['echarts'],
        }
    },
    integrations: [
        codeHighlightIntegration(),
        mdx(),
        sitemap(),
    ],
} as const satisfies Parameters<typeof defineConfig>[0];

export default baseConfig;