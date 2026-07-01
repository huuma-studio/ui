let attempts = 0;
let slowdown = 1;
const maxSlowdown = 100;
const baseDelayMs = 100;

// While the page is being torn down, a closing socket is expected — a
// reconnect then would end in a stray `location.reload()`.
let unloading = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let activeConnection: WebSocket | undefined;

// Firefox kills open sockets when a navigation *starts*, before `pagehide`
// fires — set the flag here too, or `close` schedules a reconnect whose
// reload cancels the navigation (endless reload loop). Trade-off: a
// `beforeunload` listener can make the page bfcache-ineligible, acceptable
// for a dev-only script.
globalThis.addEventListener("beforeunload", () => {
  unloading = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
});

globalThis.addEventListener("pagehide", (event) => {
  // Persisted means bfcache, not teardown — keep live reload armed.
  if (event.persisted) return;

  unloading = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  try {
    activeConnection?.close();
  } catch {
    // Already closing/closed.
  }
});

// Restored from bfcache: the browser may have killed the socket while the
// page was frozen.
globalThis.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  // `beforeunload` set the flag on the way into the cache; the page is live again.
  unloading = false;
  // A pre-bfcache reconnect timer resumes on restore and could reload — cancel it.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) {
    activeConnection = undefined;
    manageWebSocket(false);
  }
});

// A cancelled navigation (e.g. the user stays at an "unsaved changes?"
// prompt) sets `unloading` but never fires `pagehide`/`pageshow` to reset it.
// Focus, visibility, or any interaction proves the page survived.
function recoverFromCancelledNavigation() {
  if (!unloading) return;
  unloading = false;
  // Don't trust the leftover socket: Firefox may have killed it with
  // `readyState` still reading OPEN, and its late `close` would schedule a
  // reload-ing reconnect. Detach it (its pending events fail the
  // `activeConnection` guards) and start a fresh initial connection, which
  // never reloads.
  const staleConnection = activeConnection;
  activeConnection = undefined;
  try {
    staleConnection?.close();
  } catch {
    // Already closing/closed.
  }
  manageWebSocket(false);
}

globalThis.addEventListener("focus", recoverFromCancelledNavigation);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    recoverFromCancelledNavigation();
  }
});
// The beforeunload prompt may not blur the window, so focus/visibility never
// fire — any interaction is an equally valid survival signal.
globalThis.addEventListener("pointerdown", recoverFromCancelledNavigation);
globalThis.addEventListener("keydown", recoverFromCancelledNavigation);

function manageWebSocket(isReconnectAttempt = false) {
  // No new connections during teardown.
  if (unloading) return;

  const wsProtocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${globalThis.location.host}/_websocket`;

  if (isReconnectAttempt) {
    console.log(
      `Attempting to reconnect WebSocket... Attempt: ${
        attempts + 1
      }, Delay factor: ${slowdown}`,
    );
  } else {
    console.log("Attempting initial WebSocket connection to:", wsUrl);
  }

  const connection = new WebSocket(wsUrl);
  activeConnection = connection;
  let hasOpened = false;

  connection.addEventListener("open", () => {
    // `close()` doesn't cancel an already-queued `open` — don't reload
    // mid-teardown.
    if (unloading) return;
    // A newer connection took over while this one was in flight — stale.
    if (activeConnection !== connection) return;

    hasOpened = true;
    console.log(
      `WebSocket connection ${
        isReconnectAttempt ? "re-established" : "established"
      }.`,
    );
    attempts = 0;
    slowdown = 1;

    if (isReconnectAttempt) {
      console.log("Reconnection successful. Reloading page.");
      // Defer and re-check: a navigation may have started since the
      // handshake, or a recovery/bfcache restore may have replaced this
      // socket — reloading then would be spurious.
      setTimeout(() => {
        if (!unloading && activeConnection === connection) {
          globalThis.location.reload();
        }
      }, 0);
      return;
    }
  });

  connection.addEventListener("close", (event) => {
    // Stale close from a replaced connection — ignore.
    if (activeConnection !== connection) return;
    activeConnection = undefined;

    if (!hasOpened) {
      console.warn(
        `WebSocket failed to connect initially or closed before opening (code: ${event.code}).`,
      );
    } else {
      console.warn(
        `WebSocket connection closed (code: ${event.code}, reason: '${event.reason}').`,
      );
    }

    // Teardown in progress — a successful reconnect would force a reload.
    if (unloading) return;

    attempts++;
    if (attempts > 3 && slowdown < maxSlowdown) {
      slowdown = Math.min(slowdown + 1, maxSlowdown);
    }

    const delay = baseDelayMs * slowdown;
    console.log(`Scheduling reconnect attempt ${attempts} in ${delay}ms.`);

    reconnectTimer = setTimeout(() => manageWebSocket(true), delay);
  });

  connection.addEventListener("error", (event) => {
    console.error("WebSocket error observed:", event);

    if (!hasOpened) {
      connection.close();
    }
  });
}

manageWebSocket(false);
