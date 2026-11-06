const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const app = require("../src/app");

test("health endpoint reports that the ledger service is running", async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Ledger Service is up and running");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
