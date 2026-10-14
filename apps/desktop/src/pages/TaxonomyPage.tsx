import * as React from 'react';

import { useSite } from '@/context/SiteContext';
import { TaxonomyColumn } from '@/components/TaxonomyColumn';
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  listCategories,
  listTags,
  renameCategory,
  renameTag,
} from '@/lib/taxonomy';
import type { Category, Tag } from '@/types/api';

/** 分类与标签管理页：/taxonomy（两栏，各含新建/重命名/删除） */
export function TaxonomyPage() {
  const { activeSite } = useSite();
  const siteId = activeSite?.id ?? null;

  const [tags, setTags] = React.useState<Tag[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);

  const reload = React.useCallback(async () => {
    if (siteId === null) {
      setTags([]);
      setCategories([]);
      return;
    }
    const [tagList, categoryList] = await Promise.all([
      listTags(siteId),
      listCategories(siteId),
    ]);
    setTags(tagList);
    setCategories(categoryList);
  }, [siteId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex h-full flex-col p-8" data-testid="taxonomy-page">
      <h1 className="font-bold text-xl tracking-tight">分类与标签</h1>

      <div className="mt-4 flex flex-1 gap-10">
        <TaxonomyColumn
          items={categories}
          kindLabel="分类"
          onCreate={async (name) => {
            await createCategory({ siteId: siteId as number, name });
            await reload();
          }}
          onDelete={async (id) => {
            await deleteCategory(id);
            await reload();
          }}
          onRename={async (id, name) => {
            await renameCategory({ id, name });
            await reload();
          }}
          testId="category"
          title="分类"
        />

        <TaxonomyColumn
          items={tags}
          kindLabel="标签"
          onCreate={async (name) => {
            await createTag({ siteId: siteId as number, name });
            await reload();
          }}
          onDelete={async (id) => {
            await deleteTag(id);
            await reload();
          }}
          onRename={async (id, name) => {
            await renameTag({ id, name });
            await reload();
          }}
          testId="tag"
          title="标签"
        />
      </div>
    </div>
  );
}
