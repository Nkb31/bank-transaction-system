require("dotenv").config({ override: true });
const app = require("./src/app");
const connectToDB = require("./src/config/db");

async function startServer() {
  try {
    await connectToDB();
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`server is running on port ${port}`));
  } catch {
    process.exitCode = 1;
  }
}

startServer();
