import { invoke, isTauri } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"

import type {
  CreateSpaceData,
  CreateSpaceInput,
  OpenSpaceData,
  ScannedSpace,
  SpaceErrorCode,
  SpaceError,
  SpaceResult,
  SpaceSnapshot,
} from "@/types/space"

/**
 * Tauri 侧空间能力的唯一出口——替代已随 Electron 移除的 `lib/electron-bridge`。
 *
 * 设计要点：
 *  - 业务命令一律走 `invoke` 调 Rust（`src-tauri/src/space/commands.rs`），
 *    命令名 `space_*`；参数由 Tauri 自动做驼峰转换（`spaceDir` → `space_dir`）。
 *  - 通用原生能力（选目录、在文件管理器中显示）直接用官方插件，
 *    不再绕一层 Rust 命令——它们本来就是插件职责。
 *  - **命令绝不 reject**：Rust 的 `Err(SpaceError)` 被还原成 `{ ok:false, error }`，
 *    与 Electron 时代保持同一套信封语义，store 层无需感知底层换了。
 */

const NOT_AVAILABLE: SpaceError = {
  code: "STORE_UNAVAILABLE",
  message: "桌面端能力不可用（当前为浏览器预览模式）",
}

/** 把 invoke 抛出的未知异常还原成 SpaceError。Rust 侧 Err 序列化后就是 { code, message }。 */
function toSpaceError(e: unknown): SpaceError {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code?: unknown; message?: unknown }
    if (typeof code === "string" && typeof message === "string") {
      return { code: code as SpaceErrorCode, message }
    }
  }
  if (typeof e === "string") return { code: "UNKNOWN", message: e }
  return { code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) }
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<SpaceResult<T>> {
  // 浏览器预览模式（vite dev 直开）：没有 Rust 后端，直接降级而不是抛异常
  if (!isTauri()) return { ok: false, error: NOT_AVAILABLE }
  try {
    const data = await invoke<T>(command, args)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: toSpaceError(e) }
  }
}

export const spaceApi = {
  /** 探测桌面端能力是否就绪（供 bootstrap 判定 unavailable 用） */
  ping: (): Promise<SpaceResult<boolean>> => call<boolean>("space_ping"),

  list: (): Promise<SpaceResult<SpaceSnapshot>> => call<SpaceSnapshot>("space_list"),

  create: (input: CreateSpaceInput): Promise<SpaceResult<CreateSpaceData>> =>
    call<CreateSpaceData>("space_create", {
      name: input.name,
      icon: input.icon,
    }),

  open: (spaceDir: string): Promise<SpaceResult<OpenSpaceData>> =>
    call<OpenSpaceData>("space_open", { spaceDir }),

  /** 扫描默认数据目录下的已有空间（含标记文件的子目录） */
  scan: (): Promise<SpaceResult<ScannedSpace[]>> => call<ScannedSpace[]>("space_scan"),

  setActive: (id: string): Promise<SpaceResult<SpaceSnapshot>> =>
    call<SpaceSnapshot>("space_set_active", { id }),

  remove: (id: string): Promise<SpaceResult<SpaceSnapshot>> =>
    call<SpaceSnapshot>("space_remove", { id }),

  /**
   * 弹出系统目录选择框。
   * 用户取消 → `dir: null`（不是错误）；出错 → `{ ok:false, error }`。
   */
  async pickSpaceDir(): Promise<SpaceResult<{ dir: string | null }>> {
    if (!isTauri()) return { ok: false, error: NOT_AVAILABLE }
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择笔记空间文件夹",
      })
      // multiple:false 时返回值是 string | null
      const dir = typeof selected === "string" ? selected : null
      return { ok: true, data: { dir } }
    } catch (e) {
      return { ok: false, error: toSpaceError(e) }
    }
  },

  /** 在系统文件管理器中定位并选中该路径 */
  async reveal(path: string): Promise<SpaceResult<void>> {
    if (!isTauri()) return { ok: false, error: NOT_AVAILABLE }
    try {
      await revealItemInDir(path)
      return { ok: true, data: undefined }
    } catch (e) {
      return { ok: false, error: toSpaceError(e) }
    }
  },
}
