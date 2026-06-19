# TurboCraig

TurboCraig is a Python 3.12 Discord recording bot for this Discord server. It is intended to be run directly with `python bot.py` by the server owner/moderation team, not as a Dockerized public service.

## Features

- `/record start`, `/record stop`, `/record status`, and `/record transcript` slash commands.
- Moderator-gated recording controls through Discord roles or `manage_guild` permissions.
- One native 48 kHz Discord audio stream per participant, finalized as independent FLAC files.
- Metadata JSON with Discord user IDs, usernames, join/leave timestamps, and track filenames.
- Supabase Storage S3-compatible uploads with signed download URLs.
- PostgreSQL schema for sessions, participant tracks, and transcripts.
- `TranscriptionProvider` interface for TurboScribe today and Whisper, Deepgram, or AssemblyAI later.

## Local development and server run

Run the bot directly from this directory:

```bash
cd discord-bot
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
# edit .env and fill DISCORD_TOKEN, Supabase, and TurboScribe credentials
python scripts/init_db.py
PYTHONPATH=. python bot.py
```

Install these system dependencies before running the commands above:

- Python 3.12
- FFmpeg
- PostgreSQL with a `turbocraig` database/user matching `DATABASE_URL`
- `psql` command-line client for `scripts/init_db.py`

For macOS with Homebrew, the system packages are typically:

```bash
brew install python@3.12 ffmpeg postgresql@16
brew services start postgresql@16
```

For Ubuntu/Debian, the system packages are typically:

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip ffmpeg postgresql postgresql-contrib
```

## Environment variables

Copy `.env.example` to `.env` and fill in the blank values. The example uses `localhost` for PostgreSQL because this project is meant to run without Docker.

Secrets are always read from environment variables and should never be committed.


## Supabase setup

This bot is configured for Supabase Option B: Supabase Postgres stores metadata and Supabase Storage stores the FLAC recordings through its S3-compatible API.

1. In Supabase, copy your Postgres connection string and set it as `DATABASE_URL`. Use the `postgresql+asyncpg://` scheme.
2. In Supabase Storage, create a bucket matching `STORAGE_BUCKET` such as `turbocraig-recordings`.
3. Generate Supabase Storage S3 access keys.
4. Set `STORAGE_ENDPOINT_URL` to `https://<project-ref>.storage.supabase.co/storage/v1/s3`.
5. Set `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` from the Supabase S3 keys.

Example storage values:

```env
STORAGE_ENDPOINT_URL=https://your-project-ref.storage.supabase.co/storage/v1/s3
STORAGE_ACCESS_KEY_ID=your_supabase_s3_access_key_id
STORAGE_SECRET_ACCESS_KEY=your_supabase_s3_secret_access_key
STORAGE_BUCKET=turbocraig-recordings
STORAGE_PUBLIC_BASE_URL=
```

## Moderator access

Set `RECORDING_ROLE_IDS` to a comma-separated list of Discord role IDs that are allowed to run recording commands. Users with Discord `manage_guild` permission are also allowed.

Example:

```env
RECORDING_ROLE_IDS=123456789012345678,234567890123456789
```

## Notes

The TurboScribe HTTP paths are isolated in `transcription/turboscribe.py` so they can be adjusted to the exact account/API contract without changing bot command or recording code. The bot records separate files during capture and never mixes speakers into one file.

## Project structure

```text
bot.py            main entrypoint: run with `PYTHONPATH=. python bot.py`
commands/         Discord slash commands
services/         recording orchestration
transcription/    provider abstraction and TurboScribe implementation
storage/          Supabase/S3-compatible storage
database/         schema and database helpers
models/           domain entities
utils/            configuration and logging
migrations/       SQL migrations
scripts/          local helper scripts
```
