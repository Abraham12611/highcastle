import { describe, expect, it } from "vitest";
import { EventHub } from "./hub.js";

describe("EventHub", () => {
  it("wakes a waiter on notify", async () => {
    const hub = new EventHub();
    const pending = hub.waitFor("scan-1", new AbortController().signal);
    hub.notify("scan-1");
    await expect(pending).resolves.toBe("notified");
    expect(hub.pendingCount("scan-1")).toBe(0);
  });

  it("wakes only waiters for the notified scan", async () => {
    const hub = new EventHub();
    const controller = new AbortController();
    let otherResolved = false;
    const other = hub.waitFor("scan-2", controller.signal).then((outcome) => {
      otherResolved = true;
      return outcome;
    });
    hub.notify("scan-1");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(otherResolved).toBe(false);
    expect(hub.pendingCount("scan-2")).toBe(1);
    controller.abort();
    await expect(other).resolves.toBe("aborted");
    expect(hub.pendingCount()).toBe(0);
  });

  it("resolves aborted for an already-aborted signal", async () => {
    const hub = new EventHub();
    const controller = new AbortController();
    controller.abort();
    await expect(hub.waitFor("scan-1", controller.signal)).resolves.toBe(
      "aborted",
    );
    expect(hub.pendingCount()).toBe(0);
  });

  it("resolves aborted when aborted mid-wait and cleans up", async () => {
    const hub = new EventHub();
    const controller = new AbortController();
    const pending = hub.waitFor("scan-1", controller.signal);
    expect(hub.pendingCount("scan-1")).toBe(1);
    controller.abort();
    await expect(pending).resolves.toBe("aborted");
    expect(hub.pendingCount()).toBe(0);
  });

  it("notify with no waiters is a no-op", () => {
    const hub = new EventHub();
    expect(() => hub.notify("scan-absent")).not.toThrow();
  });
});
