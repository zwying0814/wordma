<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router'; // Make sure Link is available (though automatic in template)
import { invoke } from '@tauri-apps/api/core';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as ReactRuntime from 'react/jsx-runtime';

// Expose React runtime for the dynamic module
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
(window as any).ReactRuntime = ReactRuntime;

// Debug helper to check runtime availability
console.log('React Runtime initialized:', { React, ReactDOM, ReactRuntime });

const viewMode = ref<'wysiwyg' | 'split'>('wysiwyg');
const showComponentsPanel = ref(false);
const previewContainer = ref<HTMLElement | null>(null);
let root: ReactDOM.Root | null = null;

const content = ref(`# Hello MDX

Try using a custom component defined in the panel:

<MyBanner>
  Custom Component Content
</MyBanner>

<Counter />
`);

const componentsCode = ref(`export const MyBanner = ({ children }) => (
  <div style={{ 
    padding: '1rem', 
    backgroundColor: '#f0f9ff', 
    borderLeft: '4px solid #0ea5e9',
    borderRadius: '4px',
    marginBottom: '1rem'
  }}>
    <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>Custom Banner</h4>
    <div style={{ color: '#0c4a6e' }}>{children}</div>
  </div>
);

export const GreenBtn = ({ children, onClick }) => (
  <button 
    onClick={onClick}
    style={{
        background: 'green',
        color: 'white',
        padding: '5px 10px',
        borderRadius: '5px'
    }}
  >
    {children}
  </button>
);
`);

// Example Custom Component (Built-in)
const Counter = () => {
    try {
      const [count, setCount] = React.useState(0);
      return React.createElement(
        'button',
        {
          className: 'px-3 py-1 bg-blue-500 text-white rounded text-sm hover:opacity-90 transition-opacity my-2',
          style: { backgroundColor: '#3b82f6', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem' },
          onClick: () => setCount(c => c + 1)
        },
        `Clicked ${count} times`
      );
    } catch (err) {
      console.error('Counter Component Error:', err);
      return React.createElement('div', { style: { color: 'red' } }, 'Counter Error');
    }
};
  
const compileCode = async (code: string) => {
    try {
        const compiled = await invoke<string>('compile_mdx', { content: code });
        // Debug compilation output
        console.log('Compiler Output Preview:', compiled.substring(0, 200));

        // Fix: More robust regex for imports
        let jsCode = compiled.replace(
            /import\s*\{([^}]+)\}\s*from\s*['"]react\/jsx-runtime['"];?/g,
            (_, imports) => {
                const destructured = imports.replace(/\s+as\s+/g, ': ');
                return `const {${destructured}} = window.ReactRuntime;`;
            }
        );
        jsCode = jsCode.replace(
            /import\s+\*\s+as\s+React\s+from\s*['"]react['"];?/g,
            'const React = window.React;'
        );
         jsCode = jsCode.replace(
            /import\s+React\s+from\s*['"]react['"];?/g,
            'const React = window.React;'
        );
        return jsCode;
    } catch (e) {
        console.error('Compilation Error:', e);
        return null;
    }
};

const renderMDX = async () => {
    if (!previewContainer.value) return;
    
    try {
        // 1. Compile User Components
        let userComponents: Record<string, any> = {};
        if (componentsCode.value.trim()) {
            const compiledComps = await compileCode(componentsCode.value);
            if (compiledComps) {
                const blob = new Blob([compiledComps], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                try {
                    const module = await import(/* @vite-ignore */ url);
                    // Filter out default export and non-component exports if needed
                    // For now, take everything that isn't default
                    const { default: _, ...namedExports } = module;
                    userComponents = namedExports;
                    console.log('Loaded User Components:', Object.keys(userComponents));
                } catch (err) {
                    console.error('Failed to load custom components:', err);
                } finally {
                    URL.revokeObjectURL(url);
                }
            }
        }

        // 2. Compile Main Content
        const compiledContent = await compileCode(content.value);
        if (!compiledContent) return;

        const blob = new Blob([compiledContent], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        
        const module = await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
        
        const MDXContent = module.default;
        
        if (!root) {
            root = ReactDOM.createRoot(previewContainer.value);
        }
        
        root.render(React.createElement(MDXContent, {
             components: {
                 Counter,
                 ...userComponents // Inject user defined components
             }
        }));
        
    } catch (e) {
        console.error('MDX Render Flow Error:', e);
    }
};

watch([content, componentsCode], () => {
    // Debounce could be added here
    if (viewMode.value === 'split') {
        renderMDX();
    }
});

watch(viewMode, async (newMode) => {
    if (newMode === 'split') {
        await nextTick();
        renderMDX();
    }
});

onUnmounted(() => {
    if (root) {
        root.unmount();
        root = null;
    }
});
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
          <button 
             @click="showComponentsPanel = !showComponentsPanel" 
             title="Custom Components"
            :class="`group flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${showComponentsPanel ? 'bg-primary-custom text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'}`">
             <span class="material-symbols-outlined text-[20px]">code_blocks</span>
          </button>
          <button class="flex items-center gap-1.5 px-4 py-1.5 bg-primary-custom text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm">
            <span>保存</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 flex overflow-hidden relative">
      <div v-if="viewMode === 'wysiwyg'" class="flex-1 overflow-y-auto w-full">
        <div class="max-w-3xl mx-auto py-12 px-6">
          <textarea 
            class="w-full min-h-[70vh] resize-none bg-transparent border-none p-0 text-lg sm:text-xl leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0 font-normal prose dark:prose-invert focus:outline-none" 
            placeholder="开始写作..." 
            v-model="content"
            spellcheck="false" 
          />
        </div>
      </div>
      <div v-else class="flex-1 flex divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden w-full">
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
          <div ref="previewContainer" class="prose prose-slate dark:prose-invert max-w-none">
            <!-- React Mount Point -->
          </div>
        </div>
      </div>

       <!-- Custom Components Drawer -->
       <div 
        v-if="showComponentsPanel"
        class="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl flex flex-col z-40"
      >
        <div class="h-12 px-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">自定义组件</span>
          <button @click="showComponentsPanel = false" class="text-gray-400 hover:text-gray-600">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="flex-1 bg-gray-50 dark:bg-black relative">
             <textarea 
                class="absolute inset-0 w-full h-full p-4 font-mono text-xs leading-relaxed bg-transparent border-none resize-none focus:ring-0 text-gray-800 dark:text-gray-300"
                v-model="componentsCode"
                placeholder="// Define components here using ESM exports..."
                spellcheck="false"
             ></textarea>
        </div>
        <div class="p-3 bg-gray-50 dark:bg-black border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500">
            Export components to use them in the editor.
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
