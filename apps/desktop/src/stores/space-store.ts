import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import { spaceApi } from "@/lib/tauri/space-api"
import type {
  CreateSpaceInput,
  SpaceError,
  Space,
} from "@/types/space"

/**
 * ⚠️ zustand v5 约定（v4 的默认浅比较已移除，selector 返回新对象会无限重渲染）：
 *  - action 内一律用 get() 读 state，绝不捕获外层变量
 *  - 组件里绝不用 `const { x, y } = useSpaceStore()`（订阅整个 store）；
 *    逐字段 selector + 多字段一律 useShallow
 *  - 只存 activeSpaceId，activeSpace 由 selector 派生，杜绝副本不同步
 *
 * 底层已从 Electron IPC 换成 Tauri invoke（见 @/lib/tauri/space-api），
 * 但返回信封语义不变：命令不 reject，错误一律走 `{ ok:false, error }`。
 *
 * 存储换代之后本 store 少了两件事：**没有「打开空间」这个动作了**
 * （空间是库里的一行，切换即打开），也**没有「新建时要选位置」**了
 * （只有一个库，位置由应用决定）。`dbPath` 由后端随快照带回来。
 * 历史版本数据的导入与扫描动作已随旧版数据格式一并移除。
 */
export type SpaceStatus = "idle" | "loading" | "ready" | "unavailable" | "error"

export type SpaceMutationResult =
  | { ok: true; notice?: string }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; error: SpaceError }

/** 后端随每次快照一起返回的列表结构 */
type Snapshot = { spaces: Space[]; activeSpaceId: string | null; dbPath: string }

type SpaceState = {
  status: SpaceStatus
  spaces: Space[]
  activeSpaceId: string | null
  /** 笔记库文件的绝对路径（整个应用只有这一个文件） */
  dbPath: string | null
  error: SpaceError | null
  pending: boolean

  bootstrap: () => Promise<void>
  refresh: () => Promise<void>
  /** 弹「保存」对话框拿备份落点；取消返回 null */
  pickBackupPath: (defaultName: string) => Promise<string | null>
  createSpace: (input: CreateSpaceInput) => Promise<SpaceMutationResult>
  setActive: (id: string) => Promise<SpaceMutationResult>
  /** 某个空间下有多少篇笔记（删除确认框显示代价用；取不到返回 null） */
  countArticles: (id: string) => Promise<number | null>
  /** 删除空间——会连同它名下的全部笔记一起删掉，调用前必须让用户确认 */
  removeSpace: (id: string) => Promise<SpaceMutationResult>
  /** 备份整个笔记库（所有空间都在一个文件里） */
  backupSpace: () => Promise<SpaceMutationResult>
  /** 在文件管理器中定位笔记库文件 */
  reveal: () => Promise<void>
  clearError: () => void
}

const BUSY: SpaceError = { code: "UNKNOWN", message: "操作进行中，请稍候" }

/**
 * 给备份文件起个默认名：`wordma-备份-YYYYMMDD.db`。
 * 用日期而不是序号——用户反复备份时同一文件名会被覆盖，正好符合「今天的备份」这层语义，
 * 也不会在磁盘上堆出一串 `-1 -2 -3`。
 */
function suggestBackupName(dbPath: string): string {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("")
  const base = dbPath.split(/[\\/]/).pop() ?? ""
  const stem = base.replace(/\.db$/i, "") || "wordma"
  return `${stem}-备份-${stamp}.db`
}

function decode(
  res: { ok: true; data: Snapshot } | { ok: false; error: SpaceError },
): { snapshot: Snapshot | null; error: SpaceError | null } {
  if (res.ok) {
    return { snapshot: res.data, error: null }
  }
  return { snapshot: null, error: res.error }
}

/** 把快照写回 state；create/import 的返回体把 snapshot 摊平在字段上，可直接复用 */
function applySnapshot(
  set: (partial: Partial<SpaceState>) => void,
  snapshot: Snapshot,
) {
  set({
    status: "ready",
    spaces: snapshot.spaces,
    activeSpaceId: snapshot.activeSpaceId,
    dbPath: snapshot.dbPath,
    error: null,
  })
}

