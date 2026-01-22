<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { SquarePen, FolderOpen, HelpCircle, Loader2 } from 'lucide-vue-next'
import { createSite } from '@/lib/db'
import { open } from '@tauri-apps/plugin-dialog'
import { toast } from 'vue-sonner'

const isLoading = ref(false)

const createForm = reactive({
  name: '',
  description: '',
  path: '',
})

const formSchema = toTypedSchema(z.object({
  name: z.string().trim().min(2, { message: '站点名称至少需要2个字符' }).max(50, { message: '站点名称不能超过50个字符' }),
  description: z.string().trim().optional().default(''),
  path: z.string().min(1, { message: '请选择本地存储路径' }),
}))

const form = useForm({
  validationSchema: formSchema,
})

const handleSelectFolder = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (selected && typeof selected === 'string') {
      form.setFieldValue('path', selected)
    }
  } catch (error) {
    console.error('Failed to open dialog:', error)
    toast.error('无法打开文件选择器')
  }
}

const onSubmit = form.handleSubmit(async (values) => {
  isLoading.value = true
  try {
    const siteId = await createSite({
      name: values.name,
      description: values.description || '',
      path: values.path
    })
    console.log('Site created with ID:', siteId)
    toast.success('站点创建成功！', {
      description: `已准备好在 ${values.name} 开始你的创作。`
    })
    // TODO: Navigate to dashboard
  } catch (e: any) {
    console.error('Failed to create site:', e)
    toast.error('创建站点失败', {
      description: e.message || '请检查输入并重试'
    })
  } finally {
    isLoading.value = false
  }
})
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
        <h1 class="text-xl font-extrabold text-card-foreground mb-2 tracking-tight font-serif">创建你的第一个站点</h1>
        <p class="text-primary">开启你的写作之旅</p>
      </div>

      <a-space direction="vertical" size="large">
        <a-form :model="createForm" layout="vertical" size="large">
          <a-form-item field="name" label="站点名称">
            <a-input v-model="createForm.name" placeholder="我的精彩博客..." />
          </a-form-item>
          <a-form-item field="description" label="站点描述">
            <a-input v-model="createForm.description" placeholder="关于技术与设计的思考..." />
          </a-form-item>
          <a-form-item field="path">
            <a-checkbox v-model="createForm.path">
              I have read the manual
            </a-checkbox>
          </a-form-item>
          <a-form-item>
            <a-button>Submit</a-button>
          </a-form-item>
        </a-form>
        <div>
          {{ createForm }}
        </div>
      </a-space>

      <form @submit="onSubmit" class="space-y-6">
        <!-- Site Name -->
        <FormField v-slot="{ componentField }" name="name" :validate-on-input="false" :validate-on-model-update="false">
          <FormItem class="space-y-2 text-left">
            <FormLabel class="font-bold text-foreground">站点名称</FormLabel>
            <FormControl>
              <Input type="text" placeholder="我的精彩博客" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Site Description -->
        <FormField v-slot="{ componentField }" name="description" :validate-on-input="false"
          :validate-on-model-update="false">
          <FormItem class="space-y-2 text-left">
            <FormLabel class="font-bold text-foreground">站点描述</FormLabel>
            <FormControl>
              <Input type="text" placeholder="关于技术与设计的思考..." v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Storage Path -->
        <FormField v-slot="{ componentField }" name="path" :validate-on-input="false" :validate-on-model-update="false">
          <FormItem class="space-y-2 text-left">
            <FormLabel class="font-bold text-foreground">本地存储路径</FormLabel>
            <FormControl>
              <div class="relative">
                <Input v-bind="componentField" placeholder="选择本地文件夹..." class="pr-12 cursor-pointer" readonly
                  @click="handleSelectFolder" />
                <button @click="handleSelectFolder" type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                  <FolderOpen class="w-5 h-5" />
                </button>
              </div>
            </FormControl>
            <p class="text-xs text-muted-foreground pt-1">
              此文件夹将用于存储所有的文章与资源文件。
            </p>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Submit Button -->
        <Button type="submit" class="w-full text-base mt-2" :disabled="isLoading">
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          {{ isLoading ? '创建中...' : '创建站点' }}
        </Button>
      </form>


    </div>

    <!-- Footer Help -->
    <div class="mt-8">
      <a href="#"
        class="flex items-center gap-1.5 text-muted-foreground hover:text-primary text-sm font-medium transition-colors">
        <HelpCircle class="w-4 h-4" />
        需要配置帮助？
      </a>
    </div>
  </div>
</template>
