import http from "http";
import crypto from "crypto";
import fs from "fs";
function wsConnect(port, path) {
	return new Promise((resolve, reject) => {
		const key = crypto.randomBytes(16).toString("base64");
		const req = http.request({ port, path, host: "127.0.0.1", headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" } });
		req.on("error", reject);
		req.end();
		req.on("upgrade", (res, socket) => {
			const pending = {}; let nextId = 1, buf = Buffer.alloc(0);
			const logs = [];
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
						else if (msg.method === "Runtime.consoleAPICalled" && msg.params && msg.params.args) {
							logs.push(msg.params.args.map((a) => a.value !== undefined ? a.value : (a.description || "")).join(" "));
						}
					}
				}
			});
			socket.on("error", reject);
			resolve({
				logs,
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
					send({ id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } });
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

async function click(ws, btn, x, y) {
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: btn, buttons: btn === "left" ? 1 : 2, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 70));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: btn, buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 200));
}

const id = await newPage("http://localhost:8080/p.html?windkabe/3/3/a01g");
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
await ws.raw("Runtime.enable", {});
await ws.raw("Page.reload", { ignoreCache: true });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'windkabe' && ui.puzzle.board.cols === 3) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready, "version:", await ws.eval("pzpr.version"));
console.log("state:", await ws.eval("(function(){ var p = ui.puzzle; return 'mode=' + p.mode + ' edit=' + p.editmode + ' play=' + p.playmode; })()"));

// 切到 play 模式
await ws.eval("ui.puzzle.playeronly = false; ui.puzzle.setMode('play'); void 0");
await new Promise((r) => setTimeout(r, 300));
console.log("after setMode play:", await ws.eval("(function(){ return 'edit=' + ui.puzzle.editmode + ' play=' + ui.puzzle.playmode + ' inputMode=' + ui.puzzle.mouse.inputMode; })()"));

// 箭头操作: 从箭头放置格 (1,1) 向下拖到 (2,1) -> 下箭头 (fourwinds penpuz 方式)
const A = JSON.parse(await ws.eval("(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(3, 3); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()"));
const B = JSON.parse(await ws.eval("(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(3, 5); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()"));
console.log("drag from", A.x, A.y, "to", B.x, B.y);
await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: A.x, y: A.y, button: "left", buttons: 1, clickCount: 1 });
await new Promise((r) => setTimeout(r, 80));
await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: B.x, y: B.y, button: "left", buttons: 1 });
await new Promise((r) => setTimeout(r, 80));
await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: B.x, y: B.y, button: "left", buttons: 0, clickCount: 1 });
await new Promise((r) => setTimeout(r, 300));

console.log("after drag:", await ws.eval("(function(){ var c = ui.puzzle.board.getc(3, 3); return 'qdir=' + c.qdir + ' (expect 2=down) qnum=' + c.qnum; })()"));

// 自动黑格渲染检查: 读取 canvas 像素 (0,0) 应该是黑
console.log("pixel:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var canvas = pc.context.child; var ctx = pc.context; var c = ui.puzzle.board.getc(1, 1); var px = Math.round(c.bx * pc.bw + pc.x0), py = Math.round(c.by * pc.bh + pc.y0); var d = ctx.getImageData ? null : null; return 'px=' + px + ' py=' + py; })()"));

// 判定
console.log("check:", await ws.eval("(function(){ var r = ui.puzzle.check(); return 'complete=' + r.complete + ' len=' + r.length + ' fail0=' + r[0]; })()"));

// 黑格渲染: 查 SVG fill 元素 (黑格 = c_fullb 层的黑色 fill)
console.log("bg cells:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var els = svg.querySelectorAll('[id*=c_fullb]'); var out = []; for (var i = 0; i < els.length; i++) { var f = els[i].getAttribute('fill'); if (f && f !== 'none') out.push(els[i].id.replace('c_fullb_','') + ':' + f); } return out.length ? out.join(' | ') : 'NONE'; })()"));

// 截图
const shot = await ws.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/windkabe_solved.png", Buffer.from(shot.result.data, "base64"));
console.log("screenshot saved /tmp/windkabe_solved.png");

// solver 按钮测试 (isLinePuzzle 不需要, 但 windkabe 需要 solver 按钮可见性)
console.log("solver button:", await ws.eval("(function(){ var b = document.querySelector('#btnsolve') || document.querySelector('[data-buttonExec=solve]') || document.querySelector('.solve'); return b ? 'found' : 'checking btnarea'; })()"));
console.log(await ws.eval("(function(){ var el = document.getElementById('btnarea'); return el ? el.innerHTML.match(/solve[^<]*<|/i) ? el.innerHTML.substring(0, 600) : 'no solve in btnarea' : 'no btnarea'; })()"));
// SVG 结构 dump
console.log("svg ids:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var els = svg.querySelectorAll('[id]'); var out = []; for (var i = 0; i < els.length; i++) { if (i < 40) out.push(els[i].id); } return out.join(','); })()"));
console.log("getBGCellColor overridden:", await ws.eval("ui.puzzle.painter.getBGCellColor !== pzpr.common.Graphic.prototype.getBGCellColor"));
console.log("getBGCellColor src:", await ws.eval("ui.puzzle.painter.getBGCellColor.toString().substring(0, 160)"));
// solver 面板
console.log("solverpanel:", await ws.eval("(function(){ var el = document.getElementById('solverpanel'); if (!el) return 'missing'; var r = el.getBoundingClientRect(); return JSON.stringify({ display: getComputedStyle(el).display, x: r.x, y: r.y, w: r.width, h: r.height }); })()"));
const S = JSON.parse(await ws.eval("(function(){ var el = document.getElementById('solver-run'); if (!el) return '{}'; var r = el.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.disabled, text: el.textContent }); })()"));
console.log("solver-run btn:", JSON.stringify(S));
if (S.x) {
	await click(ws, "left", S.x, S.y);
	await new Promise((r) => setTimeout(r, 4000));
	console.log("solver status:", await ws.eval("(function(){ var el = document.getElementById('solver-status'); return el ? el.textContent : 'no status el'; })()"));
	console.log("solver overlay:", await ws.eval("(function(){ var p = ui.puzzle; var bd = p.board; var c = bd.getc(3, 3); return 'qdir=' + c.qdir; })()"));
	const shot2 = await ws.raw("Page.captureScreenshot", { format: "png" });
	fs.writeFileSync("/tmp/windkabe_solver.png", Buffer.from(shot2.result.data, "base64"));
	console.log("solver screenshot saved");
}
process.exit(0);
