// Ghost: a recorded run, sampled every interval, packed small for localStorage.
// Positions are stored in decimetres relative to the start gate and the orientation
// as a quaternion, all as Int16, then base64. Pure, no Three.js or DOM.

export interface GhostSample {
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
}

export interface Ghost {
	interval: number; // seconds between samples
	origin: { x: number; y: number; z: number };
	samples: GhostSample[];
	ringTimes: number[]; // seconds after the start when each ring was passed (NaN = missed)
}

const POS = 10; // decimetres
const ROT = 32767;

export function encodeGhost(g: Ghost): string {
	const data = new Int16Array(g.samples.length * 7);
	g.samples.forEach((s, i) => {
		const o = i * 7;
		data[o] = Math.round((s.x - g.origin.x) * POS);
		data[o + 1] = Math.round((s.y - g.origin.y) * POS);
		data[o + 2] = Math.round((s.z - g.origin.z) * POS);
		data[o + 3] = Math.round(s.qx * ROT);
		data[o + 4] = Math.round(s.qy * ROT);
		data[o + 5] = Math.round(s.qz * ROT);
		data[o + 6] = Math.round(s.qw * ROT);
	});
	let bin = "";
	const bytes = new Uint8Array(data.buffer);
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return JSON.stringify({
		i: g.interval,
		o: g.origin,
		r: g.ringTimes,
		d: btoa(bin),
	});
}

export function decodeGhost(text: string): Ghost | null {
	try {
		const { i, o, r, d } = JSON.parse(text);
		const bin = atob(d);
		const bytes = new Uint8Array(bin.length);
		for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
		const data = new Int16Array(bytes.buffer);
		const samples: GhostSample[] = [];
		for (let k = 0; k + 6 < data.length; k += 7) {
			samples.push({
				x: data[k] / POS + o.x,
				y: data[k + 1] / POS + o.y,
				z: data[k + 2] / POS + o.z,
				qx: data[k + 3] / ROT,
				qy: data[k + 4] / ROT,
				qz: data[k + 5] / ROT,
				qw: data[k + 6] / ROT,
			});
		}
		return {
			interval: i,
			origin: o,
			samples,
			ringTimes: (r as (number | null)[]).map((t) => t ?? Number.NaN),
		};
	} catch {
		return null;
	}
}

/** Where the ghost was `t` seconds into its run (linear between samples; null after it ends). */
export function ghostAt(g: Ghost, t: number): GhostSample | null {
	const f = t / g.interval;
	const i = Math.floor(f);
	if (i < 0 || i >= g.samples.length - 1) return null;
	const a = g.samples[i];
	const b = g.samples[i + 1];
	const k = f - i;
	const l = (p: number, q: number) => p + (q - p) * k;
	return {
		x: l(a.x, b.x),
		y: l(a.y, b.y),
		z: l(a.z, b.z),
		qx: l(a.qx, b.qx),
		qy: l(a.qy, b.qy),
		qz: l(a.qz, b.qz),
		qw: l(a.qw, b.qw),
	};
}
