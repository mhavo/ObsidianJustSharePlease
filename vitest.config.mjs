import {defineConfig} from "vitest/config";

// Only run the plugin's tests; server/ has its own tooling.
export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
    },
});
