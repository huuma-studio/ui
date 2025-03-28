let attempts = 0;
let slowdown = 1;
const maxSlowdown = 100;
const baseDelayMs = 100;

function manageWebSocket(isReconnectAttempt = false) {
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
  let hasOpened = false;

  connection.addEventListener("open", () => {
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
    if (!hasOpened) {
      console.warn(
        `WebSocket failed to connect initially or closed before opening (code: ${event.code}).`,
      );
    } else {
      console.warn(
        `WebSocket connection closed (code: ${event.code}, reason: '${event.reason}').`,
      );
    }

    attempts++;
    if (attempts > 3 && slowdown < maxSlowdown) {
      slowdown = Math.min(slowdown + 1, maxSlowdown);
    }

    const delay = baseDelayMs * slowdown;
    console.log(`Scheduling reconnect attempt ${attempts} in ${delay}ms.`);

    setTimeout(() => manageWebSocket(true), delay);
  });

  connection.addEventListener("error", (event) => {
    console.error("WebSocket error observed:", event);

    if (!hasOpened) {
      connection.close();
    }
  });
}

manageWebSocket(false);
