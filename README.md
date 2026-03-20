# claude-telegram-webhook

Webhook-based Telegram bot that routes messages to Claude API. Designed as an open-source alternative to Claude Code channel plugins.

## Requirements

- Node.js >= 18
- Telegram Bot token (from @BotFather)
- Anthropic API key
- A public HTTPS URL for Telegram webhook (ngrok for local dev)

## Quick start (local + ngrok)

### 1) Install dependencies

```bash
npm install
```

### 2) Create env file

```bash
cp .env.example .env
```

Fill in:
- `TELEGRAM_BOT_TOKEN`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL` (optional for third-party Anthropic-compatible endpoints)
- `ANTHROPIC_MODEL` (optional override)

### 3) Start the server

```bash
npm start
```

The server listens on `http://localhost:3030` by default.

### 4) Expose a public HTTPS URL with ngrok

Install ngrok and start a tunnel:

```bash
ngrok http 3030
```

You will get a public HTTPS URL like:

```
https://abcd-1234.ngrok-free.app
```

Update `.env`:

```
BASE_URL=https://abcd-1234.ngrok-free.app
```

Restart the server after changing `.env`.

### 5) Install Telegram webhook

```bash
curl -X POST http://localhost:3030/telegram/webhook/install
```

This registers:

```
<BASE_URL>/telegram/webhook
```

### 6) Pairing flow

Default policy is `pairing`.

1. DM your bot in Telegram.
2. The bot replies with a pairing code.
3. Approve the code:

```bash
curl -X POST http://localhost:3030/access/pair \
  -H "Content-Type: application/json" \
  -d '{"code":"<CODE>"}'
```

After pairing, your user ID is allowlisted.

## Access management

### Check access state

```bash
curl http://localhost:3030/access
```

### Switch policy

```bash
curl -X POST http://localhost:3030/access/policy \
  -H "Content-Type: application/json" \
  -d '{"mode":"allowlist"}'
```

Valid modes: `pairing`, `allowlist`, `disabled`.

### Allow a user directly

```bash
curl -X POST http://localhost:3030/access/allow \
  -H "Content-Type: application/json" \
  -d '{"senderId":"1387964966"}'
```

### Remove a user

```bash
curl -X POST http://localhost:3030/access/remove \
  -H "Content-Type: application/json" \
  -d '{"senderId":"1387964966"}'
```

## Environment variables

```
TELEGRAM_BOT_TOKEN=...
ANTHROPIC_API_KEY=...
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-3-5-sonnet-20240620
SYSTEM_PROMPT=You are Claude. Reply concisely.
PORT=3030
WEBHOOK_PATH=/telegram/webhook
BASE_URL=https://your-public-url
```

## Third-party Anthropic-compatible APIs

If you use a compatible provider, set:

```
ANTHROPIC_BASE_URL=https://your-provider.example.com/apps/anthropic
ANTHROPIC_MODEL=your-model-name
```

## Common issues

### Telegram does not respond

- Ensure the server is running and reachable from the internet.
- Ensure `BASE_URL` is HTTPS (Telegram requires HTTPS for webhooks).
- Reinstall the webhook after changing `BASE_URL`:
  ```bash
  curl -X POST http://localhost:3030/telegram/webhook/install
  ```

### Webhook conflicts

If another webhook is set, replace it by re-running the install endpoint above.

### Wrong bot token

Validate with:

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"
```

## License

MIT
