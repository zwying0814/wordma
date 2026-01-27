<script setup lang="ts">
import { reactive, computed, useTemplateRef, ref, onMounted } from 'vue';
import { useElementSize } from '@vueuse/core'
import { IconPlus } from '@arco-design/web-vue/es/icon';
import { getAllArticles, type Article } from '@/lib/db';

const dataSource = ref<Article[]>([]);
const loading = ref(false);

const fetchData = async () => {
  loading.value = true;
  try {
    dataSource.value = await getAllArticles();
  } catch (error) {
    console.error('Failed to fetch articles:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchData();
});

const paginationProps = reactive({
  defaultPageSize: 30,
  total: computed(() => dataSource.value.length),
  simple: true,
  showTotal: true,
  size: 'mini',
})

const box = useTemplateRef('box')
const head = useTemplateRef('head')
const boxSize = useElementSize(box)
const headSize = useElementSize(head)
const contentHeight = computed(() => boxSize.height.value - headSize.height.value - 76)
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden">
    <div ref="box" class="w-80 shrink-0 h-screen">
      <div ref="head" class="p-4 space-y-4">
        <a-input-search placeholder="搜索文章..." />
        <a-button long type="primary">
          <template #icon>
            <icon-plus />
          </template>
          新建文章
        </a-button>
      </div>
      <a-list :loading="loading" :max-height="contentHeight" :scrollbar="true" :bordered="false" :data="dataSource"
        :pagination-props="paginationProps">
        <template #item="{ item }">
          <a-list-item action-layout="vertical" class="border-none">
            <a-list-item-meta>
              <template #title>
                <span class="font-bold line-clamp-3 leading-snug">{{ item.title }}</span>
              </template>
              <template #description>
                <div class="flex items-center justify-between mt-2">
                  <span class="text-xs text-slate-500">{{ new Date(item.created_at).toLocaleDateString() }}</span>
                  <a-tag size="small" :color="item.status === 'published' ? 'green' : 'orange'">
                    {{ item.status === 'published' ? '已发布' : '草稿' }}
                  </a-tag>
                </div>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">
                  {{ item.summary || '暂无摘要' }}
                </p>
              </template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark min-w-0 relative">
      <header class="h-14 flex items-center justify-between px-6 lg:px-12 border-b border-transparent shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-slate-400 uppercase tracking-widest">预览模式</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <span class="material-symbols-outlined text-[16px]">cloud_done</span>
            <span>已保存</span>
          </div>
          <router-link to="/immersive"
            class="flex items-center gap-2 px-3 py-1.5 bg-primary-custom/10 hover:bg-primary-custom/20 text-primary-custom rounded-lg text-sm font-semibold transition-all group">
            <span class="material-symbols-outlined text-[18px]">edit_note</span>
            <span>进入沉浸式编辑</span>
          </router-link>
          <button
            class="flex items-center justify-center size-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title="Post Settings">
            <span class="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>
      </header>
      <div class="flex-1 flex overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 lg:px-12 py-8 lg:py-12">
          <div class="max-w-3xl mx-auto flex flex-col gap-6">
            <input
              class="w-full text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 bg-transparent border-none focus:ring-0 p-0 leading-tight"
              placeholder="文章标题" type="text" value="静态网站的未来" />
            <div class="flex items-center gap-4 text-sm text-slate-400 font-medium">
              <span class="flex items-center gap-1"><span
                  class="material-symbols-outlined text-[18px]">calendar_today</span> 2023年10月24日</span>
              <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">schedule</span>
                5分钟阅读</span>
            </div>
            <hr class="border-slate-100 dark:border-slate-800 w-full" />
            <div
              class="prose prose-lg dark:prose-invert prose-slate max-w-none focus:outline-none text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
              <p class="mb-4">静态网站生成器 (SSG) 已经存在了一段时间，但生态系统目前正在经历复兴。随着 Astro、Next.js 等工具的出现以及 Hugo
                等经典的完善，“静态”网站的功能定义正在迅速扩展。
              </p>
              <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-8 mb-4">为什么会有这种转变？</h2>
              <p class="mb-4">主要驱动力是性能。核心 Web 指标 (Core Web Vitals) 现在是一个排名因素，没有什么比从 CDN 边缘节点提供的预渲染 HTML
                更快了。然而，开发者体验也得到了极大的改善。</p>
              <ul class="list-disc pl-5 mb-4 space-y-2 marker:text-slate-400">
                <li><strong>混合渲染：</strong> 框架现在允许您混合使用静态页面和服务器端渲染组件。</li>
                <li><strong>构建速度：</strong> 用 Rust 和 Go 编写的工具（如 TurboPack）使构建时间变得微不足道。</li>
                <li><strong>内容层：</strong> 内容不再仅仅是 Markdown；它是由无头 CMS 驱动的结构化数据层。</li>
              </ul>
              <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-8 mb-4">边缘计算的作用</h2>
              <p class="mb-4">将逻辑移至边缘意味着即使是应用程序的动态部分也会感觉像静态的一样。数据库读取发生在离用户更近的地方，无需往返中央源服务器即可进行个性化。</p>
              <p class="text-slate-400 italic mt-8">开始写作...</p>
            </div>
          </div>
          <div class="h-40"></div>
        </div>

        <!-- Settings Right Sidebar -->
        <div
          class="w-80 hidden xl:flex flex-col border-l border-border-light dark:border-slate-800 bg-background-subtle/50 dark:bg-slate-900/30 overflow-y-auto shrink-0">
          <div class="p-5 flex flex-col gap-6">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">发布设置</h3>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">URL 别名</label>
              <div class="flex rounded-md shadow-sm">
                <span
                  class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 sm:text-sm">/</span>
                <input
                  class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md sm:text-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-primary-custom focus:border-primary-custom"
                  type="text" value="future-of-static-sites" />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">标签</label>
              <div
                class="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 flex flex-wrap gap-2">
                <span
                  class="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
                  技术 <button class="hover:text-blue-900 dark:hover:text-blue-100"><span
                      class="material-symbols-outlined text-[14px]">close</span></button>
                </span>
                <span
                  class="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
                  jamstack <button class="hover:text-blue-900 dark:hover:text-blue-100"><span
                      class="material-symbols-outlined text-[14px]">close</span></button>
                </span>
                <input class="text-sm border-none focus:ring-0 p-0 w-full bg-transparent placeholder-slate-400"
                  placeholder="添加标签..." type="text" />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">封面图</label>
              <div
                class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-md hover:border-primary-custom hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                <div class="space-y-1 text-center">
                  <span
                    class="material-symbols-outlined text-slate-400 group-hover:text-primary-custom text-[32px] transition-colors">image</span>
                  <div class="flex text-sm text-slate-600 dark:text-slate-400">
                    <span
                      class="relative cursor-pointer rounded-md font-medium text-primary-custom hover:text-blue-500 focus-within:outline-none">
                      <span>上传文件</span>
                    </span>
                  </div>
                  <p class="text-xs text-slate-500">支持 PNG, JPG, GIF，最大 10MB</p>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">摘要 / 描述</label>
              <textarea
                class="shadow-sm focus:ring-primary-custom focus:border-primary-custom block w-full sm:text-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-slate-900 dark:text-white"
                placeholder="输入简短摘要用于SEO..." rows="3"></textarea>
            </div>
            <div class="mt-auto pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-slate-700 dark:text-slate-300">发布状态</span>
                <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                  <input
                    class="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300"
                    id="toggle" name="toggle" type="checkbox" />
                  <label class="toggle-label block overflow-hidden h-5 rounded-full bg-slate-300 cursor-pointer"
                    for="toggle"></label>
                </div>
              </div>
              <button
                class="w-full flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                发布更改
              </button>
              <button
                class="w-full flex justify-center py-2 px-4 border border-slate-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none">
                删除文章
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.arco-list-item-meta-content) {
  width: 100%;
}

:deep(.arco-list) {
  min-height: v-bind(contentHeight+"px");
}
</style>