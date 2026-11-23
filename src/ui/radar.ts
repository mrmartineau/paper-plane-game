// Radar: a small round map in the top-right. You are in the middle, facing up.
// Other players show as dots in their paper colour; far ones stick to the rim.
// Hollow dot = below you, solid = near your height, ring with a dash = above you.

export interface Blip {
	x: number;
	y: number;
	z: number;

	colour: string;
	it?: boolean;
}

const SIZE = 120;
const RANGE = 1500; // metres from centre to rim
const LABELS_MAX = 3; // show distances only when this few players are on the radar
const LEVEL = 40; // metres of height difference that still counts as "same height"

export function createRadar() {
	const canvas = document.getElementById("radar") as HTMLCanvasElement;
	const ctx = canvas.getContext("2d");
	const dpr = Math.min(2, devicePixelRatio || 1);
	canvas.width = SIZE * dpr;
	canvas.height = SIZE * dpr;
	ctx?.scale(dpr, dpr);
	const c = SIZE / 2;
	const R = c - 6;

	return {
		/** `yaw` = heading in radians (0 = -Z). Hidden when there is nobody else. */
		update(
			me: { x: number; y: number; z: number },
			yaw: number,
			blips: Blip[],
		) {
			canvas.hidden = blips.length === 0;
			if (!ctx || canvas.hidden) return;
			ctx.clearRect(0, 0, SIZE, SIZE);
			ctx.fillStyle = "rgba(250, 246, 236, 0.82)";
			ctx.strokeStyle = "rgba(60, 50, 40, 0.5)";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(c, c, R + 3, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.strokeStyle = "rgba(60, 50, 40, 0.2)";
			for (const k of [1 / 3, 2 / 3]) {
				ctx.beginPath();
				ctx.arc(c, c, R * k, 0, Math.PI * 2);
				ctx.stroke();
			}
			// You: a small arrow pointing up.
			ctx.fillStyle = "rgba(60, 50, 40, 0.9)";
			ctx.beginPath();
			ctx.moveTo(c, c - 6);
			ctx.lineTo(c + 4, c + 4);
			ctx.lineTo(c - 4, c + 4);
			ctx.closePath();
			ctx.fill();

			const sin = Math.sin(yaw);
			const cos = Math.cos(yaw);
			for (const b of blips) {
				const dx = b.x - me.x;
				const dz = b.z - me.z;
				// Forward is (-sin, -cos); right is (cos, -sin). Screen: right = +x, forward = -y.
				const right = dx * cos - dz * sin;
				const ahead = -dx * sin - dz * cos;
				const d = Math.hypot(right, ahead);
				const k = Math.min(d, RANGE) / RANGE;
				const px = c + (d > 0 ? (right / d) * k * R : 0);
				const py = c - (d > 0 ? (ahead / d) * k * R : 0);
				const dy = b.y - me.y;

				ctx.fillStyle = b.it ? "#f2c230" : b.colour;
				ctx.strokeStyle = "rgba(60, 50, 40, 0.9)";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(px, py, d > RANGE ? 3.5 : 4.5, 0, Math.PI * 2);
				if (dy < -LEVEL)
					ctx.stroke(); // below: hollow
				else {
					ctx.fill();
					ctx.stroke();
				}
				if (blips.length <= LABELS_MAX) {
					// Distance (flat, in metres), on the side facing the middle so it stays inside.
					ctx.fillStyle = "rgba(60, 50, 40, 0.95)";
					ctx.font = "600 10px system-ui, sans-serif";
					ctx.textAlign = px > c ? "right" : "left";
					ctx.textBaseline = "middle";
					ctx.fillText(
						d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`,
						px + (px > c ? -8 : 8),
						py + 1,
					);
				}
				if (dy > LEVEL) {
					ctx.beginPath(); // above: a dash over the dot
					ctx.moveTo(px - 3, py - 8);
					ctx.lineTo(px + 3, py - 8);
					ctx.stroke();
				}
			}
		},
	};
}
