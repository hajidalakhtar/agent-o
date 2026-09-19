import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		globals: false,
		// Test yang membuat repo/worktree git nyata butuh ruang lebih saat file berjalan paralel.
		testTimeout: 30_000
	},
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			$test: fileURLToPath(new URL('./tests', import.meta.url))
		}
	}
});
