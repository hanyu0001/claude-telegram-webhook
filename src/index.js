const fs = require('fs')
const path = require('path')
const express = require('express')
require('dotenv').config()

const { gate, approvePair, readAccessFile, saveAccessFile } = require('./access')

const app = express()
app.use(express.json({ limit: '2mb' }))

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
const PORT = process.env.PORT || 3030
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/telegram/webhook'
const BASE_URL = process.env.BASE_URL
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'You are Claude. Reply concisely.'

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN')
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

async function telegram(method, body) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) {
    const msg = data.description || `Telegram ${method} failed`
    throw new Error(msg)
  }
  return data.result
}

function chunk(text, limit) {
  if (text.length <= limit) return [text]
  const out = []
  let rest = text
  while (rest.length > limit) {
    out.push(rest.slice(0, limit))
    rest = rest.slice(limit)
  }
  if (rest) out.push(rest)
  return out
}

async function callClaude(text, userId) {
  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `From Telegram user ${userId}: ${text}` }
      ]
    })
  })
  const data = await res.json()
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.message || 'Claude API error'
    throw new Error(errMsg)
  }
  const content = data.content || []
  const textParts = content.filter(p => p.type === 'text').map(p => p.text).join('')
  return textParts || '(no response)'
}

app.get('/', (req, res) => {
  res.send('ok')
})

app.post('/access/pair', async (req, res) => {
  const { code } = req.body || {}
  if (!code) return res.status(400).json({ ok: false, error: 'code_required' })
  const result = approvePair(code)
  if (!result.ok) return res.status(404).json({ ok: false, error: 'not_found' })
  try {
    await telegram('sendMessage', {
      chat_id: result.chatId,
      text: 'Paired! Say hi to Claude.'
    })
  } catch (err) {
    console.error('sendMessage failed', err.message)
  }
  res.json({ ok: true })
})

app.post(WEBHOOK_PATH, async (req, res) => {
  res.json({ ok: true })

  const update = req.body
  const message = update.message || update.edited_message
  if (!message) return

  const chat = message.chat
  const from = message.from
  if (!chat || !from) return

  const chatId = String(chat.id)
  const fromId = String(from.id)
  const chatType = chat.type
  const text = message.text || message.caption || ''

  const gateResult = gate({ fromId, chatId, chatType })
  if (gateResult.action === 'drop') return

  if (gateResult.action === 'pair') {
    const lead = gateResult.isResend ? 'Still pending' : 'Pairing required'
    await telegram('sendMessage', {
      chat_id: chatId,
      text: `${lead} — approve with: POST /access/pair { code: ${gateResult.code} }`
    })
    return
  }

  try {
    if (gateResult.access?.ackReaction && message.message_id) {
      await telegram('setMessageReaction', {
        chat_id: chatId,
        message_id: message.message_id,
        reaction: [{ type: 'emoji', emoji: gateResult.access.ackReaction }]
      })
    }
  } catch {}

  try {
    const reply = await callClaude(text, fromId)
    const limit = Math.max(1, Math.min(gateResult.access?.textChunkLimit || 4096, 4096))
    const parts = chunk(reply, limit)
    for (const part of parts) {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: part
      })
    }
  } catch (err) {
    console.error('Processing failed', err.message)
    try {
      await telegram('sendMessage', {
        chat_id: chatId,
        text: 'Claude API error. Check server logs.'
      })
    } catch {}
  }
})

app.post('/telegram/webhook/install', async (req, res) => {
  if (!BASE_URL) return res.status(400).json({ ok: false, error: 'BASE_URL required' })
  const url = `${BASE_URL}${WEBHOOK_PATH}`
  try {
    const result = await telegram('setWebhook', { url })
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/telegram/webhook/remove', async (req, res) => {
  try {
    const result = await telegram('deleteWebhook', {})
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/access', (req, res) => {
  res.json(readAccessFile())
})

app.post('/access/policy', (req, res) => {
  const { mode } = req.body || {}
  if (!['pairing', 'allowlist', 'disabled'].includes(mode)) {
    return res.status(400).json({ ok: false, error: 'invalid_mode' })
  }
  const access = readAccessFile()
  access.dmPolicy = mode
  saveAccessFile(access)
  res.json({ ok: true, access })
})

app.post('/access/allow', (req, res) => {
  const { senderId } = req.body || {}
  if (!senderId) return res.status(400).json({ ok: false, error: 'senderId_required' })
  const access = readAccessFile()
  if (!access.allowFrom.includes(String(senderId))) access.allowFrom.push(String(senderId))
  saveAccessFile(access)
  res.json({ ok: true, access })
})

app.post('/access/remove', (req, res) => {
  const { senderId } = req.body || {}
  if (!senderId) return res.status(400).json({ ok: false, error: 'senderId_required' })
  const access = readAccessFile()
  access.allowFrom = access.allowFrom.filter(id => id !== String(senderId))
  saveAccessFile(access)
  res.json({ ok: true, access })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Webhook path: ${WEBHOOK_PATH}`)
})
