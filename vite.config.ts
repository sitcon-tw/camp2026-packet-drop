import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const wsPort = process.env.WS_PORT ?? '8080';

export default defineConfig({
	server: {
		proxy: {
			'/ws': {
				target: `ws://localhost:${wsPort}`,
				ws: true,
				rewriteWsOrigin: true
			}
		}
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			typescript: {
				config: (config) => ({
					...config,
					include: [...config.include, '../drizzle.config.ts']
				})
			}
		})
	]
});
