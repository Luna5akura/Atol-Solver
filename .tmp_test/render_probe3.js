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
		console.log("drawSolverOverlayLines: borders", blist.length, "withState", withState, "outputImage", this.outputImage);
		return origDraw.call(this);
	};
	const bd = puzzle.board;
	console.log("board cols:", bd.cols, "border count:", bd.border.length);
	const b = bd.getb(6, 1);
	console.log("getb(6,1):", !!b, "isnull:", b.isnull, "isvert:", b.isVert());
	b._solverState = [{ color: "green", item: "boldWall" }];
	const svg = puzzle.toBuffer("svg").toString();
	console.log("calls:", calls, "svg len:", svg.length, "has solver_line:", svg.indexOf("solver_line") >= 0);
	process.exit(0);
});
