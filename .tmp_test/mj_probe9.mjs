const urlToFile = new URL("file://" + process.cwd() + "/pzprjs/dist/wasm/cspuz_solver_backend.js").href;
const Module = (await import(urlToFile)).default;
async function solve(puzzleUrl) {
	const mod = await Module();
	const bytes = new TextEncoder().encode(puzzleUrl);
	const len = bytes.length;
	const ptr = mod._prepare_input_buffer(len);
	mod.HEAPU8.set(bytes, ptr);
	const outPtr = mod._solve_problem(ptr, len);
	const outLen = mod.HEAPU8[outPtr] | (mod.HEAPU8[outPtr + 1] << 8) | (mod.HEAPU8[outPtr + 2] << 16) | (mod.HEAPU8[outPtr + 3] << 24);
	return JSON.parse(new TextDecoder().decode(mod.HEAPU8.subarray(outPtr + 4, outPtr + 4 + outLen)));
}
const r = await solve("https://puzz.link/p?meidjuluk/6/4/3h10g50240g1h12h12i//6");
console.log("status:", r.status, "isUnique:", r.description.isUnique, "entries:", r.description.data.length);
for (const e of r.description.data) console.log(JSON.stringify(e));
process.exit(0);
