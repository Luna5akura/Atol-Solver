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

// 1) 编辑模式: 5x1 盘面放数字
const id = await newPage("http://localhost:8080/p.html?hashitree/5/1/1g2g1");
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
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'hashitree' && ui.puzzle.board.cols === 5) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready, "version:", await ws.eval("pzpr.version"));
console.log("mode:", await ws.eval("(function(){ return 'edit=' + ui.puzzle.editmode + ' play=' + ui.puzzle.playmode; })()"));

console.log("clues:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [bd.getc(1,1).qnum, bd.getc(5,1).qnum, bd.getc(9,1).qnum].join(','); })()"), "(expect 1,2,1)");

// 桥: 用鼠标从岛拖到岛 (hashikake 的 inputLine 方式: 拖 border)
const cellPos = (bx, by) => ws.eval(`(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(${bx}, ${by}); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()`);
async function dragBridge(bx1, by1, bx2, by2) {
	const P1 = JSON.parse(await cellPos(bx1, by1));
	const P2 = JSON.parse(await cellPos(bx2, by2));
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: P1.x, y: P1.y, button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: P2.x, y: P2.y, button: "left", buttons: 1 });
	await new Promise((r) => setTimeout(r, 60));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: P2.x, y: P2.y, button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}

// 岛格 (0,0)->(0,2) 的桥: inputLine 拖的是 border 位置。桥在 (0,0)-(0,1) 之间: 从岛中心拖到空格中心
// 不画桥, 直接 solver (画桥后 solver 会跳过已有答案)
await ws.eval("ui.puzzle.ansclear(); void 0");
await new Promise((r) => setTimeout(r, 200));
console.log("bridge lines cleared:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [2,4,6,8].map(function(bx){ return bd.getb(bx,1).line; }).join(','); })()"), "(expect 0,0,0,0)");


// 2) solver 按钮
console.log("solver:", await ws.eval("(function(){ var el = document.getElementById('solver-run'); el.dispatchEvent(new MouseEvent('click', {bubbles: true})); return 'dispatched'; })()"));
await new Promise((r) => setTimeout(r, 6000));
console.log("solver status:", await ws.eval("document.getElementById('solver-status').textContent"));
const shot = await ws.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/hashitree.png", Buffer.from(shot.result.data, "base64"));
console.log("bridge lines after solver:", await ws.eval("(function(){ var bd = ui.puzzle.board; return [2,4,6,8].map(function(bx){ return bd.getb(bx,1).line; }).join(','); })()"), "(expect overlay 1,1,1,1)");
console.log("screenshot saved /tmp/hashitree.png");
process.exit(0);
