/**
 * @wordma/slug 手写类型声明（对应 index.js）。
 * 底层 wasm 的精确签名见 `pkg/wordma_slug.d.ts`。
 */

/**
 * 显式预热 wasm（可选）。一般无需手动调用——首个 `slugify` 会自动触发加载。
 */
export declare function initSlug(): Promise<void>

/**
 * 由标题生成 slug（异步）。
 * @param input 任意标题（可含中文 / 英文 / 符号）
 * @returns ASCII、小写、以 `-` 分隔的文件名安全 slug
 */
export declare function slugify(input: string): Promise<string>

/** wasm 产物版本号（异步）。 */
export declare function slugVersion(): Promise<string>
