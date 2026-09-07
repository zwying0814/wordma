import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import { spaceApi } from "@/lib/tauri/space-api"
import type {
  CreateSpaceInput,
  ScannedSpace,
  SpaceError,
  SpaceView,
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
 */
export type SpaceStatus = "idle" | "loading" | "ready" | "unavailable" | "error"

export type SpaceMutationResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; error: SpaceError }

type SpaceState = {
  status: SpaceStatus
  spaces: SpaceView[]
  activeSpaceId: string | null
  error: SpaceError | null
  pending: boolean

  /** 默认数据目录扫描：结果与进度（空状态首页展示候选列表用） */
  scanned: ScannedSpace[]
  scanStatus: "idle" | "scanning" | "done"

  bootstrap: () => Promise<void>
  refresh: () => Promise<void>
  pickSpaceDir: () => Promise<string | null>
  scanSpaces: () => Promise<void>
  createSpace: (input: CreateSpaceInput) => Promise<SpaceMutationResult>
  /** 不传 dir = 弹系统目录选择框；传 dir = 直接打开该目录（扫描列表项用） */
  openSpace: (dir?: string) => Promise<SpaceMutationResult>
  setActive: (id: string) => Promise<SpaceMutationResult>
  removeSpace: (id: string) => Promise<SpaceMutationResult>
  reveal: (id: string) => Promise<void>
  clearError: () => void
}

const BUSY: SpaceError = { code: "UNKNOWN", message: "操作进行中，请稍候" }

function decode(
  res: { ok: true; data: { spaces: SpaceView[]; activeSpaceId: string | null } } | { ok: false; error: SpaceError },
): { snapshot: { spaces: SpaceView[]; activeSpaceId: string | null } | null; error: SpaceError | null } {
  if (res.ok) {
    return { snapshot: res.data, error: null }
  }
  return { snapshot: null, error: res.error }
}

/** 把快照写回 state；create/open 的返回体把 snapshot 摊平在字段上，可直接复用 */
function applySnapshot(
  set: (partial: Partial<SpaceState>) => void,
  snapshot: { spaces: SpaceView[]; activeSpaceId: string | null },
) {
  set({
    status: "ready",
    spaces: snapshot.spaces,
    activeSpaceId: snapshot.activeSpaceId,
    error: null,
  })
}

export const useSpaceStore = create<SpaceState>((set, get) => ({
  status: "idle",
  spaces: [],
  activeSpaceId: null,
  error: null,
  pending: false,
  scanned: [],
  scanStatus: "idle",

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

  pickSpaceDir: async () => {
    const res = await spaceApi.pickSpaceDir()
    // 取消或错误都静默返回 null，调用方保持不变
    return res.ok ? res.data.dir : null
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

  scanSpaces: async () => {
    // 扫描进行中防重入（StrictMode 双跑 effect 也只会扫一次）
    if (get().scanStatus === "scanning") return
    set({ scanStatus: "scanning" })
    const res = await spaceApi.scan()
    if (res.ok) {
      set({ scanned: res.data, scanStatus: "done" })
      return
    }
    // 扫描失败不惊动全局 error（首页还有新建入口可用），按「没找到」处理
    set({ scanned: [], scanStatus: "done" })
  },

  openSpace: async (dir) => {
    if (get().pending) return { ok: false, reason: "error", error: BUSY }
    // 未指定目录时弹系统选择框；用户取消直接短路，不惊动 Rust
    const target = dir ?? (await get().pickSpaceDir())
    if (!target) return { ok: false, reason: "cancelled" }

    set({ pending: true })
    try {
      const res = await spaceApi.open(target)
      if (res.ok) {
        applySnapshot(set, res.data)
        return { ok: true }
      }
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

  removeSpace: async (id) => {
    const res = await spaceApi.remove(id)
    const { snapshot, error } = decode(res)
    if (snapshot) {
      applySnapshot(set, snapshot)
      return { ok: true }
    }
    if (error) set({ error })
    return { ok: false, reason: "error", error: error ?? { code: "UNKNOWN", message: "未知错误" } }
  },

  reveal: async (id) => {
    const space = get().spaces.find((s) => s.id === id)
    if (!space) return
    // 可选能力：忽略结果
    await spaceApi.reveal(space.path)
  },

  clearError: () => set({ error: null }),
}))

// ===== 选择器（组件一律用这些，避免订阅整个 store） =====
export const useSpaces = (): SpaceView[] => useSpaceStore((s) => s.spaces)
export const useActiveSpaceId = (): string | null => useSpaceStore((s) => s.activeSpaceId)
export const useSpaceStatus = (): SpaceStatus => useSpaceStore((s) => s.status)
export const useSpacePending = (): boolean => useSpaceStore((s) => s.pending)
export const useSpaceError = (): SpaceError | null => useSpaceStore((s) => s.error)

// 返回数组内已有对象的同一引用（Object.is 稳定），无需 useShallow
export const useActiveSpace = (): SpaceView | null =>
  useSpaceStore((s) => s.spaces.find((sp) => sp.id === s.activeSpaceId) ?? null)

export const useScannedSpaces = (): ScannedSpace[] => useSpaceStore((s) => s.scanned)
export const useScanStatus = (): SpaceState["scanStatus"] => useSpaceStore((s) => s.scanStatus)

// 返回新对象 → 必须用 useShallow 包裹 selector
export const useSpaceActions = () =>
  useSpaceStore(
    useShallow((s) => ({
      bootstrap: s.bootstrap,
      refresh: s.refresh,
      pickSpaceDir: s.pickSpaceDir,
      scanSpaces: s.scanSpaces,
      createSpace: s.createSpace,
      openSpace: s.openSpace,
      setActive: s.setActive,
      removeSpace: s.removeSpace,
      reveal: s.reveal,
      clearError: s.clearError,
    })),
  )
