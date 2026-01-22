<script setup lang='ts'>
import Sidebar from '@/components/Sidebar.vue';


</script>

<template>
    <div class="h-screen w-screen flex font-display overflow-hidden">
        <Sidebar />
        <div>
            <router-view />
        </div>
    </div>
</template>