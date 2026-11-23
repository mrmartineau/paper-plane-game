// Kid profiles: one device, several kids. Each profile has its own picture (no names),
// settings, best course times and ghosts. Profile data lives under its own localStorage
// prefix, so nothing else in the game needs to know about profiles: storage.ts just
// uses the active profile's prefix. Profile "1" keeps the old "paper-plane:" prefix, so
// everything saved before profiles existed belongs to it.

export interface Profile {
	id: string;
	avatar: string;
}

export const AVATARS = [
	"🦊",
	"🐱",
	"🐶",
	"🐸",
	"🦉",
	"🐙",
	"🦄",
	"🐼",
	"🐯",
	"🐰",
];
export const MAX_PROFILES = 8;

export type Store = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "key"
> & {
	readonly length: number;
};

const META_LIST = "paper-plane-meta:profiles";
const META_ACTIVE = "paper-plane-meta:active";
const OLD_DATA = "paper-plane:";
const OTHER_PROFILE = /^paper-plane:p\d+:/;

/** The storage key prefix for a profile's data. */
export const prefixFor = (id: string) =>
	id === "1" ? OLD_DATA : `paper-plane:p${id}:`;

export function listProfiles(s: Store): Profile[] {
	try {
		const raw = JSON.parse(s.getItem(META_LIST) ?? "null");
		if (
			Array.isArray(raw) &&
			raw.length &&
			raw.every(
				(p) => typeof p?.id === "string" && typeof p?.avatar === "string",
			)
		)
			return raw;
	} catch {
		// fall through to the default
	}
	return [{ id: "1", avatar: AVATARS[0] }];
}

export function activeProfile(s: Store): Profile {
	const list = listProfiles(s);
	const id = s.getItem(META_ACTIVE);
	return list.find((p) => p.id === id) ?? list[0];
}

export function setActive(s: Store, id: string) {
	s.setItem(META_ACTIVE, id);
}

/** Add a kid with the first picture nobody uses. Returns it, or null when full. */
export function addProfile(s: Store): Profile | null {
	const list = listProfiles(s);
	if (list.length >= MAX_PROFILES) return null;
	const id = String(Math.max(...list.map((p) => Number(p.id))) + 1);
	const free = AVATARS.filter((a) => !list.some((p) => p.avatar === a));
	const avatar = free[0] ?? AVATARS[Math.floor(Math.random() * AVATARS.length)];
	const profile = { id, avatar };
	s.setItem(META_LIST, JSON.stringify([...list, profile]));
	return profile;
}

/** Give a kid another picture. */
export function setAvatar(s: Store, id: string, avatar: string) {
	s.setItem(
		META_LIST,
		JSON.stringify(
			listProfiles(s).map((p) => (p.id === id ? { ...p, avatar } : p)),
		),
	);
}

/** Remove a kid and everything they saved. The last profile cannot be removed. */
export function removeProfile(s: Store, id: string): boolean {
	const list = listProfiles(s);
	if (list.length <= 1 || !list.some((p) => p.id === id)) return false;
	const keys: string[] = [];
	for (let i = 0; i < s.length; i++) {
		const k = s.key(i);
		if (!k) continue;
		const mine =
			id === "1"
				? k.startsWith(OLD_DATA) && !OTHER_PROFILE.test(k)
				: k.startsWith(prefixFor(id));
		if (mine) keys.push(k);
	}
	for (const k of keys) s.removeItem(k);
	const rest = list.filter((p) => p.id !== id);
	s.setItem(META_LIST, JSON.stringify(rest));
	if (s.getItem(META_ACTIVE) === id) s.setItem(META_ACTIVE, rest[0].id);
	return true;
}

/** localStorage, or a throwaway in-memory store when the browser blocks it. */
function defaultStore(): Store {
	try {
		localStorage.getItem("x");
		return localStorage;
	} catch {
		const m = new Map<string, string>();
		return {
			getItem: (k) => m.get(k) ?? null,
			setItem: (k, v) => void m.set(k, String(v)),
			removeItem: (k) => void m.delete(k),
			key: (i) => [...m.keys()][i] ?? null,
			get length() {
				return m.size;
			},
		};
	}
}

export const store = defaultStore();
export const current = activeProfile(store);
