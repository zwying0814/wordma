import { createContext, useContext } from "react";

export interface EditorImageContextValue {
  /** 把文章里的 /media/xxx 或外链解析成编辑器可加载的 URL */
  resolveSrc: (src: string) => string;
}

const defaultValue: EditorImageContextValue = {
  resolveSrc: (src) => src,
};

export const EditorImageContext =
  createContext<EditorImageContextValue>(defaultValue);

export function useEditorImage() {
  return useContext(EditorImageContext);
}
