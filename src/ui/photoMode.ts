import type * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Photo mode: the sim freezes, the UI hides, you orbit the camera around the plane
// (drag to turn, scroll or pinch to zoom) and save a PNG. O toggles; Esc leaves.

export function createPhotoMode(opts: {
	renderer: THREE.WebGLRenderer;
	camera: THREE.PerspectiveCamera;
	target: () => THREE.Vector3;
	render: () => void;
	onChange: (active: boolean) => void;
	name: () => string;
}) {
	const bar = document.getElementById("photo-bar") as HTMLElement;
	let controls: OrbitControls | null = null;

	function enter() {
		if (controls) return;
		document.body.classList.add("photo"); // set first: menus ignore the pointer unlock below
		document.exitPointerLock?.();
		controls = new OrbitControls(opts.camera, opts.renderer.domElement);
		controls.target.copy(opts.target());
		controls.enableDamping = true;
		controls.minDistance = 2;
		controls.maxDistance = 400;
		controls.update();
		bar.hidden = false;
		opts.onChange(true);
	}

	function exit() {
		if (!controls) return;
		controls.dispose();
		controls = null;
		bar.hidden = true;
		document.body.classList.remove("photo");
		opts.onChange(false);
	}

	function save() {
		opts.render(); // draw now, then read the canvas in the same task
		opts.renderer.domElement.toBlob((blob) => {
			if (!blob) return;
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${opts.name()}.png`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		}, "image/png");
	}

	bar.querySelector("[data-action=save]")?.addEventListener("click", save);
	bar.querySelector("[data-action=exit]")?.addEventListener("click", exit);
	addEventListener("keydown", (e) => {
		if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
		if (e.code === "KeyO") {
			if (controls) exit();
			else enter();
		} else if (e.code === "Escape" && controls) exit();
	});

	return {
		enter,
		get active() {
			return controls !== null;
		},
		/** Call every frame while active. */
		update() {
			controls?.update();
		},
	};
}
