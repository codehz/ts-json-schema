import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  outDir: 'dist',
  format: ['esm'],
  dts: {
    tsgo: true,
  },
  platform: 'node',
  sourcemap: true,
  tsconfig: 'tsconfig.build.json',
});
