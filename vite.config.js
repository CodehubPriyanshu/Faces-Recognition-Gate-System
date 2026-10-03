import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

const netlifyPlugins =
  process.env.NETLIFY === "true"
    ? [(await import("@netlify/vite-plugin-tanstack-start")).default()]
    : [];

// This Start version appends a TypeScript registration footer even with disableTypes.
// Remove that type-only footer from both the generated file and Vite's module input.
function javascriptRouteTree() {
  const routeTreePath = fileURLToPath(new URL("./src/routeTree.gen.js", import.meta.url));
  const stripFooter = (code) => code.replace(/\nimport type \{ getRouter \}[\s\S]*$/, "\n");
  return {
    name: "javascript-route-tree",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/") !== routeTreePath.replaceAll("\\", "/")) return;
      const generated = readFileSync(routeTreePath, "utf8");
      const javascript = stripFooter(generated);
      if (javascript !== generated) writeFileSync(routeTreePath, javascript);
      return { code: stripFooter(code), map: null };
    },
  };
}

export default defineConfig({
  server: { host: "::", port: 8080, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    javascriptRouteTree(),
    tanstackStart({
      server: { entry: "server" },
      router: { disableTypes: true, generatedRouteTree: "routeTree.gen.js" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    react(),
    ...netlifyPlugins,
  ],
});
