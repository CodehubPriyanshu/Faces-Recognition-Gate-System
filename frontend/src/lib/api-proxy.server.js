// Netlify retains TanStack SSR. All API behavior and persistence live in FastAPI.
export async function handleApi(request) {
  try {
    const configured =
      process.env.API_PROXY_URL ||
      (process.env.NODE_ENV !== "production" ? "http://localhost:8000" : "");
    const target = new URL(configured);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
      throw new Error("Invalid API_PROXY_URL");
    const incoming = new URL(request.url);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers();
    for (const name of ["content-type", "origin", "cookie", "sec-fetch-site"]) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    const response = await fetch(target, {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: await request.arrayBuffer() }),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "x-content-type-options"]) {
      if (response.headers.has(name)) responseHeaders.set(name, response.headers.get(name));
    }
    for (const cookie of response.headers.getSetCookie())
      responseHeaders.append("set-cookie", cookie);
    responseHeaders.set("cache-control", response.headers.get("cache-control") || "no-store");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error("API proxy failed:", error.name);
    return Response.json(
      { error: "Database request failed. Check the MongoDB connection and server configuration." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  }
}
