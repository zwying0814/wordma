import { Badge } from "@/components/ui/badge";

/** 文章/页面状态胶囊：已发布 / 草稿 */
export function StatusBadge({ published }: { published: boolean }) {
  return (
    <Badge variant={published ? "success" : "secondary"}>
      {published ? "已发布" : "草稿"}
    </Badge>
  );
}
