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
		for (var i = 0; i < blist.length; i++) if (blist[i]._solverState) withState++;
		console.log("drawSolverOverlayLines: borders", blist.length, "withState", withState);
		return origDraw.call(this);
	};
	const bd = puzzle.board;
	// h edge between (0,2)-(0,3) -> border (6,1) vertical; v edge between (2,0)-(3,0) -> border (1,4) horizontal
	const b1 = bd.getb(6, 1);
	const b2 = bd.getb(1, 4);
	b1._solverState = [{ color: "green", item: "boldWall" }];
	b2._solverState = [{ color: "green", item: "boldWall" }];
	try {
		const svg = puzzle.toBuffer("svg").toString();
		console.log("calls:", calls, "svg len:", svg.length, "has solver_line:", svg.indexOf("solver_line") >= 0);
		const idx = svg.indexOf("solver");
		if (idx >= 0) console.log(svg.slice(idx - 200, idx + 500));
	} catch (e) {
		console.log("ERR:", e.message);
	}
	process.exit(0);
});
