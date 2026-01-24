import { createRouter, createWebHistory } from 'vue-router'
import ArticlePage from '@/views/ArticlePage.vue'
import Dashboard from '@/layouts/Dashboard.vue'
import ImmersiveWriterPage from '@/views/ImmersiveWriterPage.vue'
import { getAllSites, getLastSiteId, setLastSiteId } from '@/lib/db'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'root', 
            component: () => import('@/views/CreateSitePage.vue'), // Fallback component to satisfy router validation
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
    
    try {
        const sites = await getAllSites();
        
        if (sites.length === 0) {
            if (to.name !== 'create-site') {
                next({ name: 'create-site' });
            } else {
                next();
            }
            return;
        }

        const isInitialLoad = !from.name;
        // If visiting root, redirect to last opened site or first site
        if (to.path === '/' || to.name === 'root') {
            const lastSiteId = await getLastSiteId();
            console.log(lastSiteId);
    
            if (lastSiteId) {
                const siteExists = sites.find(s => s.id === lastSiteId);
                if (siteExists) {
                    next({ name: 'article', params: { siteId: lastSiteId } });
                    return;
                }
            }
            // Fallback to first site
            next({ name: 'article', params: { siteId: sites[0].id } });
            return;
        }

        // Initial load should not stay on create-site if sites already exist
        if (to.name === 'create-site' && isInitialLoad) {
            const lastSiteId = await getLastSiteId();
            if (lastSiteId) {
                const siteExists = sites.find(s => s.id === lastSiteId);
                if (siteExists) {
                    next({ name: 'article', params: { siteId: lastSiteId } });
                    return;
                }
            }
            next({ name: 'article', params: { siteId: sites[0].id } });
            return;
        }

        next();
    } catch (error) {
        console.error('Route guard error:', error);
        next();
    }
});

router.afterEach(async (to) => {
    if (to.params.siteId) {
        await setLastSiteId(Number(to.params.siteId));
    }
});

export default router
