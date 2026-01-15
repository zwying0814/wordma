<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SquarePen, FolderOpen, HelpCircle } from 'lucide-vue-next'

const siteName = ref('')
const siteDescription = ref('')
const storagePath = ref('')

// Function to handle folder selection (mock for now)
const handleSelectFolder = async () => {
  // In a real Tauri app, we would use the dialog plugin here
  console.log('Select folder clicked')
}

const handleCreate = () => {
  console.log('Create site', {
    name: siteName.value,
    description: siteDescription.value,
    path: storagePath.value
  })
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
    <!-- Icon Logo -->
    <div class="mb-8 p-3 bg-primary/10 rounded-md">
      <SquarePen class="size-5 text-primary" />
    </div>

    <!-- Main Card -->
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-xl font-bold text-card-foreground mb-2 tracking-tight">创建你的第一个站点</h1>
        <p class="text-primary">开启你的写作之旅</p>
      </div>

      <div class="space-y-6">
        <!-- Site Name -->
        <div class="space-y-2">
          <label class="font-bold text-foreground block text-left">站点名称</label>
          <Input 
            v-model="siteName" 
            placeholder="我的精彩博客" 
          />
        </div>

        <!-- Site Description -->
        <div class="space-y-2">
          <label class="font-bold text-foreground block text-left">站点描述</label>
          <Input 
            v-model="siteDescription" 
            placeholder="关于技术与设计的思考..." 
          />
        </div>

        <!-- Storage Path -->
        <div class="space-y-2">
          <label class="font-bold text-foreground block text-left">本地存储路径</label>
          <div class="relative">
            <Input 
              v-model="storagePath" 
              placeholder="选择本地文件夹..." 
              class="pr-12 cursor-pointer"
              readonly
              @click="handleSelectFolder"
            />
            <button 
              @click="handleSelectFolder"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
            >
              <FolderOpen class="w-5 h-5" />
            </button>
          </div>
          <p class="text-xs text-muted-foreground text-left">
            此文件夹将用于存储所有的文章与资源文件。
          </p>
        </div>

        <!-- Submit Button -->
        <Button 
          class="w-full text-base mt-2"
          @click="handleCreate"
        >
          创建站点
        </Button>
      </div>
    </div>

    <!-- Footer Help -->
    <div class="mt-8">
      <a href="#" class="flex items-center gap-1.5 text-muted-foreground hover:text-primary text-sm font-medium transition-colors">
        <HelpCircle class="w-4 h-4" />
        需要配置帮助？
      </a>
    </div>
  </div>
</template>
