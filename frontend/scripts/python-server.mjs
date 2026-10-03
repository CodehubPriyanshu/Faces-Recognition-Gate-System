import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

// Isolated integration tests and SSR smoke checks only.
export async function startPythonServer(env = {}) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(
    process.env.PYTHON_EXECUTABLE || "python",
    [
      "-m",
      "uvicorn",
      "main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--no-access-log",
      "--ws",
      "none",
    ],
    {
      cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
      env: { ...process.env, ...env },
      stdio: "ignore",
    },
  );
  let startupError;
  child.on("error", (error) => {
    startupError = error;
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode !== null || startupError) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  };
  for (let i = 0; i < 100; i++) {
    if (startupError || child.exitCode !== null) break;
    try {
      const response = await fetch(`${url}/api/auth/session`, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) return { url, stop };
    } catch {
      /* Startup only; no application DB is needed. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop();
  throw new Error("FastAPI failed to start; install requirements.txt and check PYTHON_EXECUTABLE.");
}
