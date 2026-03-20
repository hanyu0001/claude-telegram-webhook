# claude-telegram-webhook

Webhook-based Telegram bot that routes messages to Claude API. Designed as an open-source alternative to Claude Code channel plugins.

## Quick start (local)

1. **Install deps**

```bash
npm install
```

2. **Create env**

```bash
cp .env.example .env
```

Fill in:
- `TELEGRAM_BOT_TOKEN`
- `ANTHROPIC_API_KEY`
- `BASE_URL` (your reachable URL; local testing requires tunneling, e.g. ngrok)

3. **Run**

```bash
npm start
```

4. **Install webhook**

```bash
curl -X POST http://localhost:3030/telegram/webhook/install
```

5. **Pairing flow**
- Default policy is `pairing`.
- DM your bot. It will reply with a pairing code.
- Approve code:

```bash
curl -X POST http://localhost:3030/access/pair \
  -H "Content-Type: application/json" \
  -d '{"code":"<CODE>"}'
```

After pairing, your user ID is allowlisted.

## Access management

- Get current access state:

```bash
curl http://localhost:3030/access
```

- Switch policy:

```bash
curl -X POST http://localhost:3030/access/policy \
  -H "Content-Type: application/json" \
  -d '{"mode":"allowlist"}'
```

- Add allowlist:

```bash
curl -X POST http://localhost:3030/access/allow \
  -H "Content-Type: application/json" \
  -d '{"senderId":"1387964966"}'
```

## Notes

- Telegram requires a public HTTPS URL for webhooks. Use ngrok or a real domain.
- Telegram enforces a 4096 char limit; responses auto-chunk.
- This project is local-only and does not persist message history.

## License

MIT
