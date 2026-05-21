// controllers/authController.js - Authentication Controller (Full)
const User = require('../models/User');
const { generateToken, generateRefreshToken, blacklistToken } = require('../middleware/auth');
const { getRedisManager } = require('../config/redis');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const redisManager = getRedisManager();

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, email, password, fullName, phoneNumber } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username or email already exists',
        code: 'USER_EXISTS'
      });
    }
    
    // Create new user
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      fullName: fullName || username,
      phoneNumber
    });
    
    await user.save();
    
    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    
    // Send verification email
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: 'Verify Your Email - ZASS Ecosystem',
      html: `
        <h1>Welcome to ZASS Ecosystem!</h1>
        <p>Click the link below to verify your email:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link expires in 24 hours.</p>
      `
    });
    
    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Store refresh token in Redis
    await redisManager.set(`refresh:${user._id}`, refreshToken, 90 * 24 * 60 * 60);
    
    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role
      },
      message: 'Registration successful! Please verify your email.'
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    
    // Find user
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Check password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      // Increment failed attempts
      user.stats.loginCount = (user.stats.loginCount || 0) + 1;
      await user.save();
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Check if email is verified
    if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email first',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }
    
    // Check if account is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Account is ${user.status}`,
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update user
    user.lastLogin = new Date();
    user.lastIP = req.ip;
    user.stats.loginCount = (user.stats.loginCount || 0) + 1;
    
    // Add session
    user.sessions.push({
      token: crypto.randomBytes(32).toString('hex'),
      device: req.headers['user-agent'],
      ip: req.ip,
      lastActive: new Date(),
      createdAt: new Date()
    });
    
    // Keep only last 10 sessions
    if (user.sessions.length > 10) {
      user.sessions = user.sessions.slice(-10);
    }
    
    await user.save();
    
    // Generate tokens
    const expiresIn = rememberMe ? '90d' : '7d';
    const token = generateToken(user, expiresIn);
    const refreshToken = generateRefreshToken(user);
    
    // Store refresh token
    const ttl = rememberMe ? 90 * 24 * 60 * 60 : 7 * 24 * 60 * 60;
    await redisManager.set(`refresh:${user._id}`, refreshToken, ttl);
    
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        emailVerified: user.emailVerified,
        preferences: user.preferences,
        stats: user.stats
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    const token = req.token;
    const userId = req.user._id;
    
    // Blacklist current token
    await blacklistToken(token);
    
    // Remove refresh token
    await redisManager.del(`refresh:${userId}`);
    
    // Remove session from user
    const sessionIndex = req.user.sessions.findIndex(s => s.token === token);
    if (sessionIndex !== -1) {
      req.user.sessions.splice(sessionIndex, 1);
      await req.user.save();
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Check if refresh token exists in Redis
    const storedToken = await redisManager.get(`refresh:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    // Get user
    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    // Update refresh token in Redis
    await redisManager.set(`refresh:${user._id}`, newRefreshToken, 90 * 24 * 60 * 60);
    
    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal that user doesn't exist
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a reset link'
      });
    }
    
    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();
    
    // Send reset email
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: 'Password Reset - ZASS Ecosystem',
      html: `
        <h1>Reset Your Password</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
    
    res.json({
      success: true,
      message: 'If your email is registered, you will receive a reset link'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
      code: 'FORGOT_PASSWORD_ERROR'
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token',
        code: 'INVALID_RESET_TOKEN'
      });
    }
    
    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    
    // Blacklist all user sessions
    for (const session of user.sessions) {
      await blacklistToken(session.token);
    }
    user.sessions = [];
    await user.save();
    
    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      code: 'RESET_PASSWORD_ERROR'
    });
  }
};

// Verify email
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token',
        code: 'INVALID_VERIFICATION_TOKEN'
      });
    }
    
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    
    res.json({
      success: true,
      message: 'Email verified successfully! You can now login.'
    });
    
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify email',
      code: 'VERIFY_EMAIL_ERROR'
    });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -sessions -apiKeys');
    
    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
};

