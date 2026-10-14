/** 占位页：后续任务接管（T7 文章列表 / T9 分类标签 / T11 媒体库 / T13 页面 / T16 设置） */
export function PlaceholderPage({ title, task }: { title: string; task: string }) {
  return (
    <div className="flex h-full flex-col gap-2 p-8">
      <h1 className="font-bold text-xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">建设中（{task}）</p>
    </div>
  );
}
