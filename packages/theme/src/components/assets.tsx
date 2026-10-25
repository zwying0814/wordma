import {
  createContext,
  useContext,
} from 'react';
import type { ReactNode } from 'react';

export type PageAssets = {
  /** 页面所需样式 URL（已含 basePath） */
  styles: string[];
  /** 裸模块名到运行时 URL 的映射 */
  importMap?: Record<string, string>;
  /** body 末尾的 module 脚本 */
  bodyScripts: string[];
};

const EMPTY_ASSETS: PageAssets = {
  styles: [],
  bodyScripts: [],
};

const PageAssetsContext =
  createContext<PageAssets>(EMPTY_ASSETS);

export type PageAssetsProviderProps = {
  assets: PageAssets;
  children?: ReactNode;
};

export function PageAssetsProvider({
  assets,
  children,
}: PageAssetsProviderProps) {
  return (
    <PageAssetsContext.Provider value={assets}>
      {children}
    </PageAssetsContext.Provider>
  );
}

function importMapJson(
  importMap: Record<string, string> | undefined,
): string | undefined {
  if (!importMap || Object.keys(importMap).length === 0) {
    return undefined;
  }

  return JSON.stringify({
    imports: importMap,
  }).replace(/</g, '\\u003c');
}

/**
 * 注入全局样式与 importmap。
 */
export function WordmaHead() {
  const assets = useContext(PageAssetsContext);
  const importMap = importMapJson(assets.importMap);

  return (
    <>
      {assets.styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {importMap && (
        <script
          type="importmap"
          dangerouslySetInnerHTML={{ __html: importMap }}
        />
      )}
    </>
  );
}

/**
 * 注入 body 末尾的岛屿挂载脚本。
 */
export function WordmaBodyEnd() {
  const assets = useContext(PageAssetsContext);

  return (
    <>
      {assets.bodyScripts.map((src) => (
        <script key={src} type="module" src={src} />
      ))}
    </>
  );
}
