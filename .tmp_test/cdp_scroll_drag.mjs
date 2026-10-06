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
				eval: (expr, awaitPromise, to) => new Promise((res, rej) => {
					const id = nextId++;
					const timer = setTimeout(() => { delete pending[id]; rej(new Error("eval timeout")); }, to || 15000);
					pending[id] = (msg) => {
						clearTimeout(timer);
						if (msg.result && msg.result.exceptionDetails) res("EXC: " + (msg.result.exceptionDetails.exception && msg.result.exceptionDetails.exception.description || ""));
						else if (msg.result && msg.result.result) res(msg.result.result.value);
						else res("RAW: " + JSON.stringify(msg));
					};
					send({ id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise } });
				})
			});
		});
	});
}
const pages = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9340/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page = pages.find((p) => p.type === "page");
const ws = await wsConnect(9340, page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));

// reload the 3x3 page fresh (clear previous test lines) and scroll to bottom
await ws.eval('location.href = "http://localhost:8899/p.html?hexmasyu/3/3"; void 0').catch(() => {});
let ready = false;
for (let i = 0; i < 80 && !ready; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'hexmasyu' && ui.puzzle.board.cols === 3) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
await ws.eval("ui.puzzle.playeronly = false; ui.puzzle.setMode('play'); ui.puzzle.mouse.setInputMode('line'); window.scrollTo(0, document.body.scrollHeight); void 0");
await new Promise((r) => setTimeout(r, 500));
console.log("scrollY:", await ws.eval("window.scrollY"));
const P = JSON.parse(await ws.eval("JSON.stringify((function(){ var pc = ui.puzzle.painter; pc.computeHexMetrics(); var r = ui.puzzle.painter.context.child.getBoundingClientRect(); function cc(x, y){ var c = ui.puzzle.board.getHexCell(x, y); return [r.left + pc.getHexCX(c) + pc.x0, r.top + pc.getHexCY(c) + pc.y0]; } return { a: cc(2,1), b: cc(2,2), c: cc(1,2) }; })())"));
async function drag(from, to) {
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: from[0], y: from[1], button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	for (let i = 1; i <= 8; i++) {
		const t = i / 8;
		await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t, button: "left", buttons: 1 });
		await new Promise((r) => setTimeout(r, 40));
	}
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: to[0], y: to[1], button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 150));
}
const edges = () => ws.eval("JSON.stringify((function(){ var bd = ui.puzzle.board; var out = []; for (var i = 0; i < bd.hexedges.length; i++) { var e = bd.hexedges[i]; if (e.isLine()) { var c1 = e.sideobj[0], c2 = e.sideobj[1]; out.push('(' + (c1.bx-1)/2 + ',' + (c1.by-1)/2 + ')-(' + (c2.bx-1)/2 + ',' + (c2.by-1)/2 + ')'); } } return out; })())");
await drag(P.a, P.b);
console.log("BL drag (2,1)->(2,2):", await edges());
await drag(P.b, P.a);
await drag(P.c, P.b);
console.log("R drag (1,2)->(2,2):", await edges());
process.exit(0);