export const useSpaceStore = create<SpaceState>((set, get) => ({
  status: "idle",
  spaces: [],
  activeSpaceId: null,
  dbPath: null,
  error: null,
  pending: false,

  bootstrap: async () => {
    // 幂等保护：React 19 StrictMode 下 effect 会跑两次
    if (get().status !== "idle") return
    await get().refresh()
  },

  refresh: async () => {
    set({ status: "loading" })
    const res = await spaceApi.list()
    if (res.ok) {
      applySnapshot(set, res.data)
      return
    }
    // 没有 Rust 后端 = 浏览器预览模式，与「读取失败」区分开，走不同 UI
    if (res.error.code === "STORE_UNAVAILABLE") {
      set({ status: "unavailable", error: res.error })
      return
    }
    set({ status: "error", error: res.error })
  },

  pickBackupPath: async (defaultName) => {
    const res = await spaceApi.pickBackupPath(defaultName)
    return res.ok ? res.data.path : null
  },

  createSpace: async (input) => {
    if (get().pending) return { ok: false, reason: "error", error: BUSY }
    set({ pending: true })
    try {
      const res = await spaceApi.create(input)
      if (res.ok) {
        applySnapshot(set, res.data)
        return { ok: true }
      }
      return { ok: false, reason: "error", error: res.error }
    } finally {
      set({ pending: false })
    }
  },

  backupSpace: async () => {
    const { dbPath } = get()
    if (!dbPath) {
      const error: SpaceError = { code: "INVALID_PATH", message: "笔记库位置未知" }
      return { ok: false, reason: "error", error }
    }

    const dest = await get().pickBackupPath(suggestBackupName(dbPath))
    if (!dest) return { ok: false, reason: "cancelled" }

    set({ pending: true })
    try {
      const res = await spaceApi.backup(dest)
      if (res.ok) {
        return { ok: true, notice: `已备份到 ${dest}` }
      }
      set({ error: res.error })
      return { ok: false, reason: "error", error: res.error }
    } finally {
      set({ pending: false })
    }
  },

  setActive: async (id) => {
    const res = await spaceApi.setActive(id)
    const { snapshot, error } = decode(res)
    if (snapshot) {
      applySnapshot(set, snapshot)
      return { ok: true }
    }
    if (error) set({ error })
    return { ok: false, reason: "error", error: error ?? { code: "UNKNOWN", message: "未知错误" } }
  },

  countArticles: async (id) => {
    const res = await spaceApi.articleCount(id)
    return res.ok ? res.data : null
  },

  removeSpace: async (id) => {
    const res = await spaceApi.remove(id)
    const { snapshot, error } = decode(res)
    if (snapshot) {
      applySnapshot(set, snapshot)
      return { ok: true, notice: "空间及其笔记已删除" }
    }
    if (error) set({ error })
    return { ok: false, reason: "error", error: error ?? { code: "UNKNOWN", message: "未知错误" } }
  },

  reveal: async () => {
    const { dbPath } = get()
    if (!dbPath) return
    // 可选能力：忽略结果
    await spaceApi.reveal(dbPath)
  },

  clearError: () => set({ error: null }),
}))

// ===== 选择器（组件一律用这些，避免订阅整个 store） =====
export const useSpaces = (): Space[] => useSpaceStore((s) => s.spaces)
export const useActiveSpaceId = (): string | null => useSpaceStore((s) => s.activeSpaceId)
export const useDbPath = (): string | null => useSpaceStore((s) => s.dbPath)
export const useSpaceStatus = (): SpaceStatus => useSpaceStore((s) => s.status)
export const useSpacePending = (): boolean => useSpaceStore((s) => s.pending)
export const useSpaceError = (): SpaceError | null => useSpaceStore((s) => s.error)

// 返回数组内已有对象的同一引用（Object.is 稳定），无需 useShallow
export const useActiveSpace = (): Space | null =>
  useSpaceStore((s) => s.spaces.find((sp) => sp.id === s.activeSpaceId) ?? null)

// 返回新对象 → 必须用 useShallow 包裹 selector
export const useSpaceActions = () =>
  useSpaceStore(
    useShallow((s) => ({
      bootstrap: s.bootstrap,
      refresh: s.refresh,
      pickBackupPath: s.pickBackupPath,
      createSpace: s.createSpace,
      setActive: s.setActive,
      countArticles: s.countArticles,
      removeSpace: s.removeSpace,
      backupSpace: s.backupSpace,
      reveal: s.reveal,
      clearError: s.clearError,
    })),
  )
