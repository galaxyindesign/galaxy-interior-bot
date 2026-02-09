/**
 * Galaxy Interior Design - FB to Telegram Bridge (v2)
 * Compatible with OpenClaw polling mode
 */

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'galaxy_interior_2026_secure_token';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8277180768:AAGhumEKhOx3-T5zad6QuPSgRwBYF0WPj2Q';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-5152890283';

app.use(bodyParser.json());

// In-memory storage for message mapping
// telegram_message_id → fb_user_id
const messageMapping = {};

// Store FB user info
const fbUserCache = {};

// Webhook verification (Facebook requirement)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verification failed');
    res.sendStatus(403);
  }
});

// Webhook handler - 收到 Facebook message
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    // 快速回應 Facebook (required within 20 seconds)
    res.status(200).send('EVENT_RECEIVED');
    
    // 異步處理 messages
    body.entry.forEach(async entry => {
      const webhookEvent = entry.messaging[0];
      const senderId = webhookEvent.sender.id;
      
      if (webhookEvent.message && webhookEvent.message.text) {
        const userMessage = webhookEvent.message.text;
        await forwardToTelegram(senderId, userMessage);
      }
    });
  } else {
    res.sendStatus(404);
  }
});

// Forward FB message 去 Telegram Group
async function forwardToTelegram(fbUserId, message) {
  try {
    // 拎 FB user info (name)
    const userName = await getFBUserName(fbUserId);
    
    // Format message for Telegram
    const telegramMessage = `📱 **FB 客戶查詢**\n\n👤 ${userName}\n🆔 \`${fbUserId}\`\n\n💬 ${message}\n\n---\n_Reply 呢個 message 會自動 send 返去 FB_`;
    
    // Send 去 Telegram group (用 Bot API，唔係 webhook)
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_GROUP_ID,
        text: telegramMessage,
        parse_mode: 'Markdown'
      }
    );
    
    // Store message_id mapping
    const telegramMessageId = response.data.result.message_id;
    messageMapping[telegramMessageId] = fbUserId;
    
    console.log(`✅ [${userName}] Message forwarded to Telegram (msg_id: ${telegramMessageId})`);
    console.log(`📝 Mapping stored: ${telegramMessageId} → ${fbUserId}`);
    
  } catch (error) {
    console.error('❌ Forward to Telegram failed:', error.response?.data || error.message);
  }
}

// Get FB user name
async function getFBUserName(userId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${userId}`,
      {
        params: {
          fields: 'first_name,last_name',
          access_token: PAGE_ACCESS_TOKEN
        }
      }
    );
    
    const { first_name, last_name } = response.data;
    return `${first_name} ${last_name}`;
  } catch (error) {
    console.error('Get FB user name failed:', error.message);
    return `User ${userId}`;
  }
}

// Send reply back to Facebook
// G仔 會 call 呢個 endpoint
app.post('/send-reply', async (req, res) => {
  const { telegram_message_id, reply_text } = req.body;
  
  if (!telegram_message_id || !reply_text) {
    return res.status(400).json({ 
      error: 'Missing telegram_message_id or reply_text' 
    });
  }
  
  // Get FB user ID from mapping
  const fbUserId = messageMapping[telegram_message_id];
  
  if (!fbUserId) {
    return res.status(404).json({ 
      error: 'Message mapping not found',
      telegram_message_id 
    });
  }
  
  try {
    await sendMessageToFacebook(fbUserId, reply_text);
    res.json({ 
      success: true,
      fb_user_id: fbUserId,
      message: 'Reply sent to Facebook'
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Send message 去 Facebook
async function sendMessageToFacebook(recipientId, messageText) {
  try {
    await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    console.log(`✅ [${recipientId}] Message sent to Facebook`);
  } catch (error) {
    console.error('❌ Send to Facebook failed:', error.response?.data || error.message);
    throw error;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    telegram_group: TELEGRAM_GROUP_ID,
    mappings_count: Object.keys(messageMapping).length,
    mappings: messageMapping
  });
});

app.listen(PORT, () => {
  console.log(`🤖 Galaxy Interior Telegram Bridge v2 running on port ${PORT}`);
  console.log(`📍 FB Webhook: /webhook`);
  console.log(`📍 Send Reply: POST /send-reply`);
  console.log(`📍 Health: GET /health`);
  console.log(`📱 Forwarding to Telegram Group: ${TELEGRAM_GROUP_ID}`);
  console.log(`⚠️  Using Telegram Bot API (polling mode compatible)`);
});

module.exports = app;
