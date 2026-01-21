import { createApp } from "vue";
import ArcoVue from '@arco-design/web-vue';
import App from "./App.vue";
import "./style.css";
import './assets/arco.css';
import 'vue-sonner/style.css';
const app = createApp(App);
app.use(ArcoVue);
app.mount('#app');
