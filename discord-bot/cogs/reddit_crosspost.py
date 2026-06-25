import asyncio
import io
import os
from urllib.parse import urlparse

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
DISCORD_MEMBER_CARD_BACKFILL_ON_START = os.getenv("DISCORD_MEMBER_CARD_BACKFILL_ON_START", "true").lower() not in {"0", "false", "no"}
DISCORD_LOCATION_REQUEST_BACKFILL_ON_START = os.getenv("DISCORD_LOCATION_REQUEST_BACKFILL_ON_START", "true").lower() not in {"0", "false", "no"}
WEBSITE_REVIEW_BUTTONS = {
    "photo-sharing": "Photo sharing",
    "naturist-travel": "Naturist travel",
    "skip-discord-upload": "Skip Discord",
    "delete-post": "Delete post",
}
GALLERY_REVIEW_BUTTONS = {
    "general-gallery": "General gallery",
    "nude-gallery": "Nude gallery",
    "reject-gallery-image": "Reject",
}


class NonRetryableWebsiteEventError(RuntimeError):
    pass


class RedditCrosspost(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.reddit = self.build_reddit_client()
        self.sync_by_thread = {}
        self.member_card_backfill_started = False
        self.location_request_backfill_started = False
        self.event_poller.change_interval(seconds=DISCORD_CROSSPOST_EVENT_POLL_SECONDS)
        self.event_poller.start()
        if DISCORD_MEMBER_CARD_BACKFILL_ON_START:
            self.member_card_backfill.start()
        if DISCORD_LOCATION_REQUEST_BACKFILL_ON_START:
            self.location_request_backfill.start()


    def cog_unload(self):
        self.event_poller.cancel()
        if self.member_card_backfill.is_running():
            self.member_card_backfill.cancel()
        if self.location_request_backfill.is_running():
            self.location_request_backfill.cancel()

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

    async def mark_event_failed(self, event_id, error, terminal=False):
        return await self.post_bareunity_api(
            "/api/integrations/discord/crosspost/events",
            {
                "action": "mark-failed",
                "eventId": event_id,
                "error": str(error)[:1000],
                "terminal": terminal,
            },
        )

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


    def gallery_attachment_filename(self, payload):
        image_path = str(payload.get("imagePath") or "gallery-image.webp")
        name = os.path.basename(urlparse(image_path).path) or "gallery-image.webp"
        safe = "".join(char if char.isalnum() or char in (".", "_", "-") else "_" for char in name)
        if "." not in safe:
            safe = f"{safe}.webp"
        return safe[:120] or "gallery-image.webp"

    async def fetch_gallery_attachment(self, payload):
        image_url = payload.get("signedUrl") or payload.get("publicUrl") or self.resolve_media_url(payload.get("imagePath"))
        if not image_url:
            return None, None
        image_url = str(image_url)
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(image_url) as response:
                if response.status >= 300:
                    raise RuntimeError(f"Gallery image download returned {response.status}.")
                content_type = response.headers.get("Content-Type", "")
                if content_type and not content_type.lower().startswith("image/"):
                    raise RuntimeError(f"Gallery image download returned non-image content type {content_type}.")
                data = await response.read()
        if not data:
            raise RuntimeError("Gallery image download returned an empty body.")
        filename = self.gallery_attachment_filename(payload)
        return discord.File(io.BytesIO(data), filename=filename), filename

    def build_gallery_embed(self, payload, attachment_filename=None):
        title = str(payload.get("title") or "Gallery image review")[:256]
        source = str(payload.get("source") or "gallery upload").replace("_", " ")
        image_path = str(payload.get("imagePath") or "")
        embed = discord.Embed(
            title=title,
            description="Choose where this BareUnity image belongs.",
            color=0x805ad5,
        )
        embed.add_field(name="Source", value=source, inline=True)
        if payload.get("ownerId"):
            embed.add_field(name="Owner", value=str(payload.get("ownerId"))[:1024], inline=False)
        if image_path:
            embed.add_field(name="Image path", value=image_path[:1024], inline=False)
        image_url = payload.get("signedUrl") or payload.get("publicUrl")
        if attachment_filename:
            embed.set_image(url=f"attachment://{attachment_filename}")
        elif image_url:
            embed.set_image(url=str(image_url))
        embed.set_footer(text="BareUnity gallery review")
        return embed

    async def create_gallery_review_thread(self, event):
        payload = event.get("payload") or {}
        image_path = str(event.get("gallery_image_path") or payload.get("imagePath") or "").strip()
        if not image_path:
            raise NonRetryableWebsiteEventError("Gallery review event did not include an image path.")

        channel_id = payload.get("reviewChannelId") or payload.get("discordReview", {}).get("channelId")
        channel = await self.resolve_channel(channel_id)
        if not channel:
            raise NonRetryableWebsiteEventError(f"Gallery review Discord channel {channel_id} was not found.")

        title = str(payload.get("title") or "Gallery image review").strip()[:80]
        attachment = None
        attachment_filename = None
        try:
            attachment, attachment_filename = await self.fetch_gallery_attachment(payload)
        except Exception as exc:
            print(f"Could not attach gallery review image for {image_path}: {exc}")
        embed = self.build_gallery_embed(payload, attachment_filename=attachment_filename)
        view = GalleryReviewDecisionView(self, image_path, payload)
        content = "New BareUnity gallery image needs review."
        files = [attachment] if attachment else None
        if isinstance(channel, discord.ForumChannel):
            created = await channel.create_thread(name=f"Gallery • {title}", content=content, embed=embed, view=view, files=files)
            thread = created.thread
            message = getattr(created, "message", None)
        else:
            message = await channel.send(content=content, embed=embed, view=view, files=files)
            thread = await message.create_thread(name=f"Gallery • {title}")

        await self.post_bareunity_api("/api/integrations/discord/crosspost/events", {
            "action": "gallery-thread-created",
            "imagePath": image_path,
            "discordThreadId": str(thread.id),
            "discordChannelId": str(channel.id),
            "discordMessageId": str(message.id) if message else None,
            "bucketId": payload.get("bucketId") or "media",
        })
        return thread

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
            raise NonRetryableWebsiteEventError(f"Discord target channel {target_channel_id} was not found.")
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


    def build_location_request_embed(self, payload):
        place_name = str(payload.get("placeName") or "New location request").strip() or "New location request"
        request_type = str(payload.get("requestType") or "location").strip().title()
        location_hint = str(payload.get("locationHint") or "Not provided").strip() or "Not provided"
        notes = str(payload.get("notes") or "").strip()
        latitude = payload.get("latitude")
        longitude = payload.get("longitude")
        coordinates = "Not provided"
        if latitude is not None and longitude is not None:
            coordinates = f"{latitude}, {longitude}"

        embed = discord.Embed(
            title=f"📍 {place_name}"[:256],
            description="A BareUnity member submitted a location request from the website form.",
            color=0x3182ce,
        )
        embed.add_field(name="Request type", value=request_type, inline=True)
        embed.add_field(name="Location hint", value=location_hint[:1024], inline=False)
        embed.add_field(name="Coordinates", value=str(coordinates)[:1024], inline=False)
        if payload.get("website"):
            embed.add_field(name="Website", value=str(payload.get("website"))[:1024], inline=False)
        if notes:
            embed.add_field(name="Notes", value=notes[:1024], inline=False)
        if payload.get("requesterEmail"):
            embed.add_field(name="Requester email", value=str(payload.get("requesterEmail"))[:1024], inline=False)
        if payload.get("requesterUserId"):
            embed.add_field(name="Requester user ID", value=str(payload.get("requesterUserId"))[:1024], inline=False)
        if payload.get("pageUrl"):
            embed.add_field(name="Submitted from", value=str(payload.get("pageUrl"))[:1024], inline=False)
        if payload.get("requestId"):
            embed.add_field(name="Feedback request ID", value=str(payload.get("requestId"))[:1024], inline=False)
        requested_at = payload.get("requestedAt") or payload.get("createdAt")
        if requested_at:
            embed.set_footer(text=f"BareUnity location request • {requested_at}")
        else:
            embed.set_footer(text="BareUnity location request")
        return embed

    def build_location_request_content(self, payload):
        place_name = str(payload.get("placeName") or "New location request").strip() or "New location request"
        request_type = str(payload.get("requestType") or "location").strip() or "location"
        location_hint = str(payload.get("locationHint") or "Not provided").strip() or "Not provided"
        notes = str(payload.get("notes") or "").strip()
        lines = [
            "New BareUnity location request submitted from the website form.",
            "",
            f"**Place name:** {place_name}",
            f"**Request type:** {request_type}",
            f"**Location hint:** {location_hint}",
        ]
        if payload.get("latitude") is not None and payload.get("longitude") is not None:
            lines.append(f"**Coordinates:** {payload.get('latitude')}, {payload.get('longitude')}")
        if payload.get("website"):
            lines.append(f"**Website:** {payload.get('website')}")
        if notes:
            lines.append(f"**Notes:** {notes}")
        if payload.get("requesterEmail"):
            lines.append(f"**Requester email:** {payload.get('requesterEmail')}")
        if payload.get("pageUrl"):
            lines.append(f"**Submitted from:** {payload.get('pageUrl')}")
        if payload.get("requestId"):
            lines.append(f"**Feedback request ID:** `{payload.get('requestId')}`")
        return "\n".join(lines)[:1900]

    async def create_location_request_thread(self, event):
        payload = event.get("payload") or {}
        channel_id = payload.get("locationRequestsForumId") or payload.get("discordForum", {}).get("channelId")
        channel = await self.resolve_channel(channel_id)
        if not channel:
            raise NonRetryableWebsiteEventError(f"Location request Discord forum {channel_id} was not found.")

        place_name = str(payload.get("placeName") or "New location request").strip() or "New location request"
        request_type = str(payload.get("requestType") or "location").strip().title()
        title = f"{request_type} • {place_name}"[:100]
        content = self.build_location_request_content(payload)
        embed = self.build_location_request_embed(payload)
        if isinstance(channel, discord.ForumChannel):
            created = await channel.create_thread(name=title, content=content, embed=embed)
            return created.thread

        message = await channel.send(content=f"**{title}**\n{content}"[:2000], embed=embed)
        return await message.create_thread(name=title)

    def build_member_card_embed(self, payload):
        username = str(payload.get("username") or "unknown").strip() or "unknown"
        display_name = str(payload.get("displayName") or username).strip() or username
        bio = str(payload.get("bio") or "No bio provided.").strip()[:1024]
        location = str(payload.get("location") or "Not specified").strip() or "Not specified"
        embed = discord.Embed(title=f"👤 {display_name}", description=bio, color=0x2f855a)
        embed.add_field(name="Username", value=username, inline=True)
        embed.add_field(name="Location", value=location, inline=True)
        if payload.get("profileUrl"):
            embed.add_field(name="Profile", value=str(payload.get("profileUrl"))[:1024], inline=False)
        if payload.get("discordUserId"):
            embed.add_field(name="Discord user", value=f"<@{payload.get('discordUserId')}>", inline=False)
        if payload.get("registeredFrom"):
            embed.add_field(name="Registered from", value=str(payload.get("registeredFrom"))[:1024], inline=False)
        avatar_url = self.resolve_media_url(payload.get("avatarUrl"))
        if avatar_url:
            embed.set_thumbnail(url=avatar_url)
        if payload.get("profileId"):
            embed.set_footer(text=f"UUID: {payload.get('profileId')}")
        return embed

    async def find_member_card_thread(self, forum, profile_id):
        expected_footer = f"UUID: {profile_id}"
        for thread in list(getattr(forum, "threads", []) or []):
            starter = await self.fetch_starter_message(thread)
            if starter and any(embed.footer and embed.footer.text == expected_footer for embed in starter.embeds):
                return thread, starter
        try:
            async for thread in forum.archived_threads(limit=None):
                starter = await self.fetch_starter_message(thread)
                if starter and any(embed.footer and embed.footer.text == expected_footer for embed in starter.embeds):
                    return thread, starter
        except Exception as exc:
            print(f"Could not inspect archived member cards in {forum.id}: {exc}")
        return None, None

    async def upsert_member_card_thread(self, event):
        payload = event.get("payload") or {}
        profile_id = str(payload.get("profileId") or "").strip()
        forum_id = str(payload.get("memberCardsForumId") or "").strip()
        if not profile_id:
            raise NonRetryableWebsiteEventError("Member card event did not include a profileId.")
        forum = await self.resolve_channel(forum_id)
        if not isinstance(forum, discord.ForumChannel):
            raise NonRetryableWebsiteEventError(f"Member cards forum {forum_id} was not found.")

        username = str(payload.get("username") or "unknown").strip() or "unknown"
        display_name = str(payload.get("displayName") or username).strip() or username
        title = f"{display_name} (@{username})"[:100]
        content = f"👤 Member profile card for @{username}"
        embed = self.build_member_card_embed(payload)
        thread, starter = await self.find_member_card_thread(forum, profile_id)
        if thread and starter:
            if getattr(thread, "archived", False):
                await thread.edit(archived=False)
            await starter.edit(content=content, embed=embed)
            if thread.name != title:
                await thread.edit(name=title)
            return thread

        created = await forum.create_thread(name=title, content=content, embed=embed)
        return created.thread


    async def backfill_member_cards(self):
        data = await self.post_bareunity_api(
            "/api/integrations/discord/crosspost/events",
            {"action": "member-card-snapshot"},
        )
        cards = data.get("cards") or []
        if not isinstance(cards, list):
            raise RuntimeError("BareUnity member card snapshot returned an invalid cards payload.")

        created_or_updated = 0
        for index, card in enumerate(cards, start=1):
            if not isinstance(card, dict):
                continue
            try:
                await self.upsert_member_card_thread({"payload": card})
                created_or_updated += 1
            except Exception as exc:
                print(f"Member card backfill failed for {card.get('profileId')}: {exc}")
            if index % 20 == 0:
                await asyncio.sleep(1)

        print(f"Member card backfill complete: {created_or_updated}/{len(cards)} card(s) synced.")

    @tasks.loop(count=1)
    async def member_card_backfill(self):
        if self.member_card_backfill_started:
            return
        self.member_card_backfill_started = True
        try:
            await self.backfill_member_cards()
        except Exception as exc:
            print(f"Member card backfill failed: {exc}")

    @member_card_backfill.before_loop
    async def before_member_card_backfill(self):
        await self.bot.wait_until_ready()

    async def queue_pending_location_requests(self):
        data = await self.post_bareunity_api(
            "/api/integrations/discord/crosspost/events",
            {"action": "location-request-backfill"},
        )
        print(f"Location request backfill queued {data.get('queued', 0)} pending request(s).")

    @tasks.loop(count=1)
    async def location_request_backfill(self):
        if self.location_request_backfill_started:
            return
        self.location_request_backfill_started = True
        try:
            await self.queue_pending_location_requests()
        except Exception as exc:
            print(f"Location request backfill failed: {exc}")

    @location_request_backfill.before_loop
    async def before_location_request_backfill(self):
        await self.bot.wait_until_ready()

    async def handle_website_event(self, event):
        event_type = event.get("event_type")
        payload = event.get("payload") or {}
        website_post_id = str(event.get("website_post_id") or payload.get("postId") or "")
        if event_type == "website_post_created":
            channel = await self.resolve_channel(payload.get("caseManagementChannelId"))
            if not channel:
                raise NonRetryableWebsiteEventError("Case management Discord channel was not found.")
            view = WebsitePostDecisionView(self, website_post_id, payload)
            await channel.send(content="New BareUnity website post needs Discord routing.", embed=self.build_post_embed(payload, "Needs Discord routing"), view=view)
            return
        if event_type == "gallery_image_review_requested":
            await self.create_gallery_review_thread(event)
            return
        if event_type == "member_card_upserted":
            await self.upsert_member_card_thread(event)
            return
        if event_type == "location_request_created":
            await self.create_location_request_thread(event)
            return
        thread_id = event.get("discord_thread_id") or payload.get("discordThreadId")
        thread = await self.resolve_channel(thread_id)
        if not thread:
            raise NonRetryableWebsiteEventError(f"Discord thread {thread_id} was not found.")
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
                    terminal = isinstance(exc, NonRetryableWebsiteEventError)
                    result = await self.mark_event_failed(event.get("id"), exc, terminal=terminal)
                    if terminal or result.get("terminal"):
                        print(f"BareUnity event sync gave up for {event.get('id')}: {exc}")
                    else:
                        attempts = result.get("attempts")
                        print(f"BareUnity event sync failed for {event.get('id')} (attempt {attempts}): {exc}")
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

        # Re-register persistent gallery review buttons after bot restarts.
        # Older review messages used stable per-action custom IDs without the image
        # path embedded in the component, so the callback recovers the image path
        # from the message embed when Discord routes the interaction here.
        try:
            self.bot.add_view(GalleryReviewDecisionView(self))
        except Exception as exc:
            print(f"BareUnity gallery review button restore failed: {exc}")


class GalleryReviewDecisionView(discord.ui.View):
    def __init__(self, cog: RedditCrosspost, image_path: str = "", payload: dict | None = None):
        super().__init__(timeout=None)
        self.cog = cog
        self.image_path = image_path
        self.payload = payload or {}
        for value, label in GALLERY_REVIEW_BUTTONS.items():
            style = discord.ButtonStyle.danger if value == "reject-gallery-image" else discord.ButtonStyle.success
            if value == "nude-gallery":
                style = discord.ButtonStyle.primary
            self.add_item(GalleryReviewDecisionButton(label=label, target=value, style=style))


class GalleryReviewDecisionButton(discord.ui.Button):
    def __init__(self, label: str, target: str, style: discord.ButtonStyle):
        super().__init__(label=label, custom_id=f"bareunity:gallery-review:{target}", style=style)
        self.target = target

    def image_path_from_message(self, message: discord.Message | None):
        if not message:
            return ""
        for embed in message.embeds:
            for field in embed.fields:
                if str(field.name).strip().lower() == "image path":
                    return str(field.value).strip()
        return ""

    async def callback(self, interaction: discord.Interaction):
        view: GalleryReviewDecisionView = self.view
        image_path = view.image_path or self.image_path_from_message(interaction.message)
        if not image_path:
            await interaction.response.send_message(
                "❌ Could not find the gallery image path on this review post. Please recreate the review thread.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)
        result = await view.cog.post_bareunity_api("/api/integrations/discord/crosspost/events", {
            "action": "gallery-decision",
            "imagePath": image_path,
            "target": self.target,
            "discordReviewThreadId": str(interaction.channel_id) if interaction.channel_id else None,
            "discordReviewerId": str(interaction.user.id),
            "bucketId": view.payload.get("bucketId") or "media",
        })
        if self.target == "reject-gallery-image":
            message = "🗑️ Gallery image rejected and removed from public review."
        else:
            message = f"✅ Gallery image approved for `{result.get('galleryType')}`."
        await interaction.followup.send(message, ephemeral=True)
        try:
            if isinstance(interaction.channel, discord.Thread):
                await interaction.channel.delete()
            elif interaction.message:
                await interaction.message.edit(view=None)
        except Exception as exc:
            print(f"BareUnity gallery review cleanup failed for {image_path}: {exc}")


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