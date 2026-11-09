const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const emailService = require("../services/email.service");
const accountModel = require("../models/account.model");
const userModel = require("../models/user.models");
const mongoose = require("mongoose");
const emailEnabled = process.env.EMAIL_ENABLED === "true";

async function getOrCreateSystemFundingAccount() {
  let systemUser = await userModel.findOne({ systemUser: true });

  if (!systemUser) {
    systemUser = await userModel.create({
      email: "system@bank.local",
      username: "Bank Funding",
      password: "BankFunding@2025",
      systemUser: true,
    });
  }

  let systemAccount = await accountModel.findOne({
    user: systemUser._id,
    status: "Active",
  });

  if (!systemAccount) {
    systemAccount = await accountModel.create({
      user: systemUser._id,
      status: "Active",
      currency: "INR",
    });
  }

  return { systemUser, systemAccount };
}

async function createTransaction(req, res) {
  /**
   * 1. Validate request
   */
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

  if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "FromAccount, toAccount, amount and idempotencyKey are required",
    });
  }

  const fromUserAccount = await accountModel.findOne({
    _id: fromAccount,
    user: req.user._id,
  });

  const toUserAccount = await accountModel.findOne({
    _id: toAccount,
  });

  if (!fromUserAccount || !toUserAccount) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
    });
  }

  /**
   * 2. Validate idempotency key
   */

  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  if (isTransactionAlreadyExists) {
    if (isTransactionAlreadyExists.status === "COMPLETED") {
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists.status === "PENDING") {
      return res.status(200).json({
        message: "Transaction is still processing",
      });
    }

    if (isTransactionAlreadyExists.status === "FAILED") {
      return res.status(500).json({
        message: "Transaction processing failed, please retry",
      });
    }

    if (isTransactionAlreadyExists.status === "REVERSED") {
      return res.status(500).json({
        message: "Transaction was reversed, please retry",
      });
    }
  }
  /**
   * 3. Check account status
   */

  if (
    fromUserAccount.status !== "Active" ||
    toUserAccount.status !== "Active"
  ) {
    return res.status(400).json({
      message:
        "Both fromAccount and toAccount must be Active to process transaction",
    });
  }
  /**
   * 4. Derive sender balance from ledger
   */
  const balance = await fromUserAccount.getBalance();

  if (balance < amount) {
    return res.status(400).json({
      message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
    });
  }
  let transaction;
  let session;
  try {
    /**
     * 5. Create transaction (PENDING)
     */
    session = await mongoose.startSession();
    session.startTransaction();

    transaction = (
      await transactionModel.create(
        [
          {
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING",
          },
        ],
        { session },
      )
    )[0];

    const debitLedgerEntry = await ledgerModel.create(
      [
        {
          account: fromAccount,
          amount: amount,
          transaction: transaction._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    const creditLedgerEntry = await ledgerModel.create(
      [
        {
          account: toAccount,
          amount: amount,
          transaction: transaction._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    await transactionModel.findOneAndUpdate(
      { _id: transaction._id },
      { status: "COMPLETED" },
      { session },
    );

    await session.commitTransaction();
  } catch (error) {
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(400).json({
      message: "Transaction could not be completed. Please try again.",
    });
  } finally {
    await session?.endSession();
  }
  /**
   * 10. Send email notification
   */
  if (emailEnabled) {
    await emailService.sendTransactionEmail(req.user.email, req.user.username, amount, toAccount);
  }

  return res.status(201).json({
    message: "Transaction completed successfully",
    transaction: transaction,
  });
}

/**
 *
 * Create initial funds transaction
 */
async function createInitialFundsTransaction(req, res) {
  const { toAccount, amount, idempotencyKey } = req.body;

  if (!toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "toAccount, amount and idempotencyKey are required",
    });
  }

  const toUserAccount = await accountModel.findOne({
    _id: toAccount,
  });

  if (!toUserAccount) {
    return res.status(400).json({
      message: "Invalid toAccount",
    });
  }

  const fromUserAccount = await accountModel.findOne({
    user: req.user._id,
  });

  if (!fromUserAccount) {
    return res.status(400).json({
      message: "System user account not found",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  const transaction = new transactionModel({
    fromAccount: fromUserAccount._id,
    toAccount,
    amount,
    idempotencyKey,
    status: "PENDING",
  });

  const debitLedgerEntry = await ledgerModel.create(
    [
      {
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT",
      },
    ],
    { session },
  );

  const creditLedgerEntry = await ledgerModel.create(
    [
      {
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT",
      },
    ],
    { session },
  );

  transaction.status = "COMPLETED";
  await transaction.save({ session });

  await session.commitTransaction();
  session.endSession();

  return res.status(201).json({
    message: "Initial funds transaction completed successfully",
    transaction: transaction,
  });
}

async function addFundsToAccount(req, res) {
  const { accountId, amount, idempotencyKey } = req.body;

  if (!accountId || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "accountId, amount and idempotencyKey are required",
    });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      message: "Amount must be a positive number",
    });
  }

  const targetAccount = await accountModel.findOne({
    _id: accountId,
    user: req.user._id,
  });

  if (!targetAccount) {
    return res.status(404).json({
      message: "Account not found for this user",
    });
  }

  const existingTransaction = await transactionModel.findOne({
    idempotencyKey,
  });

  if (existingTransaction) {
    return res.status(200).json({
      message: "Funds already added",
      transaction: existingTransaction,
    });
  }

  const { systemAccount } = await getOrCreateSystemFundingAccount();
  let session;
  let transaction;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    transaction = (
      await transactionModel.create(
        [
          {
            fromAccount: systemAccount._id,
            toAccount: targetAccount._id,
            amount: numericAmount,
            idempotencyKey,
            status: "PENDING",
          },
        ],
        { session },
      )
    )[0];

    await ledgerModel.create(
      [
        {
          account: systemAccount._id,
          amount: numericAmount,
          transaction: transaction._id,
          type: "DEBIT",
        },
      ],
      { session },
    );

    await ledgerModel.create(
      [
        {
          account: targetAccount._id,
          amount: numericAmount,
          transaction: transaction._id,
          type: "CREDIT",
        },
      ],
      { session },
    );

    await transactionModel.findOneAndUpdate(
      { _id: transaction._id },
      { status: "COMPLETED" },
      { session },
    );

    await session.commitTransaction();
  } catch (error) {
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(500).json({
      message: "Unable to add funds right now. Please try again.",
    });
  } finally {
    await session?.endSession();
  }

  return res.status(201).json({
    message: "Funds added successfully",
    transaction,
  });
}

async function getUserTransactions(req, res) {
  const accounts = await accountModel.find({ user: req.user._id }).select("_id").lean();
  const accountIds = accounts.map((account) => account._id);
  const transactions = await transactionModel
    .find({
      $or: [
        { fromAccount: { $in: accountIds } },
        { toAccount: { $in: accountIds } },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({ transactions });
}

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
  addFundsToAccount,
  getUserTransactions,
};
