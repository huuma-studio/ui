let attempts = 0;
let slowdown = 1;

(function () {
  const connection = new WebSocket("/_websocket");
  connection.addEventListener("close", () => {
    ready();
  });
})();

async function ready() {
  try {
    const res = await fetch(globalThis.location.href);
    if (res.ok) {
      globalThis.location.reload();
    }
  } catch (_: unknown) {
    attempts++;
    setTimeout(() => {
      console.log(`Retry attempt ${attempts}`);
      if (attempts > 100 && slowdown < 100) {
        slowdown += 5;
      }
      ready();
    }, 50 * slowdown);
  }
}
