(function () {
  const connection = new WebSocket("/_websocket");
  connection.addEventListener("close", () => {
    globalThis.location.reload();
  });
})();
