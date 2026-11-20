import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Vitest reads this config too; the Cloudflare plugin is only for dev/build.
export default defineConfig({
	plugins: process.env.VITEST ? [] : [cloudflare()],
});
