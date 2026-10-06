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
console.log("ready:", ready);
await ws.eval("ui.puzzle.setMode('play'); void 0");
await new Promise((r) => setTimeout(r, 300));

async function dragCell(x1, y1, x2, y2, btn) {
	const c1 = await ws.eval(`(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(${2 * x1 + 1}, ${2 * y1 + 1}); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()`);
	const P1 = JSON.parse(c1);
	const c2 = await ws.eval(`(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(${2 * x2 + 1}, ${2 * y2 + 1}); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()`);
	const P2 = JSON.parse(c2);
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P1.x, y: P1.y, button: btn, buttons: btn === "left" ? 1 : 2, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: P2.x, y: P2.y, button: btn, buttons: btn === "left" ? 1 : 2 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P2.x, y: P2.y, button: btn, buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}

async function shot(name) {
	const r = await ws.raw("Page.captureScreenshot", { format: "png" });
	fs.writeFileSync("/tmp/" + name, Buffer.from(r.result.data, "base64"));
}

// 旧 penpuz 输入: 从 (0,0) 向右拖一格 -> (0,0) 右箭头
await dragCell(0, 0, 1, 0, "left");
console.log("state1:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(1,1).qdir, bd.getc(3,1).qdir, bd.getc(5,1).qdir].join(','); })()"));
// 从 (1,0) 向右拖 -> (1,0) 右箭头 (链: (0,0)->(1,0), (1,0) 为链尾画头)
await dragCell(1, 0, 2, 0, "left");
console.log("state2:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(1,1).qdir, bd.getc(3,1).qdir, bd.getc(5,1).qdir].join(','); })()"));
await shot("wk_head_before.png");
// 从 (2,0) 向右拖 -> (2,0) 右箭头 (链变长, (1,0) 应从头变 shaft)
await dragCell(2, 0, 3, 0, "left");
console.log("state3:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(1,1).qdir, bd.getc(3,1).qdir, bd.getc(5,1).qdir].join(','); })()"));
await shot("wk_head_after.png");
// 像素检查: (1,0) 格 (bx=3,by=1) 的箭头头三角形区域
console.log(await ws.eval(`(async function(){
	var pc = ui.puzzle.painter;
	var svg = pc.context.child;
	var xml = new XMLSerializer().serializeToString(svg);
	var img = new Image();
	await new Promise(function(resolve, reject){ img.onload = resolve; img.onerror = reject; img.src = 'data:image/svg+xml;base64,' + btoa(xml); });
	var cv = document.createElement('canvas');
	cv.width = img.naturalWidth; cv.height = img.naturalHeight;
	var ctx = cv.getContext('2d');
	ctx.drawImage(img, 0, 0);
	var apex = pc.cw * 0.33;
	function sample(bx, by, label) {
		var px = Math.round(bx * pc.bw + pc.x0), py = Math.round(by * pc.bh + pc.y0);
		var pts = {};
		pts[label + '_shaft'] = Array.from(ctx.getImageData(px, py, 1, 1).data);
		pts[label + '_headArea'] = Array.from(ctx.getImageData(Math.round(px + apex * 0.8), py, 1, 1).data);
		return pts;
	}
	var out = {};
	out.shaftCell = sample(3, 1, 'c10');   // (1,0) 应为 shaft: headArea 应为白色(无箭头头)
	out.headCell = sample(5, 1, 'c20');    // (2,0) 链尾: headArea 应有绿色箭头头
	return JSON.stringify(out);
})()`));
console.log("done");
process.exit(0);
