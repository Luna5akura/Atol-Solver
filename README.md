# Puzzle Workspace

This workspace currently contains two separate repositories:

- `pzprjs/`
- `cspuz_core/`

They are not nested as one git repository today. The folder `puzzle/` itself is just a workspace root for local development.

## What Each Repository Does

- `pzprjs`
  - Main web UI and puzzle frontend
  - Contains the new `travelline` puzzle type and the solver UI
  - Produces the static site in `pzprjs/dist/`

- `cspuz_core`
  - Rust + WASM solver backend
  - Builds `cspuz_solver_backend.js` and `cspuz_solver_backend.wasm`
  - `pzprjs` consumes those WASM artifacts

## Local Development

### 1. Build the solver backend

From `cspuz_core/`:

```bash
bash ./build_cspuz_solver_backend.sh debug
```

This produces:

- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.js`
- `cspuz_core/build/cspuz_solver_backend/cspuz_solver_backend.wasm`

### 2. Copy the backend artifacts into `pzprjs`

From `puzzle/`:

```bash
cp -r cspuz_core/build/cspuz_solver_backend/* pzprjs/dist/wasm/
```

### 3. Build the frontend

From `pzprjs/`:

```bash
pnpm build
```

### 4. Run a local preview server

From `pzprjs/`:

```bash
./node_modules/.bin/live-server dist
```

Then open the printed local URL, for example:

```text
http://127.0.0.1:44509/p.html?travelline
```

## Helpful Combined Workflow

`pzprjs/package.json` already contains a dev command that watches both repositories:

```bash
cd pzprjs
pnpm dev
```

That command:

- rebuilds `pzprjs` when `src/` or `src-ui/` changes
- rebuilds the `cspuz_core` solver backend when backend Rust files change
- copies backend artifacts into `pzprjs/dist/wasm/`
- starts a local static server

## Solver Status Messages

### `applied 77 irrefutable solver results shared by all 1232 solutions`

Meaning:

- the current puzzle has at least `1232` valid full solutions
- among those solutions, `77` answer facts are identical in every solution
- only those guaranteed facts were applied

For `travelline`, these guaranteed facts can include:

- an edge that must be a line
- an inside edge that must not be a line

This is the same idea as `irrefutable_facts` in `cspuz_core`.

### `solver could not finish exhaustive deduction, so no tentative result was applied`

Meaning:

- the solver did not finish checking all solutions within its current limits
- because it did not finish the exhaustive search, it refused to output an incomplete "common part"
- this is intentional, to keep the meaning of solver output strict: only fully confirmed facts are applied

## How to Reduce This Situation

Right now, the `travelline` local solver has two limits in:

- `pzprjs/src-ui/js/solver.js`

Look for these values inside `solveTravelLinePuzzle()`:

```js
var maxStates = 200000;
var deadline = Date.now() + 1500;
```

They mean:

- `maxStates`: maximum DFS states to explore
- `deadline`: time limit in milliseconds from solver start

If you want longer search time, increase them, for example:

```js
var maxStates = 2000000;
var deadline = Date.now() + 10000;
```

Then rebuild:

```bash
cd pzprjs
pnpm build
```

Tradeoff:

- larger limits reduce premature "incomplete" cases
- but they can also make the browser feel much slower on hard boards

## Deployment

The actual web app to deploy is the built `pzprjs/dist/` directory.

Good static hosting choices:

- GitHub Pages
- Vercel
- Netlify

### Simple deployment with Vercel

From `pzprjs/`:

```bash
pnpm build
```

Deploy the `dist/` folder as a static site.

### Simple deployment with GitHub Pages

Build:

```bash
cd pzprjs
pnpm build
```

Then publish the contents of `pzprjs/dist/` to a GitHub Pages branch or to a separate deployment repository.

## How to Push to GitHub

Because this workspace root is not a git repository, you need to decide how you want to manage GitHub.

### Option A: Keep the current two-repo structure

Use this if you want `pzprjs` and `cspuz_core` to stay independent.

Push them separately:

```bash
cd pzprjs
git remote -v
git status
git add .
git commit -m "Your message"
git push origin <branch>
```

and:

```bash
cd ../cspuz_core
git remote -v
git status
git add .
git commit -m "Your message"
git push origin <branch>
```

This is the closest match to the current layout.

### Option B: Create a new outer "workspace" repository

Use this if you want one GitHub repository that tracks the whole `puzzle/` folder.

From `puzzle/`:

```bash
git init
git add README.md
git commit -m "Initialize workspace repo"
```

Then connect to GitHub:

```bash
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

For the two inner repositories, you have two sub-options:

- keep them as git submodules
- remove their inner `.git/` folders and absorb them into one monorepo

If you want the cleanest history with least surprise, prefer submodules.

### Option C: Create a new outer repository with submodules

This is usually the safest structure if both inner repositories should remain independent upstream.

From a fresh directory:

```bash
git init puzzle-workspace
cd puzzle-workspace
git submodule add <pzprjs-url> pzprjs
git submodule add <cspuz-core-url> cspuz_core
git commit -m "Add workspace submodules"
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

### Option D: Convert the current `puzzle/` folder into an outer repository that tracks both existing local repositories as submodules

Use this if you want to keep working in the current folder instead of creating a fresh sibling directory.

Important:

- do not delete `pzprjs/.git` or `cspuz_core/.git`
- commit or stash your work inside each child repository first if you want a cleaner starting point
- the outer repository will track commits of the two child repositories, not their raw file contents

One practical flow is:

1. Create GitHub repositories for:
   - the outer workspace repo
   - `pzprjs` if needed
   - `cspuz_core` if needed
2. Make sure `pzprjs` and `cspuz_core` each have the remote you want and are pushed once
3. Initialize the outer repository in `puzzle/`

From `puzzle/`:

```bash
git init
printf ".codex\n" > .gitignore
git add .gitignore README.md
git commit -m "Initialize workspace repo"
```

Then register the two existing directories as submodules by path:

```bash
git submodule add <pzprjs-github-url> pzprjs
git submodule add <cspuz-core-github-url> cspuz_core
git commit -m "Add pzprjs and cspuz_core as submodules"
```

If Git refuses because the directories already exist, the usual safe recovery flow is:

```bash
git rm --cached pzprjs cspuz_core
git submodule add --force <pzprjs-github-url> pzprjs
git submodule add --force <cspuz-core-github-url> cspuz_core
git commit -m "Register existing repositories as submodules"
```

Then connect the outer repository itself to GitHub:

```bash
git remote add origin <outer-workspace-github-url>
git branch -M main
git push -u origin main
```

After that, your push flow becomes:

1. Commit and push inside `pzprjs/`
2. Commit and push inside `cspuz_core/`
3. Return to `puzzle/`
4. Commit the updated submodule pointers in the outer repository

Example:

```bash
cd pzprjs
git add .
git commit -m "Update pzprjs"
git push

cd ../cspuz_core
git add .
git commit -m "Update cspuz_core"
git push

cd ..
git add pzprjs cspuz_core
git commit -m "Update submodule pointers"
git push
```

## Suggested Practical Setup

For your current state, the least disruptive path is:

1. Keep `pzprjs` and `cspuz_core` as separate repositories
2. Push code changes in each one independently
3. Treat `pzprjs/dist/` as the deployable website artifact
4. Only create an outer workspace repository if you really want one GitHub page to describe the combined project

## Current Important Files

- `pzprjs/src/variety/travelline.js`
- `pzprjs/src-ui/js/solver.js`
- `pzprjs/src-ui/p.html`
- `pzprjs/src-ui/res/p.en.json`
- `pzprjs/src-ui/res/p.ja.json`
- `cspuz_core/cspuz_solver_backend/src/lib.rs`
- `cspuz_core/cspuz_solver_backend/src/board.rs`
