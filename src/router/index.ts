import { createRouter, createWebHistory } from 'vue-router'
import ArticlePage from '@/views/ArticlePage.vue'
import Dashboard from '@/layouts/Dashboard.vue'
import ImmersiveWriterPage from '@/views/ImmersiveWriterPage.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            component: Dashboard,
            children: [
                {
                    path: '',
                    name: 'article',
                    component: ArticlePage,
                }
            ],
        },
        {
            path: '/immersive',
            name: 'immersive',
            component: ImmersiveWriterPage,
        },
        {
            path: '/create-site',
            name: 'create-site',
            component: () => import('@/views/CreateSitePage.vue'),
        },
    ]
})

export default router
