let attempts = 0;
let slowdown = 1;
const maxSlowdown = 100;
const baseDelayMs = 100;

// Once the page is being unloaded (user navigates, closes the tab, etc.) the
// WebSocket closing is expected and not a signal that the dev server is gone.
// We must not schedule reconnects or trigger reloads in that case — doing so
// spins up stray connections during teardown and, on a successful reconnect,
// calls `location.reload()`, which is the error observed on navigation.
let unloading = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let activeConnection: WebSocket | undefined;

globalThis.addEventListener("pagehide", (event) => {
  // `pagehide` also fires when the page enters the back/forward cache. We only
  // treat it as a true teardown when the page is not being persisted — otherwise
  // we'd permanently disable live reload after a back/forward navigation.
  if (event.persisted) return;

  unloading = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  // Close cleanly to avoid spurious close/error callbacks firing mid-teardown.
  try {
    activeConnection?.close();
  } catch {
    // Socket may already be closing/closed; safe to ignore.
  }
});

// If the page was restored from the back/forward cache, the socket may have
// been killed by the browser while the page was frozen. Reconnect if we don't
// still have a live OPEN socket.
globalThis.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  // A reconnect timer scheduled before bfcache is paused by the browser and
  // resumes on restore. Cancel it so it can't race the fresh socket we're
  // about to create (a reconnect-attempt socket that opens first would call
  // `location.reload()`).
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) {
    activeConnection = undefined;
    manageWebSocket(false);
  }
});

function manageWebSocket(isReconnectAttempt = false) {
  // Don't spin up a new connection once the page is on its way out.
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
    // The handshake may have completed and this task may already be queued on
    // the event loop by the time `pagehide` fires and closes the socket. A
    // queued `open` callback is not cancelled by `close()`, so guard here too —
    // otherwise we'd call `location.reload()` mid-teardown.
    if (unloading) return;
    // A newer connection may have already taken over (e.g. a bfcache restore
    // spun up a fresh socket while this reconnect was in-flight). This `open`
    // is stale — don't reload from it.
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
      globalThis.location.reload();
      return;
    }
  });

  connection.addEventListener("close", (event) => {
    // If a newer connection has already taken over (e.g. a bfcache restore spun
    // up a fresh socket), this close event is stale — don't clear the active
    // reference or schedule a competing reconnect.
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

    // The page is being torn down. A reconnect here would either fail or, worse,
    // succeed and force an unexpected `location.reload()`.
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
