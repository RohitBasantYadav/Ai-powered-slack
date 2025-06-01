/**
 * Email service stub for notifications
 * Note: This is a stub implementation for v1. Real email functionality can be added later.
 */

/**
 * Send notification email
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.text - Plain text content
 * @param {String} options.html - HTML content
 * @returns {Promise} Promise resolving to a success message
 */
exports.sendNotificationEmail = async (options) => {
  // Log email that would be sent (for development)
  console.log('Email notification stub:');
  console.log('To:', options.to);
  console.log('Subject:', options.subject);
  console.log('Text:', options.text);
  
  // In a real implementation, this would use a service like Nodemailer, SendGrid, etc.
  // For v1, we're just stubbing this functionality
  
  return {
    success: true,
    message: 'Email notification would be sent (stub)'
  };
};

/**
 * Send welcome email
 * @param {Object} user - User object
 * @returns {Promise} Promise resolving to a success message
 */
exports.sendWelcomeEmail = async (user) => {
  return exports.sendNotificationEmail({
    to: user.email,
    subject: 'Welcome to Slack Clone',
    text: `Hi ${user.display_name},\n\nWelcome to Slack Clone! We're excited to have you on board.\n\nBest regards,\nThe Slack Clone Team`,
    html: `<h1>Welcome to Slack Clone!</h1><p>Hi ${user.display_name},</p><p>We're excited to have you on board.</p><p>Best regards,<br>The Slack Clone Team</p>`
  });
};

/**
 * Send mention notification email
 * @param {Object} options - Notification options
 * @param {Object} options.recipient - User being mentioned
 * @param {Object} options.sender - User who mentioned
 * @param {Object} options.message - Message object
 * @param {Object} options.channel - Channel object
 * @returns {Promise} Promise resolving to a success message
 */
exports.sendMentionEmail = async (options) => {
  const { recipient, sender, message, channel } = options;
  
  return exports.sendNotificationEmail({
    to: recipient.email,
    subject: `You were mentioned by ${sender.display_name} in Slack Clone`,
    text: `Hi ${recipient.display_name},\n\n${sender.display_name} mentioned you in ${channel.name}:\n\n"${message.content}"\n\nBest regards,\nThe Slack Clone Team`,
    html: `<h1>You were mentioned</h1><p>Hi ${recipient.display_name},</p><p>${sender.display_name} mentioned you in ${channel.name}:</p><blockquote>${message.content}</blockquote><p>Best regards,<br>The Slack Clone Team</p>`
  });
}; 