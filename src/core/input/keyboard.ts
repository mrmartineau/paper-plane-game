// Stick convention: W / ↑ pushes the nose down, S / ↓ pulls it up.
export function createKeyboard() {
	const down = new Set<string>();
	window.addEventListener("keydown", (e) => {
		down.add(e.code);
		if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
	});
	window.addEventListener("keyup", (e) => down.delete(e.code));
	window.addEventListener("blur", () => down.clear());

	const axis = (neg: string[], pos: string[]) =>
		(pos.some((c) => down.has(c)) ? 1 : 0) -
		(neg.some((c) => down.has(c)) ? 1 : 0);

	return {
		read() {
			return {
				pitch: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
				roll: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
				boost: down.has("Space"),
				fire: down.has("KeyF"),
			};
		},
	};
}
