import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({ server: { allowedHosts: ['d3e8-102-93-13-202.ngrok-free.app'] }, plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: ['favicon.svg'], manifest: { name: 'UC-CMMM Assessment Toolkit', short_name: 'Assessment Toolkit', description: 'Assess organisational change management maturity.', theme_color: '#010a14', background_color: '#f3f6f5', display: 'standalone', icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] }, workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] } })] });
