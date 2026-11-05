const mongoose = require("mongoose");
async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("DB is connected");
  } catch (error) {
    console.error("Error connecting DB:", error.message);
    throw error;
  }
}
module.exports = connectToDB;
