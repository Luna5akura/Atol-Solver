import http from "http";
import crypto from "crypto";
function wsConnect(port, path) {
	return new Promise((resolve, reject) => {
		const key = crypto.randomBytes(16).toString("base64");
		const req = http.request({ port, path, host: "127.0.0.1", headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" } });
		req.on("error", reject);
		req.end();
		req.on("upgrade", (res, socket) => {
			const pending = {}; let nextId = 1, buf = Buffer.alloc(0);
			const send = (obj) => {
				const payload = Buffer.from(JSON.stringify(obj), "utf8");
				const len = payload.length; let frame;
				if (len < 126) { frame = Buffer.alloc(2 + len + 4); frame[0] = 0x81; frame[1] = 0x80 | len; payload.copy(frame, 2); }
				else { frame = Buffer.alloc(4 + len + 4); frame[0] = 0x81; frame[1] = 0x80 | 126; frame.writeUInt16BE(len, 2); payload.copy(frame, 4); }
				const mask = crypto.randomBytes(4);
				const start = frame.length - len - 4;
				for (let i = 0; i < len; i++) frame[start + 4 + i] = payload[i] ^ mask[i & 3];
				mask.copy(frame, start);
				socket.write(frame);
			};
			socket.on("data", (d) => {
				buf = Buffer.concat([buf, d]);
				while (buf.length >= 2) {
					const op = buf[0] & 0x0f, masked = buf[1] & 0x80, ln = buf[1] & 0x7f;
					let off = 2, len = ln;
					if (ln === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
					else if (ln === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
					let mkey = null;
					if (masked) { if (buf.length < off + 4) break; mkey = buf.slice(off, off + 4); off += 4; }
					if (buf.length < off + len) break;
					let payload = buf.slice(off, off + len);
					if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mkey[i & 3];
					buf = buf.slice(off + len);
					if (op === 0x1) {
						const msg = JSON.parse(payload.toString("utf8"));
						if (msg.id !== undefined && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
					}
				}
			});
			socket.on("error", reject);
			resolve({
				raw: (method, params, to) => new Promise((res, rej) => {
					const id = nextId++;
					const timer = setTimeout(() => { delete pending[id]; rej(new Error(method + " timeout")); }, to || 15000);
					pending[id] = (msg) => { clearTimeout(timer); res(msg); };
					send({ id, method, params });
				}),
				eval: (expr, to) => new Promise((res, rej) => {
					const id = nextId++;
					const timer = setTimeout(() => { delete pending[id]; rej(new Error("eval timeout")); }, to || 15000);
					pending[id] = (msg) => {
						clearTimeout(timer);
						if (msg.result && msg.result.exceptionDetails) res("EXC: " + (msg.result.exceptionDetails.exception && msg.result.exceptionDetails.exception.description || ""));
						else if (msg.result && msg.result.result) res(msg.result.result.value);
						else res("RAW: " + JSON.stringify(msg));
					};
					send({ id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } });
				})
			});
		});
	});
}

async function newPage(url) {
	const res = await new Promise((resolve, reject) => {
		const req = http.request({ method: "PUT", port: 9222, path: "/json/new?" + encodeURIComponent(url), host: "127.0.0.1" }, (r) => {
			let d = "";
			r.on("data", (c) => (d += c));
			r.on("end", () => resolve(JSON.parse(d)));
		});
		req.on("error", reject);
		req.end();
	});
	return res.id;
}

const id = await newPage("http://localhost:8080/p.html?windkabe/4/4/00k01d02m03c");
const pages = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9222/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page = pages.find((p) => p.id === id);
const ws = await wsConnect(9222, page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));
await ws.raw("Page.enable", {});
await ws.raw("Page.reload", { ignoreCache: true });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'windkabe' && ui.puzzle.board.cols === 4) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready, "version:", await ws.eval("pzpr.version"));
console.log("clues:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(1,1).qnum, bd.getc(3,3).qnum, bd.getc(5,5).qnum, bd.getc(7,7).qnum].join(','); })()"), "(expect 0,1,2,3 diagonal)");
console.log("state:", await ws.eval("(function(){ return 'edit=' + ui.puzzle.editmode + ' play=' + ui.puzzle.playmode; })()"));
await ws.eval("ui.puzzle.setMode('play'); void 0");
await new Promise((r) => setTimeout(r, 300));

const cellPos = (x, y) => ws.eval(`(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(${2 * x + 1}, ${2 * y + 1}); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()`);
async function drag(x1, y1, x2, y2) {
	const P1 = JSON.parse(await cellPos(x1, y1));
	const P2 = JSON.parse(await cellPos(x2, y2));
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P1.x, y: P1.y, button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: P2.x, y: P2.y, button: "left", buttons: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P2.x, y: P2.y, button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}

// T1: 从数字格 (1,1)=1 向下拖到 (1,2): 线段 = (1,2) 一格
await drag(1, 1, 1, 2);
console.log("T1 from clue down 1:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(3,3).qdir, bd.getc(3,5).qdir].join(','); })()"), "(expect 0,2)");

// T2: 从数字格 (1,1)=1 向下拖到 (1,3): 线段 = (1,2),(1,3) 两格
await drag(1, 1, 1, 3);
console.log("T2 from clue down 2:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(3,3).qdir, bd.getc(3,5).qdir, bd.getc(3,7).qdir].join(','); })()"), "(expect 0,2,2)");

// T3: 缩短: 拖回 (1,2)
await drag(1, 1, 1, 2);
console.log("T3 shrink to 1:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(3,5).qdir, bd.getc(3,7).qdir].join(','); })()"), "(expect 2,0)");

// T4: 徽章数字检查: 数字格起拖的链, 徽章应显示在链起点 (1,2)
console.log("T4 badge/text leak:", await ws.eval("(function(){ var svg = ui.puzzle.painter.context.child; var texts = svg.querySelectorAll('text'); var a = texts.length; ui.puzzle.redraw(); ui.puzzle.redraw(); var b = svg.querySelectorAll('text').length; var txts = []; for (var i = 0; i < texts.length; i++) { txts.push(texts[i].textContent); } return JSON.stringify({ count: a + '->' + b, contents: txts }); })()"), "(expect stable, content ['2'])");

// T5: 清除线段后徽章消失
await ws.eval("(function(){ ui.puzzle.mouse.inputPoint.init(3, 5); ui.puzzle.mouse.mouseCell = null; ui.puzzle.mouse.arrowStartCell = null; })()");
await drag(1, 2, 1, 2); // 无效 drag
const P = JSON.parse(await cellPos(1, 2));
await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P.x, y: P.y, button: "left", buttons: 1, clickCount: 1 });
await new Promise((r) => setTimeout(r, 60));
await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P.x, y: P.y, button: "left", buttons: 0, clickCount: 1 });
await new Promise((r) => setTimeout(r, 250));
console.log("T5 after clear:", await ws.eval("(function(){ var bd = ui.puzzle.board; var svg = ui.puzzle.painter.context.child; var texts = svg.querySelectorAll('text'); var vis = []; for (var i = 0; i < texts.length; i++) { var d = texts[i].getAttribute('display'); if (d !== 'none') vis.push(texts[i].textContent + '(attr=' + d + ')'); } return bd.getc(3,5).qdir + ' badgeTexts:' + JSON.stringify(vis); })()"), "(expect 0 badgeTexts:[])");
process.exit(0);
