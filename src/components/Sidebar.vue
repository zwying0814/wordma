<script setup>
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import {
    IconMenuFold,
    IconMenuUnfold,
    IconFile,
    IconDriveFile,
    IconTag,
    IconBgColors,
} from '@arco-design/web-vue/es/icon';

const onCollapse = (val, type) => {
    const content = type === 'responsive' ? '触发响应式收缩' : '点击触发收缩';
    Message.info({
        content,
        duration: 2000,
    });
}
</script>

<template>
    <div class="menu-demo">
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
        </a-menu>
    </div>
</template>


