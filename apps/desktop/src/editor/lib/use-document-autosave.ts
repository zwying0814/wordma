import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options {
  /** 编辑器就绪且内容可保存时开启 */
  enabled: boolean;
  delay?: number;
  /** 返回是否保存成功；silent=false 时由调用方决定是否 toast */
  save: (silent: boolean) => Promise<boolean>;
}

/** 编辑草稿的版本号 + 防抖自动保存 + Cmd/Ctrl+S + 离开提醒 */
export function useDocumentAutosave({ enabled, delay = 1500, save }: Options) {
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [state, setState] = useState<SaveState>("idle");
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setState("dirty");
  }, []);

  const reset = useCallback(() => {
    revisionRef.current = 0;
    savingRef.current = false;
    setRevision(0);
    setSavedRevision(0);
    setState("idle");
  }, []);

  const persist = useCallback(async (silent: boolean) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    const rev = revisionRef.current;
    setState("saving");
    try {
      const ok = await saveRef.current(silent);
      if (ok) {
        setSavedRevision(rev);
        if (rev === revisionRef.current) setState("saved");
      } else {
        setState("error");
      }
      return ok;
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || revision === savedRevision) return;
    const timer = setTimeout(() => {
      void persist(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [enabled, revision, savedRevision, delay, persist]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [persist]);

  const dirty = revision !== savedRevision;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return { markDirty, persist, reset, dirty, state };
}
