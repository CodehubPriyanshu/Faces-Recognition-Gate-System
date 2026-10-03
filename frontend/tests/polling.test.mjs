import assert from "node:assert/strict";
import { test } from "node:test";
import { watchVisitors, notifyVisitorsChanged } from "../src/lib/api.js";

test("dashboard polling refreshes on timer, entry/exit and focus, then cleans up", () => {
  const oldWindow = globalThis.window;
  const target = new EventTarget();
  let tick;
  let interval;
  let cleared;
  target.setInterval = (callback, delay) => {
    tick = callback;
    interval = delay;
    return 42;
  };
  target.clearInterval = (id) => {
    cleared = id;
  };
  globalThis.window = target;
  try {
    let refreshes = 0;
    const stop = watchVisitors(() => refreshes++);
    assert.equal(interval, 5000);
    tick();
    notifyVisitorsChanged();
    target.dispatchEvent(new Event("focus"));
    assert.equal(refreshes, 3);
    stop();
    assert.equal(cleared, 42);
    notifyVisitorsChanged();
    target.dispatchEvent(new Event("focus"));
    assert.equal(refreshes, 3);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
