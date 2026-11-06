import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        open: true,
        port: 3000,
        // Fail loudly if 3000 is taken instead of moving to the next port: drifting onto 3001 made the /api proxy
        // forward to itself in a loop until Windows ran out of sockets (ENOBUFS)
        strictPort: true,
        proxy: {
            '/api': {
                // 127.0.0.1, not localhost: localhost can resolve to ::1, where something other than the backend may listen
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'build',
        chunkSizeWarningLimit: 4000,
    },
});
