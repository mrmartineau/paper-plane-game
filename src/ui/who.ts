// "Who's flying?": pick a kid by their picture. Shown once at the start when a device has
// more than one kid, and always in the pause menu (with add and remove).
// Switching reloads the page, so settings, best times and ghosts all load for that kid.
import {
	activeProfile,
	addProfile,
	current,
	listProfiles,
	MAX_PROFILES,
	removeProfile,
	setActive,
	store,
} from "../core/profiles";

const CHOSEN = "paper-plane-meta:chosen"; // set for this tab once a kid is picked

function chosen(): boolean {
	try {
		return sessionStorage.getItem(CHOSEN) === "1";
	} catch {
		return true; // can't remember: don't nag
	}
}

function markChosen() {
	try {
		sessionStorage.setItem(CHOSEN, "1");
	} catch {
		// no session storage: the picker may show again after a reload, which is fine
	}
}

function switchTo(id: string) {
	setActive(store, id);
	markChosen();
	location.reload();
}

export function createWho(hooks: { onPause(paused: boolean): void }) {
	const menu = document.getElementById("menu") as HTMLDialogElement;
	const start = document.getElementById("who") as HTMLDialogElement;
	const rows = document.querySelectorAll<HTMLElement>("[data-who]");
	const add = menu.querySelector("[data-action=who-add]") as HTMLButtonElement;
	const remove = menu.querySelector(
		"[data-action=who-remove]",
	) as HTMLButtonElement;
	const title = document.getElementById("menu-title") as HTMLElement;
	title.textContent = `Paused ${current.avatar}`;

	function draw() {
		const list = listProfiles(store);
		const me = activeProfile(store).id;
		for (const row of rows) {
			row.replaceChildren(
				...list.map((p) => {
					const b = document.createElement("button");
					b.type = "button";
					b.textContent = p.avatar;
					b.setAttribute("aria-label", `Kid ${p.id}`);
					b.setAttribute("aria-pressed", String(p.id === me));
					b.addEventListener("click", () => {
						if (p.id === me) start.close();
						else switchTo(p.id);
					});
					return b;
				}),
			);
		}
		add.disabled = list.length >= MAX_PROFILES;
		remove.disabled = list.length <= 1;
	}

	add.addEventListener("click", () => {
		const p = addProfile(store);
		if (p) switchTo(p.id);
	});

	// Removing wipes a kid's saves, so it takes two taps.
	let armed = 0;
	const idle = "Remove this kid";
	remove.addEventListener("click", () => {
		if (!armed) {
			remove.textContent = "Tap again: this deletes their saves";
			armed = window.setTimeout(() => {
				armed = 0;
				remove.textContent = idle;
			}, 3500);
			return;
		}
		clearTimeout(armed);
		const id = activeProfile(store).id;
		if (removeProfile(store, id)) switchTo(activeProfile(store).id);
	});

	start.addEventListener("close", () => hooks.onPause(false));
	draw();

	// First visit in this tab and more than one kid: ask who is flying.
	if (!chosen() && listProfiles(store).length > 1) {
		hooks.onPause(true);
		start.showModal();
	}
	markChosen();
}
