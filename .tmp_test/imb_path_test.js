var pzpr = require("../pzprjs/dist/js/pzpr.js");

// p.html?imbalanceloop/5/5 と同等: body なしで開いて edit モード
var puzzle = new pzpr.Puzzle().open("imbalanceloop/5/5");
console.log("mode:", puzzle.mode, "editmode:", puzzle.editmode, "playeronly:", puzzle.playeronly);
puzzle.setMode("edit");
var bd = puzzle.board;
var mouse = puzzle.mouse;
var pc = puzzle.painter;
var cell = bd.getc(5, 5);

function cellState() {
	return cell.qnum + "/" + cell.qdir + "/" + cell.qans;
}

var bx = (cell.bx * pc.bw + pc.x0) / pc.bw;
var by = (cell.by * pc.bh + pc.y0) / pc.bh;
console.log("initial:", cellState());

// 完全なイベントフロー: mousedown(right) -> mouseup(right)
mouse.inputPath("right", bx, by);
console.log("after right-click (expect black  -1/0/1):", cellState());

mouse.inputPath("right", bx, by);
console.log("after right-click (expect empty -1/0/0):", cellState());

// 左クリックで数字を2にする
mouse.inputPath("left", bx, by);
mouse.inputPath("left", bx, by);
console.log("after 2x left-click (expect 2/0/0):", cellState());

// 右クリックで 2 -> 1
mouse.inputPath("right", bx, by);
console.log("after right-click (expect 1/0/0):", cellState());

// 別のマスでも黒を置けるか
var cell2 = bd.getc(7, 5);
var bx2 = (cell2.bx * pc.bw + pc.x0) / pc.bw;
var by2 = (cell2.by * pc.bh + pc.y0) / pc.bh;
mouse.inputPath("right", bx2, by2);
console.log("cell2 after right-click (expect -1/0/1):", cell2.qnum + "/" + cell2.qdir + "/" + cell2.qans);
