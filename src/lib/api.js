export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("auth-changed"));
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export function post(path, data = {}) {
  return api(path, { method: "POST", body: JSON.stringify(data) });
}

export function notifyAuthChanged() {
  window.dispatchEvent(new Event("auth-changed"));
  localStorage.setItem("vigil-auth-change", String(Date.now()));
}

export function onAuthChanged(callback) {
  const storage = (event) => {
    if (event.key === "vigil-auth-change") callback();
  };
  window.addEventListener("auth-changed", callback);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("auth-changed", callback);
    window.removeEventListener("storage", storage);
  };
}

// Polling works on standalone MongoDB as well as Atlas, without requiring a replica set.
export function watchVisitors(callback) {
  const timer = window.setInterval(callback, 5000);
  window.addEventListener("visitors-changed", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("visitors-changed", callback);
    window.removeEventListener("focus", callback);
  };
}

export function notifyVisitorsChanged() {
  window.dispatchEvent(new Event("visitors-changed"));
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}
