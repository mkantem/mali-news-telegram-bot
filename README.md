# Mali News Telegram Bot

A small, draft-first Telegram bot that monitors selected Mali-related RSS feeds, deduplicates articles, and sends drafts to an administrator for approval before publishing to a Telegram channel.

## Current sources

- L'Indépendant — `https://lindependant.ml/feed/`
- Afrikinfos Mali — `https://afrikinfos-mali.com/feed/`
- Maliactu — `https://maliactu.net/feed/` (Mali relevance filter enabled)

The bot does not scrape Facebook or X and does not automatically publish. Those integrations may be considered separately after the RSS workflow is proven.

## Runtime configuration

Required environment variables:

- `TELEGRAM_BOT_TOKEN` — secret; set only in Coolify
- `TELEGRAM_ADMIN_CHAT_ID` — your private Telegram chat ID
- `TELEGRAM_CHANNEL_ID` — public channel username or numeric ID

Optional:

- `DATA_DIR` — persistent data directory, default `/data`
- `POLL_INTERVAL_SECONDS` — polling interval, default `1800`

The state file is stored at `$DATA_DIR/state.json` and contains seen article URLs and pending drafts. Mount `/data` as a persistent Coolify volume.

## Local development

```bash
npm ci
npm test
npm run check
```

To run locally, copy `.env.example` to `.env` and fill values locally. Never commit `.env` or real tokens.

## Coolify deployment

1. Create an Application from this GitHub repository.
2. Use Dockerfile deployment and the `main` branch.
3. Add a persistent volume mounted at `/data`.
4. Add the environment variables above. Keep `TELEGRAM_BOT_TOKEN` secret.
5. Deploy and inspect logs for `Mali News Bot started`.

The application starts in draft-only mode. New articles are sent to the administrator with **Approve** and **Skip** buttons. An approved article is then published to the channel with attribution and the original link.

## Security and editorial boundaries

- No credentials or runtime state belong in Git.
- Only the configured administrator chat can approve drafts.
- Summaries use RSS title/excerpt and link to the original source; full articles are not copied.
- Maliactu is filtered for Mali relevance because its feed contains broader content.
- Source errors are logged and polling continues for other sources.
