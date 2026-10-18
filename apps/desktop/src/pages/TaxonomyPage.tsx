import * as React from 'react';

import { useSite } from '@/context/SiteContext';
import { PageHeader } from '@/components/ui/page-header';
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
  const { activeSite, reload: reloadNav } = useSite();
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
    <div className="flex h-full flex-col p-9" data-testid="taxonomy-page">
      <PageHeader
        subtitle={`${categories.length} 个分类 · ${tags.length} 个标签`}
        title="分类与标签"
      />

      <div className="flex min-h-0 flex-1 gap-6">
        <TaxonomyColumn
          items={categories}
          kindLabel="分类"
          onCreate={async (name) => {
            await createCategory({ siteId: siteId as number, name });
            await reload();
            await reloadNav();
          }}
          onDelete={async (id) => {
            await deleteCategory(id);
            await reload();
            await reloadNav();
          }}
          onRename={async (id, name) => {
            await renameCategory({ id, name });
            await reload();
            await reloadNav();
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
            await reloadNav();
          }}
          onDelete={async (id) => {
            await deleteTag(id);
            await reload();
            await reloadNav();
          }}
          onRename={async (id, name) => {
            await renameTag({ id, name });
            await reload();
            await reloadNav();
          }}
          testId="tag"
          title="标签"
        />
      </div>
    </div>
  );
}
