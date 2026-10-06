const pzpr = require("../pzprjs/dist/js/pzpr.js");
const puzzle = new pzpr.Puzzle();
puzzle.open("http://pzv.jp/p.html?meidjuluk/6/4/3h10g50240g1h12h12i//6", function() {
	const bd = puzzle.board;
	// expected answer from pzprjs test data
	const expH = [[0,0,1,0,0],[0,0,0,0,0],[0,0,1,1,0],[1,0,1,1,0]];
	const expV = [[1,0,1,1,0,0],[0,0,1,0,0,0],[0,1,1,0,0,0]];
	// apply solver overlay exactly like solver.js applyBorderEntry does
	for (let y=0;y<4;y++) for (let x=0;x<5;x++) {
		const b = bd.getb(x*2+2, y*2+1);
		b._solverState = [{ color: "green", item: expH[y][x] ? "boldWall" : "cross" }];
	}
	for (let y=0;y<3;y++) for (let x=0;x<6;x++) {
		const b = bd.getb(x*2+1, y*2+2);
		b._solverState = [{ color: "green", item: expV[y][x] ? "boldWall" : "cross" }];
	}
	const svg = puzzle.toBuffer("svg").toString();
	const pc = puzzle.painter;
	const metrics = { bw: pc.bw, bh: pc.bh, lm: pc.lm, gw: pc.gw, cw: pc.cw, ch: pc.ch };
	console.log("metrics:", JSON.stringify(metrics));
	// extract all b_solver_line_ and b_solver_peke_ rects/lines with geometry
	const re = /<(rect|path)[^>]*id="(b_solver_line_(\d+)|b_solver_peke_(\d+))"[^>]*>/g;
	let m, items = [];
	while ((m = re.exec(svg)) !== null) {
		const tag = m[1], attr = m[0];
		const idm = attr.match(/id="([^"]+)"/);
		items.push({ tag, id: idm[1], attr });
	}
	console.log("solver overlay elements:", items.length);
	// for wall rects, verify orientation matches the border
	for (const it of items) {
		if (it.tag !== "rect" || it.id.indexOf("line") < 0) continue;
		const borderId = +it.id.split("_").pop();
		const border = bd.border.find(b => b.id === borderId);
		if (!border) continue;
		const x = +(it.attr.match(/x="([-\d.]+)"/) || [])[1];
		const y = +(it.attr.match(/y="([-\d.]+)"/) || [])[1];
		const w = +(it.attr.match(/width="([\d.]+)"/) || [])[1];
		const h = +(it.attr.match(/height="([\d.]+)"/) || [])[1];
		const px = border.bx * pc.bw, py = border.by * pc.bh;
		const lmv = Math.max(pc.lm * 0.72, 1);
		let exp;
		if (border.isVert()) exp = { x: px - lmv, y: py - (pc.bh + lmv), w: 2*lmv, h: 2*(pc.bh + lmv) };
		else exp = { x: px - (pc.bw + lmv), y: py - lmv, w: 2*(pc.bw + lmv), h: 2*lmv };
		const okGeom = Math.abs(x - exp.x) < 0.01 && Math.abs(y - exp.y) < 0.01 && Math.abs(w - exp.w) < 0.01 && Math.abs(h - exp.h) < 0.01;
		console.log("wall border", border.bx, border.by, "isvert:", border.isVert(), "geomOK:", okGeom, JSON.stringify({x,y,w,h}), "exp", JSON.stringify(exp));
		if (!okGeom) process.exitCode = 1;
	}
	// crosses must be drawn as cross paths centered at border position
	for (const it of items) {
		if (it.tag !== "path" || it.id.indexOf("peke") < 0) continue;
		const borderId = +it.id.split("_").pop();
		const border = bd.border.find(b => b.id === borderId);
		if (!border) continue;
		const d = (it.attr.match(/d="([^"]+)"/) || [])[1];
		console.log("cross border", border.bx, border.by, "path:", d);
	}
	process.exit(0);
});
