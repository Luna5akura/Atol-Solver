const pzpr = require("../pzprjs/dist/js/pzpr.js");
const puzzle = new pzpr.Puzzle();
puzzle.open("http://pzv.jp/p.html?meidjuluk/6/4/3h10g50240g1h12h12i//6", function() {
	const bd = puzzle.board;
	const b = bd.getb(6, 1); // h border between (0,2)-(0,3)
	b._solverState = [{ color: "green", item: "boldWall" }];
	const svg = puzzle.toBuffer("svg").toString();
	console.log("svg length:", svg.length);
	console.log("contains solver_line:", svg.indexOf("solver_line") >= 0, "solver_peke:", svg.indexOf("solver_peke") >= 0);
	// dump a chunk around any solver id, or the tail
	const idx = svg.indexOf("solver");
	console.log(svg.slice(Math.max(0, idx - 300), idx + 400));
	process.exit(0);
});
