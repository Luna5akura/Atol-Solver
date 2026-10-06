const pzpr = require("../pzprjs/dist/js/pzpr.js");
const puzzle = new pzpr.Puzzle();
puzzle.open("http://pzv.jp/p.html?meidjuluk/6/4/3h10g50240g1h12h12i//6", function() {
	const bd = puzzle.board;
	const b1 = bd.getb(6, 1);
	const b2 = bd.getb(1, 4);
	b1._solverState = [{ color: "green", item: "boldWall" }];
	b2._solverState = [{ color: "green", item: "boldWall" }];
	const svg = puzzle.toBuffer("svg").toString();
	console.log(svg.slice(svg.length - 1200));
	process.exit(0);
});