// Update current user
exports.updateMe = async (req, res) => {
  try {
    const allowedFields = [
      'fullName', 'bio', 'location', 'website', 'phoneNumber',
      'avatar', 'coverPhoto', 'socialLinks', 'preferences'
    ];
    
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password -sessions -apiKeys');
    
    res.json({
      success: true,
      user,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('Update me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: 'UPDATE_USER_ERROR'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id);
    
    const isValid = await user.comparePassword(oldPassword);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
        code: 'INCORRECT_PASSWORD'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    // Blacklist all sessions except current
    for (const session of user.sessions) {
      if (session.token !== req.token) {
        await blacklistToken(session.token);
      }
    }
    user.sessions = user.sessions.filter(s => s.token === req.token);
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      code: 'CHANGE_PASSWORD_ERROR'
    });
  }
};

// Change email
exports.changeEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    
    const user = await User.findById(req.user._id);
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Password is incorrect',
        code: 'INCORRECT_PASSWORD'
      });
    }
    
    // Check if email is taken
    const existingUser = await User.findOne({ email: newEmail.toLowerCase() });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Email already in use',
        code: 'EMAIL_IN_USE'
      });
    }
    
    user.email = newEmail.toLowerCase();
    user.emailVerified = false;
    
    // Generate new verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    
    // Send verification email
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: 'Verify Your New Email - ZASS Ecosystem',
      html: `
        <h1>Verify Your New Email</h1>
        <p>Click the link below to verify your new email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link expires in 24 hours.</p>
      `
    });
    
    res.json({
      success: true,
      message: 'Email changed. Please verify your new email address.'
    });
    
  } catch (error) {
    console.error('Change email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change email',
      code: 'CHANGE_EMAIL_ERROR'
    });
  }
};

// Enable 2FA
exports.enable2FA = async (req, res) => {
  try {
    const { password } = req.body;
    
    const user = await User.findById(req.user._id);
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Password is incorrect',
        code: 'INCORRECT_PASSWORD'
      });
    }
    
    // Generate 2FA secret
    const secret = crypto.randomBytes(20).toString('hex');
    const backupCodes = [];
    
    // Generate 10 backup codes
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex'));
    }
    
    user.twoFactorSecret = secret;
    user.backupCodes = backupCodes;
    user.twoFactorEnabled = true;
    await user.save();
    
    // Generate QR code URL (for Google Authenticator)
    const qrUrl = `otpauth://totp/ZASS:${user.email}?secret=${secret}&issuer=ZASS`;
    
    res.json({
      success: true,
      secret,
      backupCodes,
      qrUrl,
      message: '2FA enabled successfully. Save your backup codes!'
    });
    
  } catch (error) {
    console.error('Enable 2FA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable 2FA',
      code: 'ENABLE_2FA_ERROR'
    });
  }
};

// Verify 2FA
exports.verify2FA = async (req, res) => {
  try {
    const { code } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Simple verification for demo
    // In production, use speakeasy or similar library
    if (code !== '123456' && !user.backupCodes.includes(code)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid 2FA code',
        code: 'INVALID_2FA_CODE'
      });
    }
    
    // Remove used backup code
    const index = user.backupCodes.indexOf(code);
    if (index !== -1) {
      user.backupCodes.splice(index, 1);
      await user.save();
    }
    
    // Generate session token with 2FA verified
    const token = generateToken(user, '7d');
    
    res.json({
      success: true,
      token,
      message: '2FA verified successfully'
    });
    
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify 2FA',
      code: 'VERIFY_2FA_ERROR'
    });
  }
};

// Disable 2FA
exports.disable2FA = async (req, res) => {
  try {
    const { password } = req.body;
    
    const user = await User.findById(req.user._id);
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Password is incorrect',
        code: 'INCORRECT_PASSWORD'
      });
    }
    
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.backupCodes = [];
    await user.save();
    
    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
    
  } catch (error) {
    console.error('Disable 2FA error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable 2FA',
      code: 'DISABLE_2FA_ERROR'
    });
  }
};

// Social login callback
exports.socialLogin = async (req, res) => {
  try {
    // Passport will attach user to req.user
    const user = req.user;
    
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    
    await redisManager.set(`refresh:${user._id}`, refreshToken, 90 * 24 * 60 * 60);
    
    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}&refreshToken=${refreshToken}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Social login error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }
};
