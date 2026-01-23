<script setup lang="ts">
import { reactive, ref } from 'vue'
import { createSite } from '@/lib/db'
import { open } from '@tauri-apps/plugin-dialog'
import { Message, ValidatedError } from '@arco-design/web-vue'
import useLoading from "@/hooks/useLoading";
import { useRouter } from 'vue-router';

const router = useRouter();
const { loading, setLoading } = useLoading()
const createForm = reactive({
  name: '',
  description: '',
  path: '',
})

const handleSelectFolder = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (selected && typeof selected === 'string') {
      createForm.path = selected
    }
  } catch (error) {
    console.error('Failed to open dialog:', error)
    errorMessage.value = '无法打开文件选择器'
  }
}

const errorMessage = ref('');
const handleSubmit = async ({
  errors,
  values,
}: {
  errors: Record<string, ValidatedError> | undefined;
  values: Record<string, any>;
}) => {
  if (loading.value) return;
  if (errors) {
    console.log('Validation errors:', errors);
    return;
  }
  setLoading(true);
  try {
    const siteId = await createSite({
      name: values.name,
      description: values.description || '',
      path: values.path
    })
    Message.success('站点创建成功！已准备好开始创作。');
    router.push('/');
  } catch (err) {
    errorMessage.value = (err as Error).message;
  } finally {
    setLoading(false);
  }
}

const rules = {
  name: [
    {
      required: true,
      message: '请输入站点名称',
    },
  ],
  description: [
    {
      required: true,
      message: '请输入站点描述',
    }
  ],
  path: [
    {
      required: true,
      message: '请选择本地存储路径',
    }
  ]
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4">
    <img class="size-10 mb-4" src="/writing_hand_3d_default.webp" alt="logo" />
    <div class="w-full max-w-md">
      <div class="text-center space-y-4 mb-4">
        <div class="text-2xl font-bold text-card-foreground mb-2 tracking-tight font-serif">创建新站点</div>
        <p class="text-primary">你的故事，值得被世界倾听</p>
      </div>
      <div class="form-error-msg">{{ errorMessage }}</div>
      <a-space direction="vertical" class="w-full">
        <a-form :model="createForm" :rules="rules" layout="vertical" size="large" @submit="handleSubmit">
          <a-form-item field="name" label="站点名称" validate-trigger="blur">
            <a-input v-model="createForm.name" placeholder="我的精彩博客..." />
          </a-form-item>
          <a-form-item field="description" label="站点描述" validate-trigger="blur">
            <a-input v-model="createForm.description" placeholder="关于技术与设计的思考..." />
          </a-form-item>
          <a-form-item field="path" label="本地存储路径" validate-trigger="change">
            <a-input v-model="createForm.path" placeholder="选择本地文件夹..." @click="handleSelectFolder" readonly />
            <template #extra>
              <div>此文件夹将用于存储所有的文章与资源文件。</div>
            </template>
          </a-form-item>
          <a-form-item class="mt-6">
            <a-button :disabled="loading" size="large" long type="primary" html-type="submit"> {{ loading ?
              '创建中...' :
              '创建站点'
            }}</a-button>
          </a-form-item>
          <a-button type="text" long @click="router.push('/')">返回首页</a-button>
        </a-form>
      </a-space>
    </div>
  </div>
</template>


<style scoped>
.form-error-msg {
  height: 32px;
  color: rgb(var(--red-6));
  line-height: 32px;
}

:deep(.arco-form-item-label-col > .arco-form-item-label) {
  font-weight: 600;
}

:deep(.arco-input-wrapper .arco-input.arco-input-size-large[readonly]) {
  cursor: pointer;
}
</style>