<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
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
const sites = ref<Site[]>([]);
const collapsed = ref(false);

const onCollapse = (val: boolean, type: string) => {
    collapsed.value = val;
    const content = type === 'responsive' ? '触发响应式收缩' : '点击触发收缩';
    Message.info({
        content,
        duration: 2000,
    });
}

const handleSelect = (v: string | number | Record<string, any>) => {
    if (v === 'add_new_site') {
        router.push({ name: 'create-site' });
    } else {
        console.log('Selected site:', v);
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
    <div>
        <div class="m-2 rounded-lg flex items-center transition-all duration-200" :class="collapsed ? 'justify-center' : 'justify-between'">
            <a-dropdown position="bl" @select="handleSelect">
                <div class="flex items-center cursor-pointer transition-all duration-200" :class="collapsed ? 'justify-center w-auto' : 'justify-between w-full'">
                    <div class="flex items-center gap-3">
                        <a-avatar :style="{ backgroundColor: '#7BC616' }" shape="square" :size="32">我</a-avatar>
                        <div v-show="!collapsed" class="flex flex-col text-left overflow-hidden">
                            <span class="text-sm font-bold truncate leading-tight">我的技术博客</span>
                            <span class="text-xs font-medium truncate leading-tight text-slate-500">staticwrite.com</span>
                        </div>
                    </div>
                    <ChevronDown v-show="!collapsed" class="size-4" />
                </div>
                <template #content>
                    <div class="w-64">
                        <a-dgroup title="切换站点">
                            <a-doption v-for="site in sites" :key="site.id" :value="site.id">{{ site.name }}</a-doption>
                            <a-doption v-if="sites.length === 0" disabled>暂无站点</a-doption>
                        </a-dgroup>
                         <a-divider :margin="0"/>
                         <a-doption value="add_new_site">添加新站点</a-doption>
                    </div>
                </template>
            </a-dropdown>
        </div>
        <a-menu :style="{ width: '200px', height: '100%' }" :default-selected-keys="['1']" breakpoint="xl"
            @collapse="onCollapse">
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
