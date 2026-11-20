import { config } from "../config";
import { settings } from "../core/settings";

// All sound is synthesised with WebAudio, no files:
// wind (filtered noise, louder and brighter with speed), a paper rustle on sharp
// turns, chimes for rings, a little tune at a course finish, and a crumple on crash.
// Browsers only allow audio after a user gesture, so it starts on the first one.

export function createSound() {
	const a = config.audio;
	let ctx: AudioContext | null = null;
	let master: GainNode;
	let windGain: GainNode;
	let windFilter: BiquadFilterNode;
	let noise: AudioBuffer;
	let lastRustle = 0;

	function start() {
		if (ctx) {
			if (ctx.state === "suspended") ctx.resume();
			return;
		}
		ctx = new AudioContext();
		master = ctx.createGain();
		master.gain.value = 0;
		master.connect(ctx.destination);

		noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

		const wind = ctx.createBufferSource();
		wind.buffer = noise;
		wind.loop = true;
		windFilter = ctx.createBiquadFilter();
		windFilter.type = "lowpass";
		windGain = ctx.createGain();
		windGain.gain.value = 0;
		wind.connect(windFilter).connect(windGain).connect(master);
		wind.start();
	}
	for (const ev of ["pointerdown", "keydown", "touchend"])
		addEventListener(ev, start);

	/** A short burst of filtered noise. */
	function burst(
		at: number,
		freq: number,
		q: number,
		gain: number,
		length: number,
	) {
		if (!ctx) return;
		const src = ctx.createBufferSource();
		src.buffer = noise;
		const f = ctx.createBiquadFilter();
		f.type = "bandpass";
		f.frequency.value = freq;
		f.Q.value = q;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0, at);
		g.gain.linearRampToValueAtTime(gain, at + 0.01);
		g.gain.exponentialRampToValueAtTime(0.001, at + length);
		src.connect(f).connect(g).connect(master);
		src.start(at, Math.random() * 1.5, length + 0.05);
	}

	/** A soft bell: two sine partials with a long decay. */
	function bell(at: number, freq: number, gain: number) {
		if (!ctx) return;
		for (const [ratio, level] of [
			[1, 1],
			[2.76, 0.35],
		]) {
			const o = ctx.createOscillator();
			o.type = "sine";
			o.frequency.value = freq * ratio;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0, at);
			g.gain.linearRampToValueAtTime(gain * level, at + 0.008);
			g.gain.exponentialRampToValueAtTime(0.0005, at + 1.2);
			o.connect(g).connect(master);
			o.start(at);
			o.stop(at + 1.3);
		}
	}

	return {
		/** Every frame: wind follows airspeed; volume follows the settings. */
		update(airspeed: number) {
			if (!ctx) return;
			const t = ctx.currentTime;
			master.gain.setTargetAtTime(settings.audio ? settings.volume : 0, t, 0.1);
			const k = Math.min(1, airspeed / a.windFullSpeed);
			windGain.gain.setTargetAtTime(a.windMin + k ** 1.6 * a.windMax, t, 0.15);
			windFilter.frequency.setTargetAtTime(
				a.windCutoffMin + airspeed * a.windCutoffPerMs,
				t,
				0.15,
			);
		},
		/** Paper rustle; rate-limited so a long turn isn't a wall of noise. */
		rustle() {
			if (!ctx || ctx.currentTime - lastRustle < a.rustleGap) return;
			lastRustle = ctx.currentTime;
			burst(ctx.currentTime, 2600 + Math.random() * 1200, 1.2, 0.12, 0.18);
		},
		chime(pitch = 1) {
			if (ctx) bell(ctx.currentTime, 880 * pitch, 0.18);
		},
		finish() {
			if (!ctx) return;
			const t = ctx.currentTime;
			[1, 1.25, 1.5, 2].forEach((p, i) => {
				bell(t + i * 0.12, 660 * p, 0.16);
			});
		},
		crumple() {
			if (!ctx) return;
			const t = ctx.currentTime;
			for (let i = 0; i < 9; i++)
				burst(
					t + i * 0.05 + Math.random() * 0.03,
					1500 + Math.random() * 3000,
					2,
					0.25,
					0.07,
				);
		},
	};
}
