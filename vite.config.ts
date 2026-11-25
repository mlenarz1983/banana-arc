import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: process.env.SINGLE_FILE === 'true' ? [viteSingleFile()] : [],
});
