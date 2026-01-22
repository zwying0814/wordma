<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router'; // Make sure Link is available (though automatic in template)

const viewMode = ref<'wysiwyg' | 'split'>('wysiwyg');
const content = ref(`In a world cluttered with noise, the blank page offers a sanctuary.

Minimalism in design is not merely the absence of decoration, but the removal of distraction to elevate the content. When we strip away the non-essential, we are left with the core message, raw and impactful.

The cursor blinks. A steady, rhythmic pulse waiting for the next thought. This interface, designed to fade into the background, allows the writer to enter a state of flow almost immediately.

Typography plays a crucial role here. The choice of Inter, a typeface designed for computer screens, ensures legibility without imposing a strong personality that might clash with the writer's tone. The generous line height lets the eyes travel comfortably from one line to the next.

Imagine this: a late evening, a cup of tea, and just this screen. No notifications, no sidebars clamoring for attention. Just the words forming one by one.`);
</script>

<template>
  <div class="relative min-h-screen flex flex-col bg-background-light dark:bg-background-dark font-display text-text-main-light dark:text-text-main-dark transition-colors duration-200">
    <!-- Sticky Semi-transparent Toolbar -->
    <header class="sticky top-0 z-50 w-full backdrop-blur-md bg-background-light/80 dark:bg-background-dark/80 border-b border-gray-200/50 dark:border-gray-800/50 transition-all duration-300">
      <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <!-- Left: Back Button -->
        <router-link to="/" class="group flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <span class="material-symbols-outlined text-text-muted-light dark:text-text-muted-dark group-hover:text-primary-custom transition-colors">arrow_back</span>
        </router-link>
        
        <!-- Center: Title -->
        <div class="flex-1 flex items-center justify-center">
          <input class="max-w-md w-full text-center bg-transparent border-none p-0 text-lg font-bold text-gray-900 dark:text-white placeholder-gray-400 focus:ring-0 focus:outline-none truncate" placeholder="Untitled Article" type="text" value="静态网站的未来"/>
        </div>

        <!-- Right: View Toggles & Preview -->
        <div class="flex items-center gap-2">
          <div class="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button 
              @click="viewMode = 'wysiwyg'"
              :class="`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === 'wysiwyg' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-custom' : 'text-text-muted-light hover:text-gray-900'}`"
            >
              所见即所得
            </button>
            <button 
              @click="viewMode = 'split'"
              :class="`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === 'split' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-custom' : 'text-text-muted-light hover:text-gray-900'}`"
            >
              左右布局
            </button>
          </div>
          <div class="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
          <button class="flex items-center gap-1.5 px-4 py-1.5 bg-primary-custom text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">
            <span>保存</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 flex overflow-hidden">
      <div v-if="viewMode === 'wysiwyg'" class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto py-12 px-6">
          <textarea 
            class="w-full min-h-[70vh] resize-none bg-transparent border-none p-0 text-lg sm:text-xl leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0 font-normal prose dark:prose-invert focus:outline-none" 
            placeholder="开始写作..." 
            v-model="content"
            spellcheck="false" 
          />
        </div>
      </div>
      <div v-else class="flex-1 flex divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden">
        <!-- Editor Panel -->
        <div class="flex-1 overflow-y-auto p-8 bg-slate-50/30 dark:bg-slate-900/10">
          <textarea 
            class="w-full h-full resize-none bg-transparent border-none p-0 text-sm font-mono leading-relaxed text-gray-800 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0 focus:outline-none" 
            placeholder="在此处输入 Markdown..." 
            v-model="content"
            spellcheck="false" 
          />
        </div>
        <!-- Preview Panel -->
        <div class="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark">
          <div class="prose prose-slate dark:prose-invert max-w-none">
            <p v-for="(line, i) in content.split('\n')" :key="i">
                {{ line || '&nbsp;' }}
            </p>
          </div>
        </div>
      </div>
    </main>
    <!-- Floating Action Button (FAB) for Settings -->
    <div class="fixed bottom-8 right-8 z-40 group">
      <!-- Tooltip -->
      <div class="absolute bottom-full right-0 mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        Article Settings
      </div>
      <button class="flex items-center justify-center w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:text-primary-custom hover:-translate-y-1 transition-all duration-300 border border-gray-100 dark:border-gray-700">
        <span class="material-symbols-outlined text-2xl">tune</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Copied styles */
textarea {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
textarea::-webkit-scrollbar {
    display: none;
}
</style>
