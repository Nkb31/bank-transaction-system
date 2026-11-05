const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport(
  process.env.EMAIL_PASS
    ? {
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      }
    : {
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: process.env.EMAIL_USER,
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
          refreshToken: process.env.REFRESH_TOKEN,
        },
      },
);

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Error connecting to email server:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
});

// Function to send email
const sendEmail = async (to, subject, text, html, { required = false } = {}) => {
  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    if (required) throw error;
  }
};

async function sendVerificationEmail(userEmail, name, verificationToken) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const verificationUrl = `${frontendUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const subject = "Verify your Bank Transaction System email";
  const text = `Hello ${name},\n\nVerify your email address by opening this link:\n${verificationUrl}\n\nThis link expires in 24 hours.`;
  const html = `<p>Hello ${name},</p><p>Verify your email address by clicking the button below.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours.</p>`;

  await sendEmail(userEmail, subject, text, html, { required: true });
}

async function sendLoginOtpEmail(userEmail, name, otp) {
  const subject = "Your Bank Transaction System login code";
  const text = `Hello ${name},\n\nYour login verification code is ${otp}. It expires in 10 minutes.`;
  const html = `<p>Hello ${name},</p><p>Your login verification code is:</p><h2>${otp}</h2><p>This code expires in 10 minutes.</p>`;
  await sendEmail(userEmail, subject, text, html, { required: true });
}

async function sendPasswordResetOtpEmail(userEmail, name, otp) {
  const subject = "Your password reset code";
  const text = `Hello ${name},\n\nYour password reset code is ${otp}. It expires in 10 minutes.`;
  const html = `<p>Hello ${name},</p><p>Your password reset code is:</p><h2>${otp}</h2><p>This code expires in 10 minutes.</p>`;
  await sendEmail(userEmail, subject, text, html, { required: true });
}

async function sendRegistrationEmail(userEmail, name) {
  const subject = "Welcome to Backend Ledger!";
  const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Successful!";
  const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Failed";
  const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Ledger Team`;
  const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {
  sendRegistrationEmail,
  sendVerificationEmail,
  sendLoginOtpEmail,
  sendPasswordResetOtpEmail,
  sendTransactionEmail,
  sendTransactionFailureEmail,
};
