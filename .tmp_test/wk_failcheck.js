var assert = require("assert");
var pzpr = require("../pzprjs/dist/js/pzpr.js");

var testdata = {};
global.ui = {
	debug: {
		addDebugData: function(pid, data) {
			testdata[pid] = data;
		}
	}
};
require("../pzprjs/test/script/windkabe.js");

var puzzle = new pzpr.Puzzle();
puzzle.setConfig("forceallcell", true);
testdata.windkabe.failcheck.forEach(function(testcase, idx) {
	puzzle.open(testcase[1]);
	var failcode = puzzle.check(true);
	var failcodePassive = puzzle.check(false);
	console.log(
		"Check[" + idx + "] expected=" + testcase[0] + " got=" + failcode[0] +
		" passive=" + (!!failcodePassive[0]) + " => " +
		(failcode[0] === testcase[0] && !!failcode[0] === !!failcodePassive[0] ? "PASS" : "FAIL")
	);
	if (testcase[0] !== null) {
		assert.equal(failcode[0], testcase[0]);
	}
});
console.log("all failcheck data passed");
