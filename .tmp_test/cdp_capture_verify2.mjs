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
					const timer = setTimeout(() => { delete pending[id]; rej(new Error(method + " timeout")); }, to || 10000);
					pending[id] = (msg) => { clearTimeout(timer); res(msg); };
					send({ id, method, params });
				}),
				eval: (expr, to) => new Promise((res, rej) => {
					const id = nextId++;
					const timer = setTimeout(() => { delete pending[id]; rej(new Error("eval timeout")); }, to || 10000);
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
const pages = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9343/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page = pages.find((p) => p.type === "page");
const ws = await wsConnect(9343, page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));

const edges = () => ws.eval("(function(){ var bd = ui.puzzle.board; var out = []; for (var i = 0; i < bd.hexedges.length; i++) { var e = bd.hexedges[i]; if (e.isLine()) { var c1 = e.sideobj[0], c2 = e.sideobj[1]; out.push('(' + (c1.bx-1)/2 + ',' + (c1.by-1)/2 + ')-(' + (c2.bx-1)/2 + ',' + (c2.by-1)/2 + ')'); } } return out.join(' '); })()");

await ws.eval("ui.puzzle.playeronly = false; ui.puzzle.setMode('play'); ui.puzzle.mouse.setInputMode('line'); void 0");
await new Promise((r) => setTimeout(r, 400));
const P = JSON.parse(await ws.eval("(function(){ var pc = ui.puzzle.painter; pc.computeHexMetrics(); var r = ui.puzzle.painter.context.child.getBoundingClientRect(); function cc(x, y){ var c = ui.puzzle.board.getHexCell(x, y); return [r.left + pc.getHexCX(c) + pc.x0, r.top + pc.getHexCY(c) + pc.y0]; } return JSON.stringify({ a: cc(2,1), b: cc(2,2), c: cc(1,2), rect: [r.left, r.top, r.width, r.height] }); })()"));
console.log("rect:", JSON.stringify(P.rect));

async function dragPath(points) {
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0][0], y: points[0][1], button: "left", buttons: 1, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 60));
	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1], to = points[i];
		for (let k = 1; k <= 6; k++) {
			const t = k / 6;
			await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t, button: "left", buttons: 1 });
			await new Promise((r) => setTimeout(r, 35));
		}
	}
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: points[points.length - 1][0], y: points[points.length - 1][1], button: "left", buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 150));
}

// 1) bottom vertical drag with overshoot well below the canvas (release outside)
await dragPath([[P.a[0], P.a[1]], [P.b[0], P.b[1]], [P.b[0], P.b[1] + 30]]);
console.log("1) draw then overshoot below canvas:", await edges(), "| inputData:", await ws.eval("ui.puzzle.mouse.inputData"), "| btn:", await ws.eval("JSON.stringify(ui.puzzle.mouse.btn)"));

// 2) re-drag same edge (inside canvas this time) — must ERASE (inputData was cleaned by captured pointerup)
await dragPath([[P.a[0], P.a[1]], [P.b[0], P.b[1]]]);
console.log("2) toggle after captured release:", await edges());

// 3) draw again + overshoot, then hover (no buttons) and check state heals
await dragPath([[P.a[0], P.a[1]], [P.b[0], P.b[1]], [P.b[0], P.b[1] + 30]]);
await ws.raw("Input.dispatchMouseEvent", { type: "mouseMoved", x: P.c[0], y: P.c[1], button: "none", buttons: 0 });
await new Promise((r) => setTimeout(r, 150));
console.log("3) after redraw+overshoot+hover:", await edges(), "| btn:", await ws.eval("JSON.stringify(ui.puzzle.mouse.btn)"));

// 4) toggle again — must erase
await dragPath([[P.a[0], P.a[1]], [P.b[0], P.b[1]]]);
console.log("4) toggle:", await edges());

// 5) horizontal bottom-row drag (1,2)->(2,2) with release below canvas
await dragPath([[P.c[0], P.c[1]], [P.b[0], P.b[1]], [P.b[0], P.b[1] + 30]]);
console.log("5) bottom row horizontal + overshoot:", await edges());
process.exit(0);
