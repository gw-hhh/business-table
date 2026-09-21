# BusinessTable

企业级、配置驱动的 Vue 3 通用业务表格二次封装。业务页面只负责数据、列定义、持久化适配器和业务操作；分页、列设置、视图、格式化与操作布局由组件提供。

## 运行

```bash
npx pnpm@10.17.1 install --frozen-lockfile
npx pnpm@10.17.1 exec playwright install chromium
npx pnpm@10.17.1 run verify:release
npx pnpm@10.17.1 run dev -- --host 127.0.0.1
```

打开 http://127.0.0.1:5173/ 。

## 快速接入

```vue
<BusinessTable table-key="asset.list" row-key="id" :columns="columns" :data-source="dataSource" :persistence="persistence" :views="views" :actions="actions" />
```

支持本地 data 或远程 dataSource。用户配置使用稳定 column.id 保存，不保存 VXE 内部对象。

## Release gate

`npm run verify:release` 必须同时通过 portability audit、SFC audit、vue-tsc、Vitest、组件库构建、Demo 构建和 Playwright Chromium E2E，才允许从 development 合并 main。

Playwright 同时检查开发页面和构建后的 Demo，捕获 console.error、pageerror、原生 window error 和 unhandledrejection。单独运行 E2E 前先执行 `npm run build:demo`。

迁移范围、旧版功能/UI/交互差异及分批计划见 [迁移矩阵](docs/LEGACY-MIGRATION.md)。[旧版原包](reference/legacy-v3.1/README.md)仅作参考，不参与正式构建。Provider 生命周期与分页行为见 [使用说明](docs/USAGE.md)。
