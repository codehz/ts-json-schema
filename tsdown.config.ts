import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'index.ts',
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'node',
  sourcemap: true,
  tsconfig: 'tsconfig.build.json',
})
