const pzpr = require("../pzprjs/dist/js/pzpr.js");
const puzzle = new pzpr.Puzzle();
puzzle.open("http://pzv.jp/p.html?meidjuluk/6/4/3h10g50240g1h12h12i//6", function() {
	const G = puzzle.klass.Graphic;
	const origDraw = G.prototype.drawSolverOverlayLines;
	let calls = 0;
	G.prototype.drawSolverOverlayLines = function() {
		calls++;
		const blist = this.range.borders;
		let withState = 0;
		for (const b of blist) if (b._solverState) withState++;
		console.log("drawSolverOverlayLines: borders", blist.length, "withState", withState);
		return origDraw.call(this);
	};
	const bd = puzzle.board;
	const b = bd.getb(6, 1);
	b._solverState = [{ color: "green", item: "boldWall" }];
	try {
		const svg = puzzle.toBuffer("svg").toString();
		console.log("calls:", calls, "svg len:", svg.length, "has solver_line:", svg.indexOf("solver_line") >= 0);
		const idx = svg.indexOf("solver");
		if (idx >= 0) console.log(svg.slice(idx - 200, idx + 300));
	} catch (e) {
		console.log("ERR:", e.message);
	}
	process.exit(0);
});
