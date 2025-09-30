import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		include: ['fflate'],
		exclude: ['libarchive.js'] // Let libarchive.js handle its own bundling
	},
	worker: {
		format: 'es'
	},
	build: {
		rollupOptions: {
			external: ['libarchive.js/dist/worker-bundle.js']
		}
	}
});