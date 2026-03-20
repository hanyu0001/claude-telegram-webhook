const fs = require('fs')
const path = require('path')

const STATE_DIR = path.join(process.env.CLAUDE_TG_STATE_DIR || process.cwd(), '.state')
const ACCESS_FILE = path.join(STATE_DIR, 'access.json')

function defaultAccess() {
  return {
    dmPolicy: 'pairing',
    allowFrom: [],
    pending: {},
    ackReaction: '👀',
    replyToMode: 'first',
    textChunkLimit: 4096,
    chunkMode: 'length'
  }
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true })
}

function readAccessFile() {
  try {
    const raw = fs.readFileSync(ACCESS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      dmPolicy: parsed.dmPolicy ?? 'pairing',
      allowFrom: parsed.allowFrom ?? [],
      pending: parsed.pending ?? {},
      ackReaction: parsed.ackReaction ?? '👀',
      replyToMode: parsed.replyToMode ?? 'first',
      textChunkLimit: parsed.textChunkLimit ?? 4096,
      chunkMode: parsed.chunkMode ?? 'length'
    }
  } catch (err) {
    if (err.code === 'ENOENT') return defaultAccess()
    const backup = `${ACCESS_FILE}.corrupt-${Date.now()}`
    try { fs.renameSync(ACCESS_FILE, backup) } catch {}
    return defaultAccess()
  }
}

function saveAccessFile(access) {
  ensureStateDir()
  const tmp = `${ACCESS_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(access, null, 2) + '\n')
  fs.renameSync(tmp, ACCESS_FILE)
}

function pruneExpired(access) {
  const now = Date.now()
  let changed = false
  for (const [code, p] of Object.entries(access.pending || {})) {
    if (p.expiresAt < now) {
      delete access.pending[code]
      changed = true
    }
  }
  return changed
}

function gate({ fromId, chatId, chatType }) {
  const access = readAccessFile()
  if (pruneExpired(access)) saveAccessFile(access)

  if (access.dmPolicy === 'disabled') return { action: 'drop' }

  if (chatType === 'private') {
    if (access.allowFrom.includes(fromId)) return { action: 'deliver', access }
    if (access.dmPolicy === 'allowlist') return { action: 'drop' }

    for (const [code, p] of Object.entries(access.pending)) {
      if (p.senderId === fromId) {
        if ((p.replies ?? 1) >= 2) return { action: 'drop' }
        p.replies = (p.replies ?? 1) + 1
        saveAccessFile(access)
        return { action: 'pair', code, isResend: true }
      }
    }

    if (Object.keys(access.pending).length >= 3) return { action: 'drop' }

    const code = [...Array(6)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
    const now = Date.now()
    access.pending[code] = {
      senderId: fromId,
      chatId,
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000,
      replies: 1
    }
    saveAccessFile(access)
    return { action: 'pair', code, isResend: false }
  }

  return { action: 'drop' }
}

function approvePair(code) {
  const access = readAccessFile()
  const pending = access.pending[code]
  if (!pending) return { ok: false, reason: 'not_found' }
  if (!access.allowFrom.includes(pending.senderId)) access.allowFrom.push(pending.senderId)
  delete access.pending[code]
  saveAccessFile(access)
  return { ok: true, senderId: pending.senderId, chatId: pending.chatId }
}

module.exports = {
  readAccessFile,
  saveAccessFile,
  gate,
  approvePair,
  STATE_DIR,
  ACCESS_FILE
}
