import os

import aiohttp
import discord
import praw
from discord import app_commands
from discord.ext import commands, tasks

DEFAULT_CROSSPOST_FORUM_IDS = "1515845739870425208,1516001611925684265"


def parse_crosspost_forum_ids(value):
    return {
        int(channel_id.strip())
        for channel_id in value.split(",")
        if channel_id.strip()
    }


CROSSPOST_FORUM_IDS = parse_crosspost_forum_ids(
    os.getenv("DISCORD_CROSSPOST_FORUM_IDS")
    or os.getenv("DISCORD_CROSSPOST_FORUM_ID", DEFAULT_CROSSPOST_FORUM_IDS)
)
BAREUNITY_API_BASE_URL = os.getenv("BAREUNITY_API_BASE_URL", "https://bareunity.com").rstrip("/")
SUPABASE_URL = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").rstrip("/")
BAREUNITY_DISCORD_SECRET = os.getenv("BAREUNITY_DISCORD_SECRET") or os.getenv("DISCORD_CROSSPOST_SECRET")
REDDIT_SUBREDDIT = os.getenv("REDDIT_SUBREDDIT")
DISCORD_CROSSPOST_EVENT_POLL_SECONDS = int(os.getenv("DISCORD_CROSSPOST_EVENT_POLL_SECONDS", "5"))
WEBSITE_REVIEW_BUTTONS = {
    "photo-sharing": "Photo sharing",
    "naturist-travel": "Naturist travel",
    "skip-discord-upload": "Skip Discord",
    "delete-post": "Delete post",
}


