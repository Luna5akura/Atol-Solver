var assert = require("assert");
var pzpr = require("../pzprjs/dist/js/pzpr.js");

function playPuzzle(url) {
	var puzzle = new pzpr.Puzzle().open(url || "hexmasyu/5/5");
	puzzle.setMode("play");
	puzzle.mouse.setInputMode("line");
	puzzle
	return puzzle;
}

function drawLine(puzzle, x1, y1, x2, y2) {
	var bd = puzzle.board;
	var c1 = bd.getHexCell(x1, y1),
		c2 = bd.getHexCell(x2, y2);
	var edge = bd.getHexEdgeByDir(c1, bd.getHexDirBetween(c1, c2));
	assert.ok(edge, "edge (" + x1 + "," + y1 + ")-(" + x2 + "," + y2 + ")");
	edge.setLine();
	return edge;
}

function state(bd, x, y) {
	var c = bd.getHexCell(x, y);
	return c.lcnt + "/" + c.isHexLineStraight() + "/" + c.isHexLineTurn();
}

function singleCheck(puzzle, fn) {
	var checker = puzzle.checker;
	checker.resetCache();
	var ans = puzzle.checker.answer; // anscheck 对象
	// 直接调用 AnsCheck 函数
	fn(ans);
	return ans.failcode[0];
}

// ===== 场景 A: 白丸直进 + 两侧邻格都直进 -> mashuWStNbr =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(1);
	drawLine(puzzle, 0, 2, 1, 2);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 3, 2);
	drawLine(puzzle, 3, 2, 4, 2);
	console.log("A cells:", state(bd, 1, 2), state(bd, 2, 2), state(bd, 3, 2));
	var r = puzzle.check(true);
	console.log("A all failcodes (expect contains mashuWStNbr):", JSON.stringify(r));
}

// ===== 场景 B: 白丸直进 + 一侧转弯 -> 不报 =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(1);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 3, 2);
	drawLine(puzzle, 3, 2, 4, 2);
	drawLine(puzzle, 1, 2, 1, 3); // (1,2) 转弯 (L + BL)
	console.log("B cells:", state(bd, 1, 2), state(bd, 2, 2), state(bd, 3, 2));
	var r = puzzle.check(true);
	console.log("B all failcodes (expect NO mashuWStNbr):", JSON.stringify(r));
}

// ===== 场景 C: 黑丸转弯 + 两侧邻格都直进 -> 不报 =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(2);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 2, 3);
	drawLine(puzzle, 0, 2, 1, 2);
	drawLine(puzzle, 2, 3, 2, 4);
	console.log("C cells:", state(bd, 1, 2), state(bd, 2, 2), state(bd, 2, 3));
	var r = puzzle.check(true);
	console.log("C all failcodes (expect NO mashuBCvNbr):", JSON.stringify(r));
}

// ===== 场景 D: 黑丸转弯 + 一侧邻格转弯 -> mashuBCvNbr =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(2);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 2, 3);
	drawLine(puzzle, 0, 2, 1, 2);
	drawLine(puzzle, 2, 3, 3, 3); // (2,3) 转弯 (BL + BR)
	console.log("D cells:", state(bd, 1, 2), state(bd, 2, 2), state(bd, 2, 3), state(bd, 3, 3));
	var r = puzzle.check(true);
	console.log("D all failcodes (expect contains mashuBCvNbr):", JSON.stringify(r));
}

// ===== 场景 E: 白丸转弯 -> mashuWCurve (现有测试已覆盖, 单测确认) =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(1);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 2, 3);
	console.log("E cells:", state(bd, 2, 2));
	var r = puzzle.check(true);
	console.log("E all failcodes (expect contains mashuWCurve):", JSON.stringify(r));
}

// ===== 场景 F: 黑丸直进 -> mashuBStrig =====
{
	var puzzle = playPuzzle();
	var bd = puzzle.board;
	bd.getHexCell(2, 2).setQnum(2);
	drawLine(puzzle, 1, 2, 2, 2);
	drawLine(puzzle, 2, 2, 3, 2);
	console.log("F cells:", state(bd, 2, 2));
	var r = puzzle.check(true);
	console.log("F all failcodes (expect contains mashuBStrig):", JSON.stringify(r));
}
