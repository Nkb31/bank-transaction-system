const { Router } = require("express");
const transactionController = require("../controller/transaction.controller");
const transactionRouter = Router();
const authMiddleware = require("../middleware/auth.middleware");
transactionRouter.post(
  "/",
  authMiddleware.authMiddleware,
  transactionController.createTransaction,
);
/**
 * - Create initial funds transaction from system user to new account
 */
transactionRouter.post(
  "/system/initial-funds",
  authMiddleware.authSystemUserMiddleware,
  transactionController.createInitialFundsTransaction,
);
module.exports = transactionRouter;
