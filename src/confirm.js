const fs = require('fs')
const path = require('path')

const { STATE_DIR } = require('./access')

const CONFIRM_FILE = path.join(STATE_DIR, 'confirm.json')
const DEFAULT_TTL_MINUTES = 60

function readConfirmFile() {
  try {
    const raw = fs.readFileSync(CONFIRM_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    return {}
  }
}

function saveConfirmFile(data) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const tmp = `${CONFIRM_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmp, CONFIRM_FILE)
}

function getPending(chatId, ttlMinutes = DEFAULT_TTL_MINUTES) {
  const data = readConfirmFile()
  const item = data[chatId]
  if (!item) return null
  const expiresAt = item.createdAt + ttlMinutes * 60 * 1000
  if (Date.now() > expiresAt) {
    delete data[chatId]
    saveConfirmFile(data)
    return null
  }
  return item
}

function setPending(chatId, value) {
  const data = readConfirmFile()
  data[chatId] = { ...value, createdAt: Date.now() }
  saveConfirmFile(data)
}

function clearPending(chatId) {
  const data = readConfirmFile()
  if (data[chatId]) {
    delete data[chatId]
    saveConfirmFile(data)
  }
}

module.exports = {
  getPending,
  setPending,
  clearPending
}
