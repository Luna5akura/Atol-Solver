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

const id = await newPage("http://localhost:8080/p.html?uniqnurikabe/4/4/j2g2o");
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
	const st = await ws.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'uniqnurikabe' && ui.puzzle.board.cols === 4) ? 'ok' : 'loading'").catch(() => "loading");
	ready = st === "ok";
}
console.log("ready:", ready, "version:", await ws.eval("pzpr.version"));
console.log("mode:", await ws.eval("(function(){ return 'edit=' + ui.puzzle.editmode + ' play=' + ui.puzzle.playmode; })()"));

// 涂黑 (eval 设 qans): 两个水平 domino 岛 -> nuShapeDup
await ws.eval("(function(){ var bd = ui.puzzle.board; var blacks = [[0,0],[0,3],[1,0],[1,1],[1,2],[1,3],[2,0],[2,3],[3,0],[3,1],[3,2],[3,3]]; for (var i = 0; i < blacks.length; i++) { bd.getc(2*blacks[i][0]+1, 2*blacks[i][1]+1).setQans(1); } void 0; })()");
await new Promise((r) => setTimeout(r, 300));
console.log("check dup:", await ws.eval("(function(){ var r = ui.puzzle.check(); return 'complete=' + r.complete + ' fail0=' + r[0]; })()"), "(expect nuShapeDup)");
const shot1 = await ws.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/uniqnu_dup.png", Buffer.from(shot1.result.data, "base64"));

// 正确解: 3x3 中心 1
const id2 = await newPage("http://localhost:8080/p.html?uniqnurikabe/3/3/j1j");
const pages2 = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9222/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page2 = pages2.find((p) => p.id === id2);
const ws2 = await wsConnect(9222, page2.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));
await ws2.raw("Page.reload", { ignoreCache: true });
let ready2 = false;
for (let i = 0; i < 60 && !ready2; i++) {
	await new Promise((r) => setTimeout(r, 400));
	const st = await ws2.eval("(typeof ui !== 'undefined' && ui.puzzle && ui.puzzle.pid === 'uniqnurikabe' && ui.puzzle.board.cols === 3) ? 'ok' : 'loading'").catch(() => "loading");
	ready2 = st === "ok";
}
await ws2.eval("(function(){ var bd = ui.puzzle.board; for (var y = 1; y <= 5; y += 2) { for (var x = 1; x <= 5; x += 2) { if (x !== 3 || y !== 3) bd.getc(x, y).setQans(1); } } void 0; })()");
await new Promise((r) => setTimeout(r, 300));
console.log("check valid:", await ws2.eval("(function(){ var r = ui.puzzle.check(); return 'complete=' + r.complete + ' fail0=' + r[0]; })()"), "(expect complete)");
const shot2 = await ws2.raw("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/uniqnu_ok.png", Buffer.from(shot2.result.data, "base64"));
console.log("screenshots saved");
process.exit(0);
