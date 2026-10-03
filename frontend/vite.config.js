import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

const netlifyPlugins =
  process.env.NETLIFY === "true"
    ? [(await import("@netlify/vite-plugin-tanstack-start")).default()]
    : [];

// This Start version appends a TypeScript registration footer even with disableTypes.
// Strip it in memory: writing during transform makes the router watcher regenerate
// the footer and causes repeated reloads. The dependency scanner needs it stripped too.
const stripRouteTreeFooter = (code) => code.replace(/\nimport type \{ getRouter \}[\s\S]*$/, "\n");
function javascriptRouteTree() {
  const routeTreePath = fileURLToPath(new URL("./src/routeTree.gen.js", import.meta.url));
  return {
    name: "javascript-route-tree",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/") !== routeTreePath.replaceAll("\\", "/")) return;
      return { code: stripRouteTreeFooter(code), map: null };
    },
  };
}

export default defineConfig({
  server: { host: "::", port: 8080, strictPort: true },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "javascript-route-tree-scan",
          setup(build) {
            build.onLoad({ filter: /[\\/]routeTree\.gen\.js$/ }, ({ path }) => ({
              contents: stripRouteTreeFooter(readFileSync(path, "utf8")),
              loader: "js",
            }));
          },
        },
      ],
    },
  },
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
