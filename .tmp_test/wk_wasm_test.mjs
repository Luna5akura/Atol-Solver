import fs from "fs";

const buf = fs.readFileSync("pzprjs/dist/wasm/cspuz_solver_backend.js", "utf8");
// ESM import of the wasm glue
const urlToFile = new URL("file://" + process.cwd() + "/pzprjs/dist/wasm/cspuz_solver_backend.js").href;
const Module = (await import(urlToFile)).default;

async function solve(puzzleUrl) {
	const mod = await Module();
	const bytes = new TextEncoder().encode(puzzleUrl);
	const len = bytes.length;
	const ptr = mod._prepare_input_buffer(len);
	mod.HEAPU8.set(bytes, ptr);
	const outPtr = mod._solve_problem(ptr, len);
	// 返回指针: 前 4 字节小端长度, 后面 JSON
	const outLen = mod.HEAPU8[outPtr] | (mod.HEAPU8[outPtr + 1] << 8) | (mod.HEAPU8[outPtr + 2] << 16) | (mod.HEAPU8[outPtr + 3] << 24);
	const json = new TextDecoder().decode(mod.HEAPU8.subarray(outPtr + 4, outPtr + 4 + outLen));
	return JSON.parse(json);
}

// 唯一解盘面: 3x3, (0,1)=1
const r1 = await solve("https://puzz.link/p?windkabe/3/3/a01g");
console.log("status:", r1.status);
if (r1.status === "ok") {
	console.log("full:", JSON.stringify(r1));
	console.log("arrows:", JSON.stringify(r1.description.arrows));
	console.log("fills:", JSON.stringify(r1.description.fills));
	console.log("numbers:", JSON.stringify(r1.description.numbers));
}

// 无解盘面: 3x3 全空白 + 中心 1 (检验约束正确性)
const r2 = await solve("https://puzz.link/p?windkabe/3/3/01h");
console.log("nosol status:", r2.status);
process.exit(0);
