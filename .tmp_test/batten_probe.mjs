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
const r = await solve("https://puzz.link/p?batten/5/5/07232g2g2g3h3");
console.log("status:", r.status);
if (r.status === "ok") {
	console.log("isUnique:", r.description.isUnique);
	const fills = r.description.data.filter(e => e.color === "green" && (typeof e.item === "string" ? e.item : e.item.kind) === "fill").map(e => [e.y, e.x]);
	const dots = r.description.data.filter(e => e.color === "green" && (typeof e.item === "string" ? e.item : e.item.kind) === "dot").map(e => [e.y, e.x]);
	console.log("fills:", JSON.stringify(fills));
	console.log("dots:", JSON.stringify(dots));
	// known answer grid (cell coords y,x): shaded rows: ".###.", "#..##", "#..#.", ".#..#", ".###."
	const exp = [
		[0,1,1,1,0],
		[1,0,0,1,1],
		[1,0,0,1,0],
		[0,1,0,0,1],
		[0,1,1,1,0],
	];
	let ok = true;
	for (let y=0;y<5;y++) for (let x=0;x<5;x++) {
		const want = exp[y][x] === 1;
		const gotFill = fills.some(e => e[0] === 2*y+1 && e[1] === 2*x+1);
		const gotDot = dots.some(e => e[0] === 2*y+1 && e[1] === 2*x+1);
		if (gotFill !== want || gotDot !== (!want)) { ok = false; console.log("MISMATCH", y, x, "want", want, "fill", gotFill, "dot", gotDot); }
	}
	console.log("matches known answer:", ok);
}
process.exit(0);
