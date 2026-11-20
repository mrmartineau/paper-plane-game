import { config } from "../config";

/**
 * Fixed-timestep update with an accumulator; render every frame with
 * alpha = how far we are between the last two updates (for interpolation).
 * Stops while the tab is hidden and clamps the delta when it comes back.
 */
export function startLoop(
	update: (dt: number) => void,
	render: (alpha: number, frameDt: number) => void,
) {
	const step = 1 / config.loop.hz;
	let acc = 0;
	let last = performance.now();
	let raf = 0;

	const frame = (now: number) => {
		const frameDt = Math.min((now - last) / 1000, config.loop.maxFrameDelta);
		last = now;
		acc += frameDt;
		while (acc >= step) {
			update(step);
			acc -= step;
		}
		render(acc / step, frameDt);
		raf = requestAnimationFrame(frame);
	};

	document.addEventListener("visibilitychange", () => {
		cancelAnimationFrame(raf);
		if (document.hidden) return;
		last = performance.now();
		acc = 0;
		raf = requestAnimationFrame(frame);
	});

	raf = requestAnimationFrame(frame);
}
