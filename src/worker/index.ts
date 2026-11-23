// The Worker: /ws/<room> opens a WebSocket to that room's Durable Object.
// Static files are served by Cloudflare's asset handling before the Worker runs.
import { DurableObject } from "cloudflare:workers";
import {
	type ClientMsg,
	type Player,
	parseClient,
	type ServerMsg,
} from "../net/protocol";
import {
	allow,
	chooseIt,
	MAX_PLAYERS,
	nextId,
	passTag,
	pickColour,
	SHOT_GAP_MS,
	STATE_GAP_MS,
	scoreHit,
	TAG_GAP_MS,
} from "../net/room";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const m = new URL(request.url).pathname.match(/^\/ws\/([^/]{1,64})$/);
		if (!m) return new Response("Not found", { status: 404 });
		if (request.headers.get("Upgrade") !== "websocket")
			return new Response("Expected WebSocket", { status: 426 });
		return env.ROOMS.getByName(decodeURIComponent(m[1])).fetch(request);
	},
} satisfies ExportedHandler<Env>;

/**
 * One room = one world seed. Players and scores live on each socket's attachment, so
 * the room can hibernate between messages and wake with everything intact.
 * ponytail: hits are reported by the victim and trusted; add server-side checks if cheating matters.
 */
export class Room extends DurableObject<Env> {
	private last = new Map<string, number>(); // rate gates; fine to lose on hibernation

	async fetch(): Promise<Response> {
		const players = this.players();
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		if (players.length >= MAX_PLAYERS) {
			send(server, { t: "full" });
			server.close(1013, "Room full");
			return new Response(null, { status: 101, webSocket: client });
		}
		const me: Player = {
			id: nextId(players),
			colour: pickColour(players.map((p) => p.colour)),
			score: 0,
		};
		server.serializeAttachment(me);
		send(server, { t: "welcome", id: me.id, colour: me.colour, players });
		this.broadcast({ t: "join", player: me }, server);
		this.syncIt();
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const me = ws.deserializeAttachment() as Player | null;
		if (!me || typeof raw !== "string") return;
		const m: ClientMsg | null = parseClient(raw);
		if (!m) return;
		const now = Date.now();
		if (m.t === "state") {
			if (allow(this.last, `${me.id}s`, now, STATE_GAP_MS))
				this.broadcast({ t: "state", id: me.id, s: m.s }, ws);
		} else if (m.t === "shot") {
			if (allow(this.last, `${me.id}f`, now, SHOT_GAP_MS))
				this.broadcast({ t: "shot", id: me.id, p: m.p, v: m.v }, ws);
		} else if (m.t === "tag") {
			// You were touched by the player who is "it": the tag passes to you.
			if (!allow(this.last, "tag", now, TAG_GAP_MS)) return;
			const pass = passTag(this.players(), m.by, me.id);
			if (!pass) return;
			this.setPlayer(pass.tagger);
			this.setPlayer(pass.tagged);
			this.broadcast({
				t: "score",
				id: pass.tagger.id,
				score: pass.tagger.score,
			});
			this.broadcast({ t: "it", id: pass.tagged.id, from: pass.tagger.id });
		} else {
			const shooter = scoreHit(this.players(), me.id, m.by);
			if (!shooter) return;
			for (const s of this.ctx.getWebSockets())
				if ((s.deserializeAttachment() as Player | null)?.id === shooter.id)
					s.serializeAttachment(shooter);
			this.broadcast({ t: "score", id: shooter.id, score: shooter.score });
		}
	}

	webSocketClose(ws: WebSocket) {
		this.leave(ws);
	}

	webSocketError(ws: WebSocket) {
		this.leave(ws);
	}

	private leave(ws: WebSocket) {
		const me = ws.deserializeAttachment() as Player | null;
		ws.serializeAttachment(null);
		if (me) {
			this.broadcast({ t: "leave", id: me.id }, ws);
			this.syncIt();
		}
	}

	/** Make sure exactly one player is "it" (when there are two or more), and tell everyone. */
	private syncIt() {
		const players = this.players();
		const before = players.find((p) => p.it)?.id ?? null;
		const id = chooseIt(players);
		if (id === before) return;
		for (const p of players) this.setPlayer({ ...p, it: p.id === id });
		this.broadcast({ t: "it", id });
	}

	private setPlayer(p: Player) {
		for (const s of this.ctx.getWebSockets())
			if ((s.deserializeAttachment() as Player | null)?.id === p.id)
				s.serializeAttachment(p);
	}

	private players(): Player[] {
		return this.ctx
			.getWebSockets()
			.map((s) => s.deserializeAttachment() as Player | null)
			.filter((p): p is Player => p !== null);
	}

	private broadcast(msg: ServerMsg, except?: WebSocket) {
		const text = JSON.stringify(msg);
		for (const s of this.ctx.getWebSockets())
			if (s !== except) trySend(s, text);
	}
}

function send(ws: WebSocket, msg: ServerMsg) {
	trySend(ws, JSON.stringify(msg));
}

function trySend(ws: WebSocket, text: string) {
	try {
		ws.send(text);
	} catch {
		// closing socket; webSocketClose cleans up
	}
}
