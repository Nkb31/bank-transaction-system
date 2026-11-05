const userModel = require("../models/user.models");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const tokenBlackListModel = require("../models/blackList.model");
const crypto = require("crypto");
const emailEnabled = process.env.EMAIL_ENABLED === "true";

function hashVerificationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function issueJwt(user, res) {
  const token = jwt.sign({ userID: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" });
  res.cookie("token", token);
  return res.status(200).json({
    user: { _id: user._id, email: user.email, username: user.username },
    token,
  });
}

async function userRegisterController(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const { username, password } = req.body;
  const isExists = await userModel.findOne({
    email: email,
  });
  if (isExists)
    return res.status(422).json({
      message: "User already exists",
      status: "Failed",
    });
  if (!emailEnabled) {
    const user = await userModel.create({ email, username, password, emailVerified: true });
    return issueJwt(user, res);
  }
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const user = await userModel.create({
    email,
    username,
    password,
    emailVerificationTokenHash: hashVerificationToken(verificationToken),
    emailVerificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  try {
    await emailService.sendVerificationEmail(user.email, user.username, verificationToken);
  } catch {
    await userModel.deleteOne({ _id: user._id });
    return res.status(503).json({ message: "We could not send the verification email. Please try again." });
  }

  return res.status(201).json({
    message: "Registration successful. Check your email to verify your account.",
    email: user.email,
  });
}
async function userLoginCOntroller(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const { password } = req.body;
  const user = await userModel.findOne({ email }).select("+password");
  if (!user)
    return res.status(401).json({
      message: "Email or password is incorrect",
    });
  const isValidPassword = await user.comparePassword(password);
  if (!isValidPassword) {
    return res.status(401).json({
      message: "Email or password is incorrect",
    });
  }

  if (emailEnabled && !user.emailVerified) {
    return res.status(403).json({
      message: "Please verify your email address before signing in.",
    });
  }

  if (!emailEnabled) return issueJwt(user, res);

  const otp = createOtp();
  user.loginOtpHash = hashVerificationToken(otp);
  user.loginOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  try {
    await emailService.sendLoginOtpEmail(user.email, user.username, otp);
  } catch {
    return res.status(503).json({ message: "We could not send your login code. Please try again." });
  }
  return res.status(200).json({ requiresOtp: true, email: user.email, message: "A login code was sent to your email." });
}

async function verifyLoginOtpController(req, res) {
  if (!emailEnabled) return res.status(400).json({ message: "Email OTP is disabled in demo mode." });
  const email = req.body.email?.trim().toLowerCase();
  const otp = String(req.body.otp || "").trim();
  const user = await userModel.findOne({ email }).select("+loginOtpHash +loginOtpExpiresAt");
  if (!user || !user.loginOtpHash || !user.loginOtpExpiresAt || user.loginOtpExpiresAt <= new Date() || hashVerificationToken(otp) !== user.loginOtpHash) {
    return res.status(401).json({ message: "Invalid or expired login code." });
  }
  user.loginOtpHash = undefined;
  user.loginOtpExpiresAt = undefined;
  await user.save();
  return issueJwt(user, res);
}

async function requestPasswordResetController(req, res) {
  if (!emailEnabled) return res.status(503).json({ message: "Email services are disabled in demo mode." });
  const email = req.body.email?.trim().toLowerCase();
  const user = await userModel.findOne({ email });
  const response = { message: "If that account exists, a password reset code has been sent." };
  if (!user || !user.emailVerified) return res.status(200).json(response);

  const otp = createOtp();
  user.resetOtpHash = hashVerificationToken(otp);
  user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  try {
    await emailService.sendPasswordResetOtpEmail(user.email, user.username, otp);
  } catch {
    return res.status(503).json({ message: "We could not send the password reset code. Please try again." });
  }
  return res.status(200).json(response);
}

async function resetPasswordController(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
  const user = await userModel.findOne({ email }).select("+password");
  if (!user) return res.status(404).json({ message: "No account was found with that email address." });
  user.password = password;
  user.resetOtpHash = undefined;
  user.resetOtpExpiresAt = undefined;
  await user.save();
  return res.status(200).json({ message: "Password reset successfully. You can now sign in." });
}

async function verifyEmailController(req, res) {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ message: "Verification token is required" });
  }

  const user = await userModel
    .findOne({
      emailVerificationTokenHash: hashVerificationToken(token),
      emailVerificationTokenExpiresAt: { $gt: new Date() },
    })
    .select("+emailVerificationTokenHash +emailVerificationTokenExpiresAt");

  if (!user) {
    return res.status(400).json({ message: "This verification link is invalid or has expired." });
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await user.save();

  return res.status(200).json({ message: "Email verified successfully. You can now sign in." });
}

async function resendVerificationEmailController(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const user = await userModel.findOne({ email });

  if (!user || user.emailVerified) {
    return res.status(200).json({ message: "If that account exists and needs verification, a new email has been sent." });
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  user.emailVerificationTokenHash = hashVerificationToken(verificationToken);
  user.emailVerificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await emailService.sendVerificationEmail(user.email, user.username, verificationToken);
    await user.save();
  } catch {
    return res.status(503).json({ message: "We could not send the verification email. Please try again." });
  }

  return res.status(200).json({ message: "If that account exists and needs verification, a new email has been sent." });
}
async function userLogoutController(req, res) {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(200).json({
      message: "User logged out successfully",
    });
  }

  await tokenBlackListModel.create({
    token: token,
  });

  res.clearCookie("token");

  res.status(200).json({
    message: "User logged out successfully",
  });
}
module.exports = {
  userRegisterController,
  userLoginCOntroller,
  verifyLoginOtpController,
  requestPasswordResetController,
  resetPasswordController,
  verifyEmailController,
  resendVerificationEmailController,
  userLogoutController,
};
