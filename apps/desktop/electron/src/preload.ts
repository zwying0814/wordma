import { contextBridge, ipcRenderer } from 'electron';

/**
 * 渲染层唯一后端入口：window.api.invoke(channel, payload)。
 * 白名单在主进程 ipc-register.ts（未注册的 channel 由 ipcMain 拒绝）。
 */
const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('api', api);
