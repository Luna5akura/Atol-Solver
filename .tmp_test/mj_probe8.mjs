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
console.log("status:", r.status, "isUnique:", r.description.isUnique);
const walls = r.description.data.filter(e => e.color === "green" && e.item && e.item.kind === "boldWall");
const crosses = r.description.data.filter(e => e.color === "green" && e.item && e.item.kind === "cross");
console.log("boldWalls:", JSON.stringify(walls));
console.log("crosses count:", crosses.length);
// expected walls (h: y=2y+1,x=2x+2; v: y=2y+2,x=2x+1)
const expH = [[0,0,1,0,0],[0,0,0,0,0],[0,0,1,1,0],[1,0,1,1,0]];
const expV = [[1,0,1,1,0,0],[0,0,1,0,0,0],[0,1,1,0,0,0]];
let ok = true, wrong = [];
for (let y=0;y<4;y++) for (let x=0;x<5;x++) {
	const want = expH[y][x] === 1;
	const got = walls.some(e => e.y === 2*y+1 && e.x === 2*x+2);
	if (want !== got) { ok = false; wrong.push("h "+y+","+x+" want "+want); }
}
for (let y=0;y<3;y++) for (let x=0;x<6;x++) {
	const want = expV[y][x] === 1;
	const got = walls.some(e => e.y === 2*y+2 && e.x === 2*x+1);
	if (want !== got) { ok = false; wrong.push("v "+y+","+x+" want "+want); }
}
console.log("walls match known answer:", ok, wrong.length ? JSON.stringify(wrong) : "");
// crosses must be exactly on the open dotted edges (non-shaded-adjacent) and nowhere on shaded borders
const shaded = [[0,0,0,0,1,0],[0,1,0,0,1,0],[0,0,0,0,0,0],[0,0,0,0,0,0]];
let crossOk = true;
for (const c of crosses) {
	// virtual -> cell coords: h border (y odd, x even) -> cells (y-1)/2, x/2-1 .. x/2
	if (c.y % 2 === 1) {
		const cy = (c.y-1)/2, cx = c.x/2 - 1;
		if (shaded[cy][cx] || shaded[cy][cx+1]) { crossOk = false; console.log("cross on shaded-adjacent border", JSON.stringify(c)); }
		if (expH[cy][cx] === 1) { crossOk = false; console.log("cross where wall expected", JSON.stringify(c)); }
	} else {
		const cy = c.y/2 - 1, cx = (c.x-1)/2;
		if (shaded[cy][cx] || shaded[cy+1][cx]) { crossOk = false; console.log("cross on shaded-adjacent border", JSON.stringify(c)); }
		if (expV[cy][cx] === 1) { crossOk = false; console.log("cross where wall expected", JSON.stringify(c)); }
	}
}
console.log("crosses valid:", crossOk);
process.exit(0);
