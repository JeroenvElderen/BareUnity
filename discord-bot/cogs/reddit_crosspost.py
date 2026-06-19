import os

import aiohttp
import discord
import praw
from discord import app_commands
from discord.ext import commands

CROSSPOST_FORUM_ID = int(os.getenv("DISCORD_CROSSPOST_FORUM_ID", "1515845739870425208"))
BAREUNITY_API_BASE_URL = os.getenv("BAREUNITY_API_BASE_URL", "https://bareunity.com").rstrip("/")
BAREUNITY_DISCORD_SECRET = os.getenv("BAREUNITY_DISCORD_SECRET") or os.getenv("DISCORD_CROSSPOST_SECRET")
REDDIT_SUBREDDIT = os.getenv("REDDIT_SUBREDDIT")


class RedditCrosspost(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.reddit = self.build_reddit_client()

    def build_reddit_client(self):
        required = [
            "REDDIT_CLIENT_ID",
            "REDDIT_CLIENT_SECRET",
            "REDDIT_USERNAME",
            "REDDIT_PASSWORD",
            "REDDIT_USER_AGENT",
        ]
        if not all(os.getenv(name) for name in required):
            return None

        return praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            username=os.getenv("REDDIT_USERNAME"),
            password=os.getenv("REDDIT_PASSWORD"),
            user_agent=os.getenv("REDDIT_USER_AGENT"),
        )

    def integration_headers(self):
        if not BAREUNITY_DISCORD_SECRET:
            return None

        return {
            "Content-Type": "application/json",
            "x-bareunity-discord-secret": BAREUNITY_DISCORD_SECRET,
        }

    async def post_bareunity_api(self, path, payload, method="POST"):
        headers = self.integration_headers()
        if not headers:
            raise RuntimeError("BAREUNITY_DISCORD_SECRET or DISCORD_CROSSPOST_SECRET is not configured.")

        async with aiohttp.ClientSession(headers=headers) as session:
            request = session.post if method == "POST" else session.patch
            async with request(f"{BAREUNITY_API_BASE_URL}{path}", json=payload) as response:
                response_text = await response.text()
                try:
                    data = await response.json(content_type=None)
                except Exception:
                    data = None

                if response.status >= 300:
                    if isinstance(data, dict) and data.get("error"):
                        raise RuntimeError(data["error"])

                    body_preview = response_text.strip().replace("\n", " ")[:200]
                    if body_preview:
                        raise RuntimeError(f"BareUnity API returned {response.status}: {body_preview}")

                    raise RuntimeError(f"BareUnity API returned {response.status}")

                if not isinstance(data, dict):
                    body_preview = response_text.strip().replace("\n", " ")[:200]
                    raise RuntimeError(f"BareUnity API returned a non-JSON response: {body_preview or 'empty response'}")

                return data

    async def fetch_starter_message(self, thread: discord.Thread):
        try:
            return await thread.fetch_message(thread.id)
        except Exception:
            pass

        async for message in thread.history(oldest_first=True, limit=1):
            return message

        return None

    def attachment_payload(self, message: discord.Message):
        return [
            {
                "url": attachment.url,
                "contentType": attachment.content_type,
                "filename": attachment.filename,
            }
            for attachment in message.attachments
        ]

    async def submit_to_reddit(self, title, website_post_url):
        if not self.reddit or not REDDIT_SUBREDDIT:
            return None

        submission = await self.bot.loop.run_in_executor(
            None,
            lambda: self.reddit.subreddit(REDDIT_SUBREDDIT).submit(title=title[:300], url=website_post_url),
        )
        return {
            "id": submission.id,
            "url": f"https://www.reddit.com{submission.permalink}",
        }

    async def record_reddit_result(self, discord_thread_id, reddit_result=None, error=None):
        payload = {
            "discordThreadId": str(discord_thread_id),
            "status": "reddit_posted" if reddit_result else "reddit_failed",
            "redditPostId": reddit_result.get("id") if reddit_result else None,
            "redditUrl": reddit_result.get("url") if reddit_result else None,
            "error": str(error)[:1000] if error else None,
        }
        await self.post_bareunity_api("/api/integrations/discord/crosspost", payload, method="PATCH")

    @app_commands.command(
        name="register",
        description="Moderator: opt a Discord member into BareUnity cross-posting",
    )
    @app_commands.default_permissions(manage_messages=True)
    async def register(self, interaction: discord.Interaction, member: discord.Member):
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.response.send_message("❌ Moderator only.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)

        payload = {
            "discordUserId": str(member.id),
            "discordUsername": member.name,
            "discordDisplayName": member.display_name,
            "registeredByDiscordUserId": str(interaction.user.id),
            "registeredByDiscordUsername": interaction.user.name,
        }

        try:
            result = await self.post_bareunity_api(
                "/api/integrations/discord/crosspost/register",
                payload,
            )
        except Exception as exc:
            await interaction.followup.send(f"❌ Registration failed: {exc}", ephemeral=True)
            return

        if result.get("linked"):
            await interaction.followup.send(
                f"✅ {member.mention} is opted in and linked to BareUnity profile "
                f"`{result.get('bareunityUsername')}`.",
                ephemeral=True,
            )
        else:
            await interaction.followup.send(
                f"⚠️ {member.mention} is opted in, but no Discord-linked BareUnity account was found. "
                "Website posts will use the BareUnity fallback author with a Discord member note.",
                ephemeral=True,
            )

    @commands.Cog.listener()
    async def on_thread_create(self, thread: discord.Thread):
        if thread.parent_id != CROSSPOST_FORUM_ID:
            return

        starter_message = await self.fetch_starter_message(thread)
        if not starter_message or starter_message.author.bot:
            return

        payload = {
            "discordChannelId": str(thread.parent_id),
            "discordThreadId": str(thread.id),
            "discordThreadUrl": thread.jump_url,
            "discordAuthorId": str(starter_message.author.id),
            "discordAuthorDisplayName": starter_message.author.display_name,
            "title": thread.name,
            "content": starter_message.content,
            "attachments": self.attachment_payload(starter_message),
        }

        try:
            result = await self.post_bareunity_api("/api/integrations/discord/crosspost", payload)
        except Exception as exc:
            print(f"BareUnity crosspost failed for {thread.id}: {exc}")
            return

        if result.get("skipped") or result.get("duplicate"):
            return

        website_post_url = result.get("websitePostUrl")
        if not website_post_url:
            return

        try:
            reddit_result = await self.submit_to_reddit(thread.name, website_post_url)
            if reddit_result:
                await self.record_reddit_result(thread.id, reddit_result=reddit_result)
        except Exception as exc:
            print(f"Reddit crosspost failed for {thread.id}: {exc}")
            try:
                await self.record_reddit_result(thread.id, error=exc)
            except Exception as record_exc:
                print(f"Could not record Reddit failure for {thread.id}: {record_exc}")

    @commands.Cog.listener()
    async def on_ready(self):
        try:
            self.bot.tree.add_command(self.register)
        except Exception:
            pass


async def setup(bot):
    await bot.add_cog(RedditCrosspost(bot))