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
// 4x6: full partition check
let r = await solve("https://puzz.link/p?meidjuluk/6/4/3h10g50240g1h12h12i//6");
const expH = [[0,0,1,0,0],[0,0,0,0,0],[0,0,1,1,0],[1,0,1,1,0]];
const expV = [[1,0,1,1,0,0],[0,0,1,0,0,0],[0,1,1,0,0,0]];
let ok = true;
for (let y=0;y<4;y++) for (let x=0;x<5;x++) {
	const want = expH[y][x] === 1 ? "boldWall" : "cross";
	const got = r.description.data.find(e => e.y === 2*y+1 && e.x === 2*x+2 && e.color === "green");
	if (!got || got.item !== want) { ok = false; console.log("MISMATCH h", y, x, "want", want, "got", got && got.item); }
}
for (let y=0;y<3;y++) for (let x=0;x<6;x++) {
	const want = expV[y][x] === 1 ? "boldWall" : "cross";
	const got = r.description.data.find(e => e.y === 2*y+2 && e.x === 2*x+1 && e.color === "green");
	if (!got || got.item !== want) { ok = false; console.log("MISMATCH v", y, x, "want", want, "got", got && got.item); }
}
console.log("4x6 full partition (walls+crosses) matches known answer:", ok);

// 7x7 multi-solution: walls only (must-lines), no Line kind
r = await solve("https://puzz.link/p?meidjuluk/7/7/1h3h9g1i7i105h2g010g3h401i6g3g1g8h2h1//i");
const kinds = [...new Set(r.description.data.filter(e => e.color === "green").map(e => e.item))];
console.log("7x7 status:", r.status, "isUnique:", r.description.isUnique, "green kinds:", JSON.stringify(kinds));
console.log("7x7 walls:", JSON.stringify(r.description.data.filter(e => e.color === "green" && e.item === "boldWall")));
process.exit(0);
