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

const id = await newPage("http://localhost:8899/p.html?imbalanceloop/4/4/g01h");
console.log("tab id:", id);

const pages = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9222/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page = pages.find((p) => p.id === id);
const ws = await wsConnect(9222, page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'imbalanceloop' && ui.puzzle.board.cols === 4 && ui.toolarea && ui.toolarea.items) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready);
console.log("state:", await ws.eval("(function(){ return 'editmode=' + ui.puzzle.editmode + ' playeronly=' + ui.puzzle.playeronly; })()"));

console.log("valid(mode):", await ws.eval('ui.menuconfig.valid("mode")'));
console.log(await ws.eval(`(function(){ var el = document.querySelector('[data-config=mode]'); var p = el && el.parentNode; return JSON.stringify({ elDisplay: el ? getComputedStyle(el).display : 'missing', parentDisplay: p ? getComputedStyle(p).display : 'missing', parentId: p ? p.id : 'none', toolarea: ui.menuconfig.get('toolarea') }); })()`));

async function click(btn, x, y) {
	await ws.raw("Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: btn, buttons: btn === "left" ? 1 : 2, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 80));
	await ws.raw("Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: btn, buttons: 0, clickCount: 1 });
	await new Promise((r) => setTimeout(r, 250));
}

const modeBtn = JSON.parse(await ws.eval("(function(){ var el = document.querySelector('[data-config=mode] .child[data-value=edit]'); if (!el) return '{}'; var r = el.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, visible: getComputedStyle(el.parentNode.parentNode).display !== 'none' && getComputedStyle(el).display !== 'none' }); })()"));
console.log("Edit-mode button:", JSON.stringify(modeBtn));

if (modeBtn.x) {
	await click("left", modeBtn.x, modeBtn.y);
	console.log("after clicking Edit mode:", await ws.eval("(function(){ return 'editmode=' + ui.puzzle.editmode + ' playeronly=' + ui.puzzle.playeronly; })()"));
}

const P = JSON.parse(await ws.eval("(function(){ var pc = ui.puzzle.painter; var r = ui.puzzle.painter.context.child.getBoundingClientRect(); var c = ui.puzzle.board.getc(5, 5); return JSON.stringify({ x: r.left + (c.bx * pc.bw + pc.x0), y: r.top + (c.by * pc.bh + pc.y0) }); })()"));
console.log("cell(2,2) at:", P.x, P.y);
await click("right", P.x, P.y);
console.log("right-click -> black?:", await ws.eval("(function(){ var c = ui.puzzle.board.getc(5,5); return c.qnum + '/' + c.qdir + '/' + c.qans; })()"));
await click("right", P.x, P.y);
console.log("right-click -> empty?:", await ws.eval("(function(){ var c = ui.puzzle.board.getc(5,5); return c.qnum + '/' + c.qdir + '/' + c.qans; })()"));
process.exit(0);
