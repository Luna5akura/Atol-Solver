# Puzzle Workspace

这个仓库是一个外层 workspace，用来同时开发前端编辑器和 Rust/WASM solver。

- `pzprjs/`：网页前端、题型实现、UI、打包产物
- `cspuz_core/`：Rust solver、WASM backend

如果你要改 `travelline`，通常会同时碰到这两个目录。

## 目录结构

```text
puzzle/
├── README.md
├── shell.nix
├── pzprjs/
└── cspuz_core/
```

## 快速开始

### 1. 进入开发环境

如果你在 NixOS，或者希望用一致的工具链，推荐直接：

```bash
nix-shell
```

进入后可以先确认关键工具：

```bash
which emcc
emcc --version
node --version
pnpm --version
```

### 2. 构建 solver backend

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug
```

构建结果会输出到：

- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.js`
- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.wasm`

### 3. 更新前端使用的 wasm

回到 workspace 根目录：

```bash
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/
```

### 4. 构建前端

```bash
cd pzprjs
pnpm build
```

### 5. 本地预览

```bash
cd pzprjs
./node_modules/.bin/live-server dist
```

然后打开浏览器访问：

```text
http://127.0.0.1:8080/p.html?travelline
```

实际端口以终端输出为准。

## 日常开发

### 只改前端

```bash
cd pzprjs
pnpm build
```

### 改了 Rust backend

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug

cd ..
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/

cd pzprjs
pnpm build
```

### 推荐的联动开发方式

`pzprjs` 里已经有联动开发命令：

```bash
cd pzprjs
pnpm dev
```

这个命令通常会：

- 监听前端源码
- 监听 backend solver 源码
- backend 变化后自动重建 wasm
- 自动复制 wasm 到 `dist/wasm`
- 启动本地静态服务

前提是当前终端里能正常使用 `emcc`。

## 如何确认浏览器在跑最新 wasm

只改 Rust 代码并不会自动让浏览器用上新 solver。最稳的顺序是：

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug

cd ..
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/

cd pzprjs
pnpm build
```

然后在浏览器里：

1. 强制刷新页面
2. 打开开发者工具 Network
3. 确认重新加载了：
   - `cspuz_solver_backend.js`
   - `cspuz_solver_backend.wasm`

## 题型与 solver 说明

### 普通题型

大多数已接入 backend 的题型会走 `cspuz_core` 的 `irrefutable_facts` 语义：

- 只返回所有解中都成立的事实
- 不要求题目必须唯一解

### `travelline`

`travelline` 优先使用 `cspuz_core` 的自定义 backend。  
如果当前盘面超出 backend 已支持的范围，前端会回退到本地 solver。

当前这条链路的设计目标是：

- 能在页面里直接 `Run solver / Auto solver`
- 优先输出可确定的公共结论
- 在求解期间允许继续修改题板
- 修改题板后取消旧任务并重新开始

## 常见问题

### `emcc: command not found`

说明当前终端没有可用的 Emscripten 环境。  
如果使用这个仓库自带环境，先执行：

```bash
nix-shell
```

然后再确认：

```bash
which emcc
```

### 改了 backend，但页面效果没变

通常是漏掉了下面某一步：

1. 重建 `cspuz_solver_backend`
2. 拷贝到 `pzprjs/dist/wasm`
3. 重新执行 `pnpm build`
4. 浏览器强制刷新

### solver 过程中编辑题板会卡顿

当前 `travelline` 的 wasm backend 已经放进 worker 线程。  
如果仍然感觉卡顿，先确认浏览器加载的是最新的 `dist/js/solver.js`、`dist/js/solver-worker.js` 和最新 wasm。

## 发布

真正需要部署的是：

- `pzprjs/dist/`

它是一个静态站点，可以部署到常见静态托管平台，例如：

- GitHub Pages
- Vercel
- Netlify

最简单的发布流程：

```bash
cd pzprjs
pnpm build
```

然后把 `dist/` 发布出去即可。

## 自动部署到 GitHub Pages

这个仓库现在已经带了一个 GitHub Actions workflow：

- `.github/workflows/deploy-pages.yml`

它会在下面两种情况下触发：

- push 到 `main`
- 手动 `Run workflow`

这个 workflow 会自动完成：

1. 拉取外层仓库和 submodule
2. 用 `nix-shell` 准备 `emcc / node / pnpm`
3. 构建 `cspuz_core` 的 release wasm
4. 把 wasm 复制到 `pzprjs/dist/wasm`
5. 构建 `pzprjs/dist`
6. 发布到 GitHub Pages

### 第一次启用

在 GitHub 仓库页面：

1. 打开 `Settings`
2. 打开 `Pages`
3. 在 `Build and deployment` 里把 `Source` 设成 `GitHub Actions`

这是 GitHub 官方推荐的 Pages 自定义 workflow 方式。  
参考文档：

- https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/actions/deployment/about-deployments/deploying-with-github-actions

### 之后怎么工作

以后只要你把外层仓库的 `main` 分支推上去：

```bash
git push
```

GitHub 就会自动重新构建并发布站点。

### 站点地址

如果这是一个项目仓库，默认地址通常是：

```text
https://<owner>.github.io/<repository-name>/
```

例如 `travelline` 页面通常会是：

```text
https://<owner>.github.io/<repository-name>/p.html?travelline
```

### 注意事项

- workflow 构建的是外层仓库里的 `pzprjs/dist`
- 如果你更新了 `pzprjs/` 或 `cspuz_core/` 子仓库，但**没有**把新的 submodule 指针提交到外层仓库，Pages 不会拿到这些更新
- 所以自动部署前，记得：
  1. 提交并推送子仓库
  2. 提交并推送外层仓库里的 submodule 指针

## 外层仓库与 submodule

这个 workspace 适合作为外层仓库，`pzprjs/` 和 `cspuz_core/` 作为子仓库管理。

### 查看状态

```bash
git status
git submodule status
```

### 子仓库改完后的推荐提交流程

先提交子仓库：

```bash
cd pzprjs
git add .
git commit -m "Update pzprjs"
git push
```

或者：

```bash
cd cspuz_core
git add .
git commit -m "Update cspuz_core"
git push
```

然后回到外层仓库提交 submodule 指针：

```bash
cd ..
git add pzprjs cspuz_core
git commit -m "Update submodule pointers"
git push
```

### 新机器拉取

```bash
git clone <workspace-repo>
cd puzzle
git submodule update --init --recursive
```

### 拉取子仓库最新内容

```bash
git submodule update --remote --recursive
```

## 常用命令速查

构建 backend：

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug
```

构建前端：

```bash
cd pzprjs
pnpm build
```

联动开发：

```bash
cd pzprjs
pnpm dev
```

本地预览：

```bash
cd pzprjs
./node_modules/.bin/live-server dist
```
