import { defineConfig } from 'vite';

// 说明：
// 1. base 用相对路径，构建产物可以放在任意子目录 —— 本地服务器（/）、
//    GitHub Pages 项目站（/mambo-chess/）、或任意静态托管。
//    不加这一项时产物是 /assets/... 绝对路径，部署到项目站会 404。
// 2. 不引入 @vitejs/plugin-react：本项目每个 JSX 文件都显式 import React，
//    走经典 JSX 运行时，Vite 内置的 esbuild 就能无损编译。
//    该插件主要提供 HMR / Fast Refresh，对生产构建没有影响，
//    引入反而会与 vite 6 产生 peer 版本冲突。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
