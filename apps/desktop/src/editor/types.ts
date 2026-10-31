import type { JSONContent } from "@wordma/editor-schema";

export interface EditorSnapshot {
  json: JSONContent;
  wordCount: number;
}
