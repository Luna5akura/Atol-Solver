# Puzzle Workspace

这个仓库是一个外层 workspace，用来同时开发两个子仓库：

- `pzprjs/`：网页前端、题型实现、UI、发布产物
- `cspuz_core/`：Rust/WASM solver backend

当前我们在这个 workspace 里做的主要事情包括：

- 给 `pzprjs` 增加 `travelline` 题型
- 给页面加 `Run solver / Auto solver`
- 让 `pzprjs` 使用 `cspuz_core` 生成的 WASM solver

## 仓库结构

```text
puzzle/
├── README.md
├── pzprjs/
└── cspuz_core/
```

这两个目录应该作为子仓库管理。外层仓库只记录它们当前指向的 commit。

## 你最常用的文件

- `pzprjs/src/variety/travelline.js`
- `pzprjs/src-ui/js/solver.js`
- `pzprjs/src-ui/p.html`
- `pzprjs/src-ui/res/p.en.json`
- `pzprjs/src-ui/res/p.ja.json`
- `cspuz_core/cspuz_solver_backend/src/lib.rs`
- `cspuz_core/cspuz_solver_backend/src/board.rs`

## 首次使用

### 1. 构建 solver backend

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug
```

构建结果会出现在：

- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.js`
- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.wasm`

### 2. 拷贝到前端仓库

在 workspace 根目录执行：

```bash
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/
```

### 3. 构建前端

```bash
cd pzprjs
pnpm build
```

### 4. 本地预览

```bash
cd pzprjs
./node_modules/.bin/live-server dist
```

然后打开输出的地址，例如：

```text
http://127.0.0.1:44509/p.html?travelline
```

## 日常开发

### 推荐方式

`pzprjs` 里已经有联动开发命令：

```bash
cd pzprjs
pnpm dev
```

它会同时做这些事：

- 监听 `pzprjs/src` 和 `pzprjs/src-ui`
- 监听 `cspuz_core/cspuz_solver_backend/src`
- backend 改动后自动重新构建 WASM
- 自动把 WASM 拷贝到 `pzprjs/dist/wasm`
- 启动本地静态服务

### 手动方式

如果你只改了前端：

```bash
cd pzprjs
pnpm build
```

如果你改了 `cspuz_core`：

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug

cd ../
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/

cd pzprjs
pnpm build
```

## 发布

真正需要部署的是：

- `pzprjs/dist/`

它是一个静态站点，可以部署到：

- GitHub Pages
- Vercel
- Netlify

### 最简单的发布流程

```bash
cd pzprjs
pnpm build
```

然后把 `dist/` 目录发布到你的静态托管平台。

## Solver 说明

### 普通题型

大多数已接入 `cspuz_core` 的题型，网页端会调用 `cspuz_solver_backend.wasm`。  
这个后端的语义是 `irrefutable_facts`，也就是：

- 只输出所有解中都成立的事实
- 不要求题目唯一解

### `travelline`

`travelline` 目前走的是前端本地 solver，不是 `cspuz_core` 原生题型。  
现在它的策略是：

1. 先找一个可行解
2. 再对边做反证
3. 如果某条边改成相反状态后无解，则该边是可推断的

这比“先数清所有解再求交集”更适合大空盘。

### 常见提示

`applied N irrefutable solver results`

意思是：

- solver 找到了 `N` 个确定无疑的答案事实
- 这些结果已经写回到盘面

`solver could not finish exhaustive deduction, so no tentative result was applied`

意思是：

- 当前本地 solver 在限制内没有完成这次严格求证
- 为了保证“只输出确定事实”，它这次选择不应用任何近似结果

### 调长本地 solver 时间

如果你想减少“不完整”提示，可以改：

- `pzprjs/src-ui/js/solver.js`

在 `solveTravelLinePuzzle()` 里找：

```js
var maxStates = 2000000;
var deadline = Date.now() + 20000;
```

它们分别表示：

- `maxStates`：最多搜索多少个状态
- `deadline`：最多跑多久，单位毫秒

比如：

```js
var maxStates = 8000000;
var deadline = Date.now() + 60000;
```

然后重新构建：

```bash
cd pzprjs
pnpm build
```

代价是页面可能会慢很多。

## 这个外层仓库应该怎么用

推荐工作流是：

1. 在 `pzprjs/` 里改前端代码
2. 在 `cspuz_core/` 里改 backend 代码
3. 各自提交并推送
4. 回到外层仓库，提交 submodule 指针更新

## Submodule 工作流

### 查看状态

在外层仓库：

```bash
git status
git submodule status
```

### 更新某个子仓库后，提交外层仓库

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

然后回到外层仓库记录新的 submodule commit：

```bash
cd ..
git add pzprjs cspuz_core
git commit -m "Update submodule pointers"
git push
```

### 新机器拉取

```bash
git clone <outer-workspace-url>
cd puzzle
git submodule update --init --recursive
```

### 拉取子仓库最新内容

```bash
git submodule update --remote --recursive
```

如果你是日常开发，一般更常用的是直接进入子仓库自己 `git pull`。

## 把当前目录整理成外层仓库

如果你已经在 `puzzle/` 初始化了外层仓库，接下来应确保：

- `pzprjs/` 和 `cspuz_core/` 各自都有自己的 GitHub remote
- 外层仓库只跟踪它们作为 submodule 的指针

如果你还没把这两个目录登记成 submodule，常用流程是：

```bash
git submodule add <pzprjs-github-url> pzprjs
git submodule add <cspuz-core-github-url> cspuz_core
git commit -m "Add submodules"
```

如果目录已经存在，可能需要：

```bash
git submodule add --force <pzprjs-github-url> pzprjs
git submodule add --force <cspuz-core-github-url> cspuz_core
git commit -m "Register existing repositories as submodules"
```

## 现在最值得记住的命令

构建 backend：

```bash
cd cspuz_core
bash ./build_cspuz_solver_backend.sh debug
```

构建 frontend：

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
