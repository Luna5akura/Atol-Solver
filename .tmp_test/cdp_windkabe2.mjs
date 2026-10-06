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

async function pixelAt(ws, bx, by) {
	return ws.eval(`(async function(){
		var pc = ui.puzzle.painter;
		var svg = pc.context.child;
		var xml = new XMLSerializer().serializeToString(svg);
		var img = new Image();
		await new Promise(function(resolve, reject) {
			img.onload = resolve;
			img.onerror = reject;
			img.src = 'data:image/svg+xml;base64,' + btoa(xml);
		});
		var cv = document.createElement('canvas');
		cv.width = img.naturalWidth; cv.height = img.naturalHeight;
		var ctx = cv.getContext('2d');
		ctx.drawImage(img, 0, 0);
		var px = Math.round(${bx} * pc.bw + pc.x0), py = Math.round(${by} * pc.bh + pc.y0);
		var d = ctx.getImageData(px, py, 1, 1).data;
		return d[0] + ',' + d[1] + ',' + d[2];
	})()`);
}

// 1) 空白盘面 (编辑模式): 空白格应全黑
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
await ws.raw("Page.reload", { ignoreCache: true });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'windkabe' && ui.puzzle.board.cols === 3) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready);

console.log("empty-cell pixel (expect black ~0,0,0):", await pixelAt(ws, 1, 1));
console.log("gridline pixel:", await pixelAt(ws, 0.5, 1));

// 2) 编辑模式跳过（play 盘面）
console.log("clue cell:", await ws.eval("ui.puzzle.board.getc(3,1).qnum"));

// 2.5) 跳过
// 3) solver (唯一解盘面: 应显示答案 overlay)
console.log("solver events:", await ws.eval("(function(){ var el = document.getElementById('solver-run'); var s = document.getElementById('solver-status'); window.__statusProbe = s; el.dispatchEvent(new MouseEvent('click', {bubbles: true})); return 'dispatched'; })()"));
await new Promise((r) => setTimeout(r, 6000));
console.log("status after dispatch:", await ws.eval("document.getElementById('solver-status').textContent"));
console.log("arrow cell after solver:", await ws.eval("(function(){ var c = ui.puzzle.board.getc(3, 3); return 'qdir=' + c.qdir + ' (expect 2=down)'; })()"));
const shot = await ws.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/windkabe_solver_overlay.png", Buffer.from(shot.result.data, "base64"));
console.log("screenshot saved");
process.exit(0);
