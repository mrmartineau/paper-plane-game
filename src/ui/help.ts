// Controls card: a native popover (see index.html). Opens on first load,
// closes when you start flying (any key or a click), and toggles with ? or H.
export function setupHelp() {
	const help = document.getElementById("help");
	if (!help) return;
	help.showPopover();

	addEventListener("keydown", (e) => {
		if (e.key === "?" || e.code === "KeyH") {
			help.togglePopover();
			return;
		}
		if (help.matches(":popover-open")) help.hidePopover();
	});
}
