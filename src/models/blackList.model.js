const mongoose = require("mongoose");
/**
 * BlackList token is created because token does not expire immediately after logout, it is valid until the expiry time. So to invalidate the token immediately after logout, we need to blacklist the token.So that hackers cannot use the token after logout. The blacklisted token will be automatically removed from the database after 3 days (the expiry time of the token) using TTL index.
 */
const tokenBlacklistSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: [true, "Token is required to blacklist"],
      unique: [true, "Token is already blacklisted"],
    },
  },
  {
    timestamps: true,
  },
);

tokenBlacklistSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60 * 24 * 3, // 3 days
  },
);

const tokenBlackListModel = mongoose.model(
  "tokenBlackList",
  tokenBlacklistSchema,
);

module.exports = tokenBlackListModel;
