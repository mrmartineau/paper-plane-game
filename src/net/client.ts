// WebSocket link to the room for this world seed. Reconnects with backoff.
// If the server is down, the game just runs alone.
import {
	type ClientMsg,
	type Player,
	type PlayerState,
	parseServer,
	type ServerMsg,
} from "./protocol";

const SEND_GAP = 1 / 15; // seconds between state messages

export function connect(room: string, on: (m: ServerMsg) => void) {
	let ws: WebSocket | null = null;
	let closed = false;
	let wait = 1;
	let timer = 0;
	let lastSent = -Infinity;
	const players = new Map<number, Player>();
	const link = {
		id: null as number | null,
		players,
		/** Send where you are; drops calls closer together than 1/15 s. */
		sendState(s: PlayerState, now: number) {
			if (now - lastSent < SEND_GAP) return;
			lastSent = now;
			send({ t: "state", s });
		},
		send,
		close() {
			closed = true;
			clearTimeout(timer);
			ws?.close();
			reset();
		},
	};

	function send(m: ClientMsg) {
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
	}

	function reset() {
		for (const id of players.keys()) on({ t: "leave", id });
		players.clear();
		link.id = null;
	}

	function open() {
		const proto = location.protocol === "https:" ? "wss" : "ws";
		ws = new WebSocket(
			`${proto}://${location.host}/ws/${encodeURIComponent(room)}`,
		);
		ws.onmessage = (e) => {
			const m = parseServer(e.data);
			if (!m) return;
			if (m.t === "welcome") {
				wait = 1;
				link.id = m.id;
				players.set(m.id, { id: m.id, colour: m.colour, score: 0 });
				for (const p of m.players) players.set(p.id, p);
			} else if (m.t === "join") players.set(m.player.id, m.player);
			else if (m.t === "leave") players.delete(m.id);
			else if (m.t === "it") {
				for (const p of players.values()) p.it = p.id === m.id;
			} else if (m.t === "score") {
				const p = players.get(m.id);
				if (p) p.score = m.score;
			} else if (m.t === "full") closed = true; // don't retry a full room
			on(m);
		};
		ws.onclose = () => {
			reset();
			if (closed) return;
			timer = window.setTimeout(open, wait * 1000);
			wait = Math.min(30, wait * 2);
		};
	}
	open();
	return link;
}

export type NetLink = ReturnType<typeof connect>;
