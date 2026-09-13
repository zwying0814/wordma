import { invoke, isTauri } from "@tauri-apps/api/core"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"

import type {
  CreateSpaceData,
  CreateSpaceInput,
  SpaceError,
  SpaceErrorCode,
  SpaceResult,
  SpaceSnapshot,
} from "@/types/space"

/**
 * Tauri 侧空间能力的唯一出口。
 *
 * 设计要点：
 *  - 业务命令一律走 `invoke` 调 Rust（`src-tauri/src/space/commands.rs`），
 *    命令名 `space_*`；参数由 Tauri 自动做驼峰转换（`spaceId` → `space_id`）。
 *  - 通用原生能力（选目录、在文件管理器中显示）直接用官方插件，
 *    不再绕一层 Rust 命令——它们本来就是插件职责。
 *  - **命令绝不 reject**：Rust 的 `Err(SpaceError)` 被还原成 `{ ok:false, error }`，
 *    与 Electron 时代保持同一套信封语义，store 层无需感知底层换了。
 *
 * ## 换代之后选择器只剩一个
 *
 * 空间不再是文件，「新建」「打开」都不需要用户挑位置了：
 *  - 新建：只填名字和图标，没有对话框；
 *  - 打开：就是切换当前空间，也没有对话框；
 *  - **只有备份还需要系统对话框**（选落点）。
 *    历史版本数据导入（`importLegacy` / `scan` / 两个 pickLegacy*）已随旧版
 *    数据格式一并移除。
 */

const NOT_AVAILABLE: SpaceError = {
  code: "STORE_UNAVAILABLE",
  message: "桌面端能力不可用（当前为浏览器预览模式）",
}

/** 备份文件的过滤器。 */
const DB_FILTERS = [{ name: "wordma 笔记库", extensions: ["db"] }]

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

/** 弹一个原生选择框；用户取消返回 null（不是错误），出错返回 { ok:false, error }。 */
async function pick(
  run: () => Promise<string | string[] | null>,
): Promise<SpaceResult<{ path: string | null }>> {
  if (!isTauri()) return { ok: false, error: NOT_AVAILABLE }
  try {
    const selected = await run()
    // multiple:false 时返回值是 string | null
    const path = typeof selected === "string" ? selected : null
    return { ok: true, data: { path } }
  } catch (e) {
    return { ok: false, error: toSpaceError(e) }
  }
}

export const spaceApi = {
  list: (): Promise<SpaceResult<SpaceSnapshot>> => call<SpaceSnapshot>("space_list"),

  /** 新建空间：只给名字和图标，位置由应用自己决定 */
  create: (input: CreateSpaceInput): Promise<SpaceResult<CreateSpaceData>> =>
    call<CreateSpaceData>("space_create", {
      name: input.name,
      icon: input.icon,
    }),

  /** 切换当前空间（等于旧版的「打开」——空间是行，不是文件） */
  setActive: (id: string): Promise<SpaceResult<SpaceSnapshot>> =>
    call<SpaceSnapshot>("space_set_active", { id }),

  /** 某个空间有多少篇文章（删除前的确认框用） */
  articleCount: (id: string): Promise<SpaceResult<number>> =>
    call<number>("space_article_count", { id }),

  /**
   * 删除空间——**连同它名下的全部笔记**。
   * 与旧版「只从列表移除」语义完全不同，调用前必须让用户确认。
   */
  remove: (id: string): Promise<SpaceResult<SpaceSnapshot>> =>
    call<SpaceSnapshot>("space_remove", { id }),

  /**
   * 备份整个笔记库（`VACUUM INTO`，产出一份完整副本）。
   * 所有空间、所有笔记都在一个二进制文件里，损坏即全丢，这条退路必须有。
   */
  backup: (dest: string): Promise<SpaceResult<void>> =>
    call<null>("space_backup", { dest }).then((res) =>
      res.ok ? { ok: true, data: undefined } : res,
    ),

  /** 备份文件的保存位置 */
  pickBackupPath: (defaultName: string) =>
    pick(() =>
      saveDialog({
        title: "选择备份文件的保存位置",
        defaultPath: defaultName,
        filters: DB_FILTERS,
      }),
    ),

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
