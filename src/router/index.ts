import { createRouter, createWebHistory } from 'vue-router'
import ArticlePage from '@/views/ArticlePage.vue'
import Dashboard from '@/layouts/Dashboard.vue'
import ImmersiveWriterPage from '@/views/ImmersiveWriterPage.vue'
import { getAllSites } from '@/lib/db'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'root', // Add a name for clarity
            redirect: () => {
                return { name: 'create-site' } // Default fallback, overridden by guard
            }
        },
        {
            path: '/site/:siteId',
            component: Dashboard,
            children: [
                {
                    path: '',
                    name: 'article', // This is technically article-list
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

router.beforeEach(async (to, from, next) => {
    if (to.name === 'create-site') {
        next();
        return;
    }

    try {
        const sites = await getAllSites();
        console.log('Loaded sites:', sites);
        
        if (sites.length === 0) {
            next({ name: 'create-site' });
            return;
        }

        // If visiting root, redirect to first site
        if (to.path === '/' || to.name === 'root') {
            next({ name: 'article', params: { siteId: sites[0].id } });
            return;
        }

        next();
    } catch (error) {
        console.error('Route guard error:', error);
        next();
    }
});

export default router
