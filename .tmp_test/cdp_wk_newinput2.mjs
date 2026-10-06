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

const id = await newPage("http://localhost:8080/p.html?windkabe/4/4");
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
await ws.eval("ui.puzzle.setMode('play'); void 0");
await new Promise((r) => setTimeout(r, 300));

const cellPos = (x, y) => ws.eval(`(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(${2 * x + 1}, ${2 * y + 1}); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()`);
async function drag(x1, y1, x2, y2, opts) {
	const P1 = JSON.parse(await cellPos(x1, y1));
	const P2 = JSON.parse(await cellPos(x2, y2));
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P1.x, y: P1.y, button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	if (opts && opts.waypoints) {
		for (const w of opts.waypoints) {
			const Pw = JSON.parse(await cellPos(w[0], w[1]));
			await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: Pw.x, y: Pw.y, button: "left", buttons: 1 });
			await new Promise((r) => setTimeout(r, 60));
		}
	}
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: P2.x, y: P2.y, button: "left", buttons: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P2.x, y: P2.y, button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}
async function click(x, y) {
	const P = JSON.parse(await cellPos(x, y));
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P.x, y: P.y, button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P.x, y: P.y, button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}
const rowState = (y) => ws.eval("(function(){ var bd = ui.puzzle.board; return [0,1,2,3].map(function(x){ return bd.getc(2*x+1," + (2 * y + 1) + ").qdir; }).join(','); })()");
const headPixel = (x, y) => ws.eval(`(async function(){
	var pc = ui.puzzle.painter;
	var svg = pc.context.child;
	var xml = new XMLSerializer().serializeToString(svg);
	var img = new Image();
	await new Promise(function(resolve, reject){ img.onload = resolve; img.onerror = reject; img.src = 'data:image/svg+xml;base64,' + btoa(xml); });
	var cv = document.createElement('canvas');
	cv.width = img.naturalWidth; cv.height = img.naturalHeight;
	var ctx = cv.getContext('2d');
	ctx.drawImage(img, 0, 0);
	var px = Math.round((${2 * x + 1}) * pc.bw + pc.x0), py = Math.round((${2 * y + 1}) * pc.bh + pc.y0);
	var d = ctx.getImageData(px + 6, py + 3, 1, 1).data;
	return d[0] + ',' + d[1] + ',' + d[2];
})()`);

// T1: 连续拖动 (0,0)->(3,0)
await drag(0, 0, 3, 0, { waypoints: [[1, 0], [2, 0]] });
console.log("posthook src:", await ws.eval("ui.puzzle.board.getc(1,1).posthook.qdir.toString()"));
console.log("T1 continuous drag:", await rowState(0), "(expect 4,4,4,4)");

// T2: 箭头头只应在链尾 (3,0)。(0,0)有徽章圆圈,(1,0)(2,0) shaft
console.log("T2 head pixels:", JSON.stringify({
	c0: await headPixel(0, 0), c1: await headPixel(1, 0),
	c2: await headPixel(2, 0), c3: await headPixel(3, 0)
}), "(expect c0-c2 white-ish, c3 green)");

// 实验: dump SVG path 元素
console.log("paths:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var ps = svg.querySelectorAll('path'); var out = []; for (var i = 0; i < ps.length; i++) { out.push({ d: (ps[i].getAttribute('d') || '').substring(0, 80), fill: ps[i].getAttribute('fill'), stroke: ps[i].getAttribute('stroke'), disp: ps[i].style.display, vis: ps[i].getAttribute('visibility') }); } return JSON.stringify(out, null, 0); })()"));
// 实验: dump 徽章 + 三角形
console.log("badges:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var ps = svg.querySelectorAll('path'); var out = []; for (var i = 0; i < ps.length; i++) { var d = ps[i].getAttribute('d') || ''; var fill = ps[i].getAttribute('fill') || ''; var disp = ps[i].style.display; if (d.indexOf('A 12.48') >= 0 || (fill.indexOf('160') >= 0 && d.indexOf('L') >= 0 && d.indexOf('z') < 0)) out.push({ d: d.substring(0, 60), fill: fill, disp: disp }); } return JSON.stringify(out); })()"));
// 实验: elements/layers 结构
console.log("elems:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var g = pc.context; var out = { elemCount: Object.keys(g.elements || {}).length, layerCount: Object.keys(g.layers || {}).length, layers: Object.keys(g.layers || {}), elemKeys: Object.keys(g.elements || {}).slice(0, 12), targetIs: g.target ? 'set' : 'null', childKids: g.child ? g.child.children.length : -1 }; return JSON.stringify(out); })()"));
// 实验: 分类统计 path
console.log("classify:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var ps = svg.querySelectorAll('path'); var tri = 0, line = 0, circle = 0, rect = 0, other = 0; for (var i = 0; i < ps.length; i++) { var d = ps[i].getAttribute('d') || ''; var pts = d.split(/[ML]/).length; if (d.indexOf('A 12.48') >= 0) circle++; else if (d.split('L').length >= 3 && d.indexOf('z') < 0) tri++; else if (d.indexOf('z') >= 0) rect++; else if (d.indexOf('L') >= 0) line++; else other++; } return JSON.stringify({ total: ps.length, tri: tri, line: line, circle: circle, rect: rect, other: other }); })()"));
// 实验: elements 映射 vs DOM
console.log("map probe:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var g = pc.context; var svg = pc.context.child; var keys = Object.keys(g.elements).filter(function(k){ return k.indexOf('c_arrow') >= 0; }); var mapped = []; for (var i = 0; i < keys.length; i++) { var el = g.elements[keys[i]]; mapped.push(keys[i] + ':' + (el ? el.getAttribute('d') || '' : 'null').substring(0, 24)); } var domPaths = svg.querySelectorAll('path'); var total = domPaths.length; return JSON.stringify({ keys: keys.length, mapped: mapped, total: total }); })()"));
// 实验: 连续 redraw 看元素增长
console.log("redraw test:", await ws.eval("(function(){ var pc = ui.puzzle.painter; var svg = pc.context.child; var countPaths = function(){ return svg.querySelectorAll('path').length; }; var a = countPaths(); ui.puzzle.redraw(); var b = countPaths(); ui.puzzle.redraw(); var c = countPaths(); ui.puzzle.redraw(); var d = countPaths(); return a + ',' + b + ',' + c + ',' + d; })()"));
// T3: 拖回缩短 (0,0)->(1,0)
await drag(0, 0, 1, 0);
console.log("T3 shrink:", await rowState(0), "(expect 4,4,0,0)");

// T4: 单击消整链 (点 (1,0))
await click(1, 0);
console.log("T4 clear chain:", await rowState(0), "(expect 0,0,0,0)");

// T5: 重新画全链, 单击链中间 (1,0) 消整链
await drag(0, 0, 3, 0, { waypoints: [[1, 0], [2, 0]] });
await click(1, 0);
console.log("T5 clear from middle:", await rowState(0), "(expect 0,0,0,0)");

// T6: 垂直拖 + 判定完整性
await drag(1, 0, 1, 3);
console.log("T6 vertical:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [0,1,2,3].map(function(y){ return bd.getc(3," + 2 + " * y + 1).qdir; }).join(','); })()"), "(expect 2,2,2,2)");
const shot = await ws.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/wk_newinput2.png", Buffer.from(shot.result.data, "base64"));
console.log("screenshot saved");
process.exit(0);