class RedditCrosspost(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.reddit = self.build_reddit_client()
        self.sync_by_thread = {}
        self.event_poller.change_interval(seconds=DISCORD_CROSSPOST_EVENT_POLL_SECONDS)
        self.event_poller.start()


    def cog_unload(self):
        self.event_poller.cancel()

    async def fetch_bareunity_api(self, path):
        headers = self.integration_headers()
        if not headers:
            raise RuntimeError("BAREUNITY_DISCORD_SECRET or DISCORD_CROSSPOST_SECRET is not configured.")

        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(f"{BAREUNITY_API_BASE_URL}{path}") as response:
                response_text = await response.text()
                try:
                    data = await response.json(content_type=None)
                except Exception:
                    data = None
                if response.status >= 300:
                    raise RuntimeError(f"BareUnity API returned {response.status}: {response_text[:200]}")
                if not isinstance(data, dict):
                    raise RuntimeError("BareUnity API returned a non-JSON response.")
                return data

    async def mark_event_processed(self, event_id):
        await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {"action": "mark-processed", "eventId": event_id})

    async def mark_event_failed(self, event_id, error):
        await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {"action": "mark-failed", "eventId": event_id, "error": str(error)[:1000]})

    async def resolve_channel(self, channel_id):
        if not channel_id:
            return None
        try:
            channel = self.bot.get_channel(int(channel_id))
            if channel:
                return channel
            return await self.bot.fetch_channel(int(channel_id))
        except Exception:
            return None

    def resolve_media_url(self, url):
        if not url:
            return None
        value = str(url).strip()
        if not value:
            return None
        if value.startswith(("http://", "https://")):
            return value
        if value.startswith(("/", "data:", "blob:")):
            return value
        if SUPABASE_URL:
            return f"{SUPABASE_URL}/storage/v1/object/public/media/{value.lstrip('/')}"
        return None

    def build_post_embed(self, payload, title_prefix="Website post"):
        title = str(payload.get("title") or "BareUnity website post")[:256]
        content = str(payload.get("content") or "").strip()
        embed = discord.Embed(title=title, description=content[:4000] or None, color=0x2f855a)
        if payload.get("postId"):
            embed.add_field(name="Website post", value=f"{BAREUNITY_API_BASE_URL}/?postId={payload.get('postId')}", inline=False)
        media_urls = payload.get("mediaUrls") or []
        if not media_urls and payload.get("mediaUrl"):
            media_urls = [payload.get("mediaUrl")]
        resolved_media_urls = [self.resolve_media_url(url) for url in media_urls]
        resolved_media_urls = [url for url in resolved_media_urls if url]
        if resolved_media_urls:
            embed.set_image(url=resolved_media_urls[0])
            if len(resolved_media_urls) > 1:
                embed.add_field(name="More media", value="\n".join(resolved_media_urls[1:4]), inline=False)
        embed.set_footer(text=title_prefix)
        return embed

    async def create_target_thread_for_post(self, website_post_id, target_channel_id, payload):
        channel = await self.resolve_channel(target_channel_id)
        if not channel:
            raise RuntimeError(f"Discord target channel {target_channel_id} was not found.")
        title = str(payload.get("title") or "BareUnity website post")[:100]
        content = str(payload.get("content") or "").strip()
        media_urls = payload.get("mediaUrls") or []
        if not media_urls and payload.get("mediaUrl"):
            media_urls = [payload.get("mediaUrl")]
        media_urls = [self.resolve_media_url(url) for url in media_urls]
        media_urls = [url for url in media_urls if url]
        body = f"{content}\n\n{BAREUNITY_API_BASE_URL}/?postId={website_post_id}".strip()[:1900]
        embed = self.build_post_embed(payload, title_prefix="Synced from BareUnity website")
        if isinstance(channel, discord.ForumChannel):
            created = await channel.create_thread(name=title, content=body or None, embed=embed)
            thread = created.thread
        else:
            message = await channel.send(content=f"**{title}**\n{body}"[:2000], embed=embed)
            thread = await message.create_thread(name=title)
        self.sync_by_thread[str(thread.id)] = str(website_post_id)
        await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {
            "action": "thread-created",
            "websitePostId": website_post_id,
            "discordThreadId": str(thread.id),
            "discordChannelId": str(channel.id),
        })
        return thread

    async def handle_website_event(self, event):
        event_type = event.get("event_type")
        payload = event.get("payload") or {}
        website_post_id = str(event.get("website_post_id") or payload.get("postId") or "")
        if event_type == "website_post_created":
            channel = await self.resolve_channel(payload.get("caseManagementChannelId"))
            if not channel:
                raise RuntimeError("Case management Discord channel was not found.")
            view = WebsitePostDecisionView(self, website_post_id, payload)
            await channel.send(content="New BareUnity website post needs Discord routing.", embed=self.build_post_embed(payload, "Needs Discord routing"), view=view)
            return
        thread_id = event.get("discord_thread_id") or payload.get("discordThreadId")
        thread = await self.resolve_channel(thread_id)
        if not thread:
            raise RuntimeError(f"Discord thread {thread_id} was not found.")
        if event_type == "website_comment_created":
            author = payload.get("authorName") or "BareUnity member"
            content = str(payload.get("content") or "").strip()
            await thread.send(f"💬 **{author} on BareUnity:**\n{content}"[:2000])
        elif event_type in ("website_like_created", "website_like_removed"):
            likes = payload.get("likes")
            verb = "liked" if event_type == "website_like_created" else "removed a like from"
            await thread.send(f"👍 A BareUnity member {verb} this post. Total likes: {likes}")

    @tasks.loop(seconds=5)
    async def event_poller(self):
        try:
            data = await self.fetch_bareunity_api("/api/integrations/discord/crosspost/events?limit=25")
            for event in data.get("events", []):
                try:
                    await self.handle_website_event(event)
                    await self.mark_event_processed(event.get("id"))
                except Exception as exc:
                    print(f"BareUnity event sync failed for {event.get('id')}: {exc}")
                    await self.mark_event_failed(event.get("id"), exc)
        except Exception as exc:
            print(f"BareUnity event poll failed: {exc}")

    @event_poller.before_loop
    async def before_event_poller(self):
        await self.bot.wait_until_ready()

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

    async def process_crosspost_thread(self, thread: discord.Thread, starter_message: discord.Message | None = None):
        if thread.parent_id not in CROSSPOST_FORUM_IDS:
            return {"ok": False, "skipped": True, "reason": "Thread is not in the configured crosspost forum."}

        starter_message = starter_message or await self.fetch_starter_message(thread)
        if not starter_message:
            return {"ok": False, "skipped": True, "reason": "Could not fetch the forum starter message yet."}
        if starter_message.author.bot:
            return {"ok": False, "skipped": True, "reason": "Starter message was created by a bot."}

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
            return {"ok": False, "error": str(exc)}

        if result.get("skipped"):
            print(f"BareUnity crosspost skipped for {thread.id}: {result.get('reason') or 'no reason returned'}")
            return result

        if result.get("duplicate"):
            print(f"BareUnity crosspost already exists for {thread.id}: {result.get('websitePostId')}")
            return result

        website_post_url = result.get("websitePostUrl")
        if not website_post_url:
            return result

        print(f"BareUnity crosspost inserted into public.posts for {thread.id}: {result.get('websitePostId')}")

        try:
            reddit_result = await self.submit_to_reddit(thread.name, website_post_url)
            if reddit_result:
                await self.record_reddit_result(thread.id, reddit_result=reddit_result)
                result["redditUrl"] = reddit_result.get("url")
        except Exception as exc:
            print(f"Reddit crosspost failed for {thread.id}: {exc}")
            try:
                await self.record_reddit_result(thread.id, error=exc)
            except Exception as record_exc:
                print(f"Could not record Reddit failure for {thread.id}: {record_exc}")

        return result

    @commands.Cog.listener()
    async def on_thread_create(self, thread: discord.Thread):
        await self.process_crosspost_thread(thread)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not isinstance(message.channel, discord.Thread):
            return
        thread = message.channel
        if thread.parent_id not in CROSSPOST_FORUM_IDS:
            return
        if message.id == thread.id:
            await self.process_crosspost_thread(thread, message)
            return
        await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {
            "action": "discord-comment-created",
            "discordThreadId": str(thread.id),
            "discordMessageId": str(message.id),
            "discordAuthorId": str(message.author.id),
            "content": message.content,
        })

    @app_commands.command(
        name="crosspost_now",
        description="Moderator: cross-post the current forum post to BareUnity now",
    )
    @app_commands.default_permissions(manage_messages=True)
    async def crosspost_now(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.response.send_message("❌ Moderator only.", ephemeral=True)
            return
        if not isinstance(interaction.channel, discord.Thread) or interaction.channel.parent_id not in CROSSPOST_FORUM_IDS:
            await interaction.response.send_message(
                "❌ Use this inside the configured crosspost forum thread.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)
        result = await self.process_crosspost_thread(interaction.channel)
        if not result:
            await interaction.followup.send("❌ Crosspost did not return a result. Check the bot logs.", ephemeral=True)
            return
        if result.get("error"):
            await interaction.followup.send(f"❌ Crosspost failed: {result.get('error')}", ephemeral=True)
            return
        if result.get("skipped"):
            await interaction.followup.send(
                f"⚠️ Crosspost skipped: {result.get('reason') or 'no reason returned'}",
                ephemeral=True,
            )
            return

        status = "already existed" if result.get("duplicate") else "was inserted"
        await interaction.followup.send(
            f"✅ Website post {status} in `public.posts`: `{result.get('websitePostId')}`\n"
            f"{result.get('websitePostUrl') or ''}",
            ephemeral=True,
        )

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload):
        if payload.user_id == self.bot.user.id:
            return
        channel = await self.resolve_channel(payload.channel_id)
        if isinstance(channel, discord.Thread):
            try:
                await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {
                    "action": "discord-like-created",
                    "discordThreadId": str(channel.id),
                    "discordUserId": str(payload.user_id),
                })
            except Exception as exc:
                print(f"BareUnity Discord like sync failed: {exc}")

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload):
        channel = await self.resolve_channel(payload.channel_id)
        if isinstance(channel, discord.Thread):
            try:
                await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {
                    "action": "discord-like-removed",
                    "discordThreadId": str(channel.id),
                    "discordUserId": str(payload.user_id),
                })
            except Exception as exc:
                print(f"BareUnity Discord like removal sync failed: {exc}")

    @commands.Cog.listener()
    async def on_ready(self):
        for command in (self.register, self.crosspost_now):
            try:
                self.bot.tree.add_command(command)
            except Exception:
                pass


