<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import {
    IconFile,
    IconDriveFile,
    IconTag,
    IconSettings,
    IconBgColors,
} from '@arco-design/web-vue/es/icon';
import { ChevronDown } from 'lucide-vue-next';
import { getAllSites, type Site } from '@/lib/db';

const router = useRouter();
const route = useRoute();
const sites = ref<Site[]>([]);
const collapsed = ref(false);

const currentSite = computed(() => {
    const id = Number(route.params.siteId);
    return sites.value.find(s => s.id === id);
});

const onCollapse = (val: boolean, _type: string) => {
    collapsed.value = val;
}

const handleSelect = (v: string | number | Record<string, any>) => {
    if (v === 'add_new_site') {
        router.push({ name: 'create-site' });
    } else if (typeof v === 'string' || typeof v === 'number') {
        router.push({ name: 'article', params: { siteId: v } });
    }
};

onMounted(async () => {
    try {
        sites.value = await getAllSites();
    } catch (error) {
        console.error('Failed to load sites:', error);
        Message.error('加载站点列表失败');
    }
});
</script>

<template>
    <div class="shrink-0" :class="collapsed ? 'w-16' : 'w-50'">
        <div class="p-2 rounded-lg flex items-center transition-all duration-200"
            :class="collapsed ? 'justify-center' : 'justify-between'">
            <a-dropdown position="bl" @select="handleSelect">
                <div class="flex items-center cursor-pointer transition-all duration-200"
                    :class="collapsed ? 'justify-center w-auto' : 'justify-between w-full'">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        <a-avatar :style="{ backgroundColor: '#7BC616' }" shape="square" :size="32">{{
                            currentSite?.name?.[0] || 'Site' }}</a-avatar>
                        <div class="flex flex-col text-left overflow-hidden">
                            <div v-show="!collapsed" class="font-bold truncate text-lg leading-tight">{{
                                currentSite?.name || '选择站点' }}</div>
                        </div>
                    </div>
                    <ChevronDown v-show="!collapsed" class="size-4" />
                </div>
                <template #content>
                    <div class="w-54">
                        <a-dgroup title="切换站点">
                            <a-doption v-for="site in sites" :key="site.id" :value="site.id">
                                <div class="flex items-center gap-2 py-4">
                                    <a-avatar :style="{ backgroundColor: '#7BC616' }" shape="square"
                                        :size="32">{{ site.name?.[0] || 'W' }}</a-avatar>
                                    <div class="flex flex-col text-left overflow-hidden">
                                        <span class="text-sm truncate leading-tight">{{ site.name }}</span>
                                        <span class="text-xs truncate leading-tight text-slate-500">{{ site.description
                                        }}</span>
                                    </div>
                                </div>
                            </a-doption>
                            <a-doption v-if="sites.length === 0" disabled>暂无站点</a-doption>
                        </a-dgroup>
                        <a-divider :margin="0" />
                        <a-doption value="add_new_site">添加新站点</a-doption>
                    </div>
                </template>
            </a-dropdown>
        </div>
        <a-menu class="w-50 flex-1" :default-selected-keys="['1']" breakpoint="xl" @collapse="onCollapse">
            <a-menu-item key="1">
                <template #icon><icon-file /></template>
                文章
            </a-menu-item>
            <a-menu-item key="2">
                <template #icon><icon-drive-file /></template>
                页面
            </a-menu-item>
            <a-menu-item key="3">
                <template #icon><icon-tag /></template>
                标签
            </a-menu-item>
            <a-menu-item key="4">
                <template #icon><icon-bg-colors /></template>
                主题
            </a-menu-item>
            <a-menu-item key="5">
                <template #icon><icon-settings /></template>
                设置
            </a-menu-item>
        </a-menu>
    </div>
</template>

<style scoped>
:deep(.arco-icon) {
    width: 20px;
    height: 20px;
}
</style>
