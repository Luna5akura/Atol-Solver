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
// shaded cells (0-based): (0,4),(1,1),(1,4)
const shaded = new Set(["0,4","1,1","1,4"]);
const expH = [[0,0,1,0,0],[0,0,0,0,0],[0,0,1,1,0],[1,0,1,1,0]];
const expV = [[1,0,1,1,0,0],[0,0,1,0,0,0],[0,1,1,0,0,0]];
let ok = true;
for (let y=0;y<4;y++) for (let x=0;x<5;x++) {
	const skip = shaded.has(y+","+x) || shaded.has(y+","+(x+1));
	if (skip) continue;
	const want = expH[y][x] === 1 ? "boldWall" : "cross";
	const got = r.description.data.find(e => e.y === 2*y+1 && e.x === 2*x+2 && e.color === "green");
	if (!got || got.item !== want) { ok = false; console.log("MISMATCH h", y, x, "want", want, "got", got && got.item); }
}
for (let y=0;y<3;y++) for (let x=0;x<6;x++) {
	const skip = shaded.has(y+","+x) || shaded.has((y+1)+","+x);
	if (skip) continue;
	const want = expV[y][x] === 1 ? "boldWall" : "cross";
	const got = r.description.data.find(e => e.y === 2*y+2 && e.x === 2*x+1 && e.color === "green");
	if (!got || got.item !== want) { ok = false; console.log("MISMATCH v", y, x, "want", want, "got", got && got.item); }
}
console.log("4x6 full partition (walls+crosses) matches known answer:", ok);
// no overlay at all on shaded-adjacent borders
for (const e of r.description.data) {
	if (e.color !== "green") continue;
	let cells = [];
	if (e.y % 2 === 1) cells = [(e.y-1)/2, e.x/2 - 1, (e.y-1)/2, e.x/2];
	else cells = [e.y/2 - 1, (e.x-1)/2, e.y/2, (e.x-1)/2];
	if (shaded.has(cells[0]+","+cells[1]) || shaded.has(cells[2]+","+cells[3])) { ok = false; console.log("overlay on shaded-adjacent border", JSON.stringify(e)); }
}
console.log("no overlay on shaded borders:", ok);
process.exit(0);
