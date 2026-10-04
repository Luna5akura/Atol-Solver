import http from "http";
import crypto from "crypto";

function wsConnect(port, path) {
	return new Promise((resolve, reject) => {
		const key = crypto.randomBytes(16).toString("base64");
		const req = http.request({
			port,
			path,
			host: "127.0.0.1",
			headers: {
				Connection: "Upgrade",
				Upgrade: "websocket",
				"Sec-WebSocket-Key": key,
				"Sec-WebSocket-Version": "13"
			}
		});
		req.on("error", reject);
		req.on("upgrade", (res, socket) => {
			const pending = {};
			let nextId = 1,
				buf = Buffer.alloc(0);
			const send = (obj) => {
				const payload = Buffer.from(JSON.stringify(obj), "utf8");
				const len = payload.length;
				let frame;
				if (len < 126) {
					frame = Buffer.alloc(2 + len + 4);
					frame[0] = 0x81;
					frame[1] = 0x80 | len;
					payload.copy(frame, 2);
				} else {
					frame = Buffer.alloc(4 + len + 4);
					frame[0] = 0x81;
					frame[1] = 0x80 | 126;
					frame.writeUInt16BE(len, 2);
					payload.copy(frame, 4);
				}
				const mask = crypto.randomBytes(4);
				const start = frame.length - len - 4;
				for (let i = 0; i < len; i++) {
					frame[start + 4 + i] = payload[i] ^ mask[i & 3];
				}
				mask.copy(frame, start);
				socket.write(frame);
			};
			socket.on("data", (d) => {
				buf = Buffer.concat([buf, d]);
				while (buf.length >= 2) {
					const op = buf[0] & 0x0f,
						masked = buf[1] & 0x80,
						ln = buf[1] & 0x7f;
					let off = 2,
						len = ln;
					if (ln === 126) {
						if (buf.length < 4) {
							break;
						}
						len = buf.readUInt16BE(2);
						off = 4;
					} else if (ln === 127) {
						if (buf.length < 10) {
							break;
						}
						len = Number(buf.readBigUInt64BE(2));
						off = 10;
					}
					let mkey = null;
					if (masked) {
						if (buf.length < off + 4) {
							break;
						}
						mkey = buf.slice(off, off + 4);
						off += 4;
					}
					if (buf.length < off + len) {
						break;
					}
					let payload = buf.slice(off, off + len);
					if (masked) {
						for (let i = 0; i < payload.length; i++) {
							payload[i] ^= mkey[i & 3];
						}
					}
					buf = buf.slice(off + len);
					if (op === 0x1) {
						const msg = JSON.parse(payload.toString("utf8"));
						if (msg.id !== undefined && pending[msg.id]) {
							pending[msg.id](msg);
							delete pending[msg.id];
						}
					}
				}
			});
			socket.on("error", reject);
			resolve({
				send,
				eval: (expr) =>
					new Promise((res) => {
						const id = nextId++;
						pending[id] = (msg) =>
							res(msg.result && msg.result.result ? msg.result.result.value : null);
						send({
							id,
							method: "Runtime.evaluate",
							params: { expression: expr, returnByValue: true }
						});
					})
			});
		});
		req.end();
	});
}

const pages = await new Promise((resolve, reject) => {
	http.get("http://127.0.0.1:9222/json", (res) => {
		let d = "";
		res.on("data", (c) => (d += c));
		res.on("end", () => resolve(JSON.parse(d)));
	}).on("error", reject);
});
const page = pages.find((p) => p.type === "page");
console.log("page:", page && page.title);
const ws = await wsConnect(9222, page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, ""));
console.log("ws connected");
await new Promise((r) => setTimeout(r, 3000));
const r1 = await ws.eval(
	'(function(){ var b = document.getElementById("solver-run"); if (!b) return "no-btn"; b.click(); return "clicked"; })()'
);
console.log("click:", r1);
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
	await new Promise((r) => setTimeout(r, 500));
	const st = await ws.eval(
		'(document.getElementById("solver-status")||{textContent:""}).textContent'
	);
	if (st !== "running solver from a blank answer...") {
		console.log("finished in", Date.now() - t0, "ms | status:", st);
		process.exit(0);
	}
}
console.log("still running after 30s");
process.exit(1);
