import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/main.css';
import { createWebHistory } from 'vue-router';
import { browserComponentLoader } from './browser-loader.ts';
import { createKvwebui } from './create-app.ts';

const { app } = createKvwebui({ history: createWebHistory(), fetch: window.fetch.bind(window), components: browserComponentLoader, reload: () => window.location.reload() });
app.mount('#app');
