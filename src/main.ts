import { createApp } from "vue";
import ArcoVue from '@arco-design/web-vue';
import App from "./App.vue";
import router from './router';
import './assets/arco.css';
import "./style.css";

const app = createApp(App);
app.use(router);
app.use(ArcoVue);
app.mount('#app');
