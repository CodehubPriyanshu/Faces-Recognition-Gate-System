import { createFileRoute } from "@tanstack/react-router";
import { handleApi } from "@/lib/api-proxy.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleApi(request),
      POST: ({ request }) => handleApi(request),
    },
  },
});