class WebsitePostDecisionView(discord.ui.View):
    def __init__(self, cog: RedditCrosspost, website_post_id: str, payload: dict):
        super().__init__(timeout=None)
        self.cog = cog
        self.website_post_id = website_post_id
        self.payload = payload
        for value, label in WEBSITE_REVIEW_BUTTONS.items():
            style = discord.ButtonStyle.danger if value == "delete-post" else discord.ButtonStyle.secondary
            if value in ("photo-sharing", "naturist-travel"):
                style = discord.ButtonStyle.success
            self.add_item(WebsitePostDecisionButton(label=label, target=value, style=style))


class WebsitePostDecisionButton(discord.ui.Button):
    def __init__(self, label: str, target: str, style: discord.ButtonStyle):
        super().__init__(label=label, custom_id=f"bareunity:website-post:{target}", style=style)
        self.target = target

    async def callback(self, interaction: discord.Interaction):
        view: WebsitePostDecisionView = self.view
        await interaction.response.defer(ephemeral=True)
        result = await view.cog.post_bareunity_api("/api/integrations/discord/crosspost/events", {
            "action": "post-decision",
            "websitePostId": view.website_post_id,
            "target": self.target,
        })
        if self.target in ("photo-sharing", "naturist-travel"):
            target_channel_id = result.get("targetDiscordChannelId")
            thread = await view.cog.create_target_thread_for_post(view.website_post_id, target_channel_id, view.payload)
            await interaction.followup.send(f"✅ Posted to Discord thread {thread.mention}.", ephemeral=True)
        elif result.get("deleted"):
            await interaction.followup.send("🗑️ Website post deleted and Discord upload cancelled.", ephemeral=True)
        else:
            await interaction.followup.send("✅ Discord upload skipped for this website post.", ephemeral=True)
        if interaction.message:
            await interaction.message.edit(view=None)


async def setup(bot):
    await bot.add_cog(RedditCrosspost(bot))