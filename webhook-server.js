/**
 * Galaxy Interior Design - Facebook/Instagram Webhook Server
 * 智能對話收集客戶資料
 */

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'galaxy_interior_2026_secure_token';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

app.use(bodyParser.json());

// 儲存用戶對話狀態（簡單版 - 重啟會 reset）
const userStates = {};

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook handler
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const webhookEvent = entry.messaging[0];
      const senderId = webhookEvent.sender.id;
      
      if (webhookEvent.message) {
        handleMessage(senderId, webhookEvent.message);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function handleMessage(senderId, message) {
  const userMessage = message.text;
  
  // 初始化用戶狀態
  if (!userStates[senderId]) {
    userStates[senderId] = {
      step: 0,
      data: {}
    };
  }
  
  const userState = userStates[senderId];
  let responseText = '';
  
  // 對話流程
  switch(userState.step) {
    case 0:
      // 第一次見面
      responseText = `你好！我地係Galaxy Interior Design！

感謝你既查詢，如果想更快捷得到回覆，請按以下連結聯絡我們，謝謝~
https://wa.me/85252812215

如果想了解多少少室內設計既資訊，可以到我們youtube channel觀看我地既短片, 可能會令你有更多啓發
https://www.youtube.com/channel/UCETpVM5T2XPTJJL2IcCNCpA

首先我會先收集你要求再交由同事跟進。第一個問題: 請問你想裝修單位既屋苑？`;
      userState.step = 1;
      break;
      
    case 1:
      // 收到屋苑名稱
      userState.data.estate = userMessage;
      responseText = `好！收到：${userMessage}\n\n請問單位面積大約幾多呎？`;
      userState.step = 2;
      break;
      
    case 2:
      // 收到面積
      userState.data.area = userMessage;
      responseText = `明白，${userMessage}\n\n請問你嘅預算大約係幾多？（萬）`;
      userState.step = 3;
      break;
      
    case 3:
      // 收到預算
      userState.data.budget = userMessage;
      responseText = `好！預算${userMessage}\n\n最後，可以俾個電話號碼我哋聯絡你嗎？`;
      userState.step = 4;
      break;
      
    case 4:
      // 收到電話 - 完成收集
      userState.data.phone = userMessage;
      
      responseText = `多謝！已經記錄晒你嘅資料：
📍 地址：${userState.data.estate}
📏 面積：${userState.data.area}
💰 預算：${userState.data.budget}
📞 電話：${userState.data.phone}

同事會盡快聯絡你！如果想更快捷得到回覆，請按以下連結聯絡我們，謝謝~
https://wa.me/85252812215`;
      
      // 記錄資料（之後整合 Google Sheets）
      console.log('客戶資料收集完成:', userState.data);
      
      // Reset 狀態
      userState.step = 0;
      userState.data = {};
      break;
      
    default:
      responseText = '系統錯誤，請重新開始。你好！';
      userState.step = 0;
  }
  
  await sendMessage(senderId, { text: responseText });
}

async function sendMessage(recipientId, message) {
  try {
    await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      {
        recipient: { id: recipientId },
        message: message
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    console.log('Message sent');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Galaxy Interior Bot running on port ${PORT}`);
  console.log('對話流程已啟動！');
});

module.exports = app;
