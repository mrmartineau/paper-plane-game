import {
	type Controls,
	type Quality,
	saveSettings,
	settings,
	type TimeOfDay,
} from "../core/settings";

// Pause menu (a native <dialog>): resume, settings, seed sharing.
// Opens with the pause button, Esc, P, gamepad Start, or when the mouse is released.

export interface MenuHooks {
	onPause(paused: boolean): void;
	onQuality(q: Quality): string; // returns a label for the tier in use
	onControls(c: Controls): void;
	onRecalibrate(): void;
	onResume(): void; // e.g. re-lock the mouse
	onPhoto(): void;
	seed: string;
}

const inPhoto = () => document.body.classList.contains("photo");

export function createMenu(hooks: MenuHooks) {
	const dialog = document.getElementById("menu") as HTMLDialogElement;
	const $ = <T extends HTMLElement>(sel: string) =>
		dialog.querySelector(sel) as T;
	const quality = $<HTMLSelectElement>("[name=quality]");
	const controls = $<HTMLSelectElement>("[name=controls]");
	const invert = $<HTMLInputElement>("[name=invert]");
	const sensitivity = $<HTMLInputElement>("[name=sensitivity]");
	const timeOfDay = $<HTMLSelectElement>("[name=time]");
	const audio = $<HTMLInputElement>("[name=audio]");
	const volume = $<HTMLInputElement>("[name=volume]");
	audio.checked = settings.audio;
	volume.value = String(settings.volume);
	audio.addEventListener("change", () => {
		settings.audio = audio.checked;
		saveSettings();
	});
	volume.addEventListener("input", () => {
		settings.volume = Number(volume.value);
		saveSettings();
	});
	const tierLabel = $<HTMLElement>("[data-tier]");
	const seedInput = $<HTMLInputElement>("[name=seed]");
	const copied = $<HTMLElement>("[data-copied]");

	quality.value = settings.quality;
	controls.value = settings.controls;
	invert.checked = settings.invertPitch;
	sensitivity.value = String(settings.sensitivity);
	timeOfDay.value = settings.timeOfDay;
	timeOfDay.addEventListener("change", () => {
		settings.timeOfDay = timeOfDay.value as TimeOfDay;
		saveSettings();
	});

	// Boost
	const unlimited = $<HTMLInputElement>("[name=unlimited]");
	const tank = $<HTMLInputElement>("[name=tank]");
	const tankValue = $<HTMLElement>("[data-tank]");
	const shake = $<HTMLInputElement>("[name=shake]");
	const showTank = () => {
		tankValue.textContent = `${settings.boostSeconds} s`;
		tank.disabled = settings.unlimitedBoost;
	};
	unlimited.checked = settings.unlimitedBoost;
	tank.value = String(settings.boostSeconds);
	shake.checked = settings.cameraShake;
	showTank();
	unlimited.addEventListener("change", () => {
		settings.unlimitedBoost = unlimited.checked;
		saveSettings();
		showTank();
	});
	tank.addEventListener("input", () => {
		settings.boostSeconds = Number(tank.value);
		saveSettings();
		showTank();
	});
	shake.addEventListener("change", () => {
		settings.cameraShake = shake.checked;
		saveSettings();
	});
	seedInput.value = hooks.seed;
	tierLabel.textContent = hooks.onQuality(settings.quality);

	quality.addEventListener("change", () => {
		settings.quality = quality.value as Quality;
		saveSettings();
		tierLabel.textContent = hooks.onQuality(settings.quality);
	});
	controls.addEventListener("change", () => {
		settings.controls = controls.value as Controls;
		saveSettings();
		hooks.onControls(settings.controls);
	});
	invert.addEventListener("change", () => {
		settings.invertPitch = invert.checked;
		saveSettings();
	});
	sensitivity.addEventListener("input", () => {
		settings.sensitivity = Number(sensitivity.value);
		saveSettings();
	});
	$("[data-action=recalibrate]").addEventListener("click", hooks.onRecalibrate);
	$("[data-action=photo]").addEventListener("click", () => {
		dialog.close();
		hooks.onPhoto();
	});

	const link = (seed: string) => {
		const url = new URL(location.href);
		url.searchParams.set("seed", seed);
		return url.toString();
	};
	$("[data-action=copy]").addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(
				link(seedInput.value.trim() || hooks.seed),
			);
			copied.textContent = "Link copied";
		} catch {
			copied.textContent = "Couldn't copy: select the address bar instead";
		}
	});
	$("[data-action=fly]").addEventListener("click", () => {
		location.href = link(seedInput.value.trim() || hooks.seed);
	});
	$("[data-action=new]").addEventListener("click", () => {
		location.href = link(Math.random().toString(36).slice(2, 8));
	});

	const open = () => {
		if (dialog.open) return;
		copied.textContent = "";
		dialog.showModal();
		hooks.onPause(true);
	};
	const close = () => {
		if (dialog.open) dialog.close();
	};
	dialog.addEventListener("close", () => {
		hooks.onPause(false);
	});
	$("[data-action=resume]").addEventListener("click", () => {
		close();
		hooks.onResume();
	});

	document.getElementById("pause-btn")?.addEventListener("click", open);
	addEventListener("keydown", (e) => {
		if (dialog.open || inPhoto()) return; // the dialog handles Esc itself; photo mode has its own Esc
		if (e.code === "Escape" || e.code === "KeyP") open();
	});
	// Releasing the mouse (Esc while it's locked) pauses too.
	let wasLocked = false;
	document.addEventListener("pointerlockchange", () => {
		const locked = document.pointerLockElement !== null;
		if (wasLocked && !locked && !inPhoto()) open();
		wasLocked = locked;
	});

	return {
		get open() {
			return dialog.open;
		},
		toggle() {
			if (dialog.open) close();
			else open();
		},
		setTierLabel(text: string) {
			tierLabel.textContent = text;
		},
	};
}
