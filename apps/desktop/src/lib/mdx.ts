import { invoke } from "@tauri-apps/api/core";

export interface MdxCompileError {
  message: string;
  line?: number | null;
  column?: number | null;
  frame?: string | null;
}

export interface MdxCompileResult {
  ok: boolean;
  hash?: string | null;
  code?: string | null;
  css?: string | null;
  /** 12739 上的单块预览页 */
  url?: string | null;
  error?: MdxCompileError | null;
}

/** 编译单个 MDX 块；环境错误会 reject，语法/打包错误在 result.error 里 */
export function compileMdx(
  siteId: number,
  blockId: string,
  source: string,
): Promise<MdxCompileResult> {
  return invoke("compile_mdx_cmd", { siteId, blockId, source });
}

export interface MdxDependency {
  name: string;
  spec: string;
  version?: string | null;
}

export interface MdxDepsReport {
  workspace: string;
  dependencies: MdxDependency[];
  installed: boolean;
  output: string;
}

export const listMdxDeps = (siteId: number): Promise<MdxDepsReport> =>
  invoke("list_mdx_deps_cmd", { siteId });

export const installMdxDeps = (siteId: number): Promise<MdxDepsReport> =>
  invoke("install_mdx_deps_cmd", { siteId });

export const addMdxDependency = (
  siteId: number,
  name: string,
  version?: string,
): Promise<MdxDepsReport> =>
  invoke("add_mdx_dependency_cmd", {
    siteId,
    name,
    version: version?.trim() || null,
  });

export const removeMdxDependency = (
  siteId: number,
  name: string,
): Promise<MdxDepsReport> =>
  invoke("remove_mdx_dependency_cmd", { siteId, name });
