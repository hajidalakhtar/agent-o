import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		globals: false
	},
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			$test: fileURLToPath(new URL('./tests', import.meta.url))
		}
	}
});
