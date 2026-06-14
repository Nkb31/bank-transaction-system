const mongoose = require("mongoose");
function connectToDB() {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("DB is connected");
    })
    .catch((Error) => {
      console.log("Error connecting DB");
      console.log(Error.message);
      process.exit(1);
    });
}
module.exports = connectToDB;
