import json
import os
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands, tasks
from supabase import create_client

PLATFORM_GROVE_CATEGORY = 1517153830913966241
MEMBER_MANAGEMENT = 1517155438615859390
PLATFORM_OVERVIEW = 1517154197848592586
PLATFORM_OPERATIONS = 1517154255792902204
MEMBER_APPLICATIONS = 1517153902087110788
PLATFORM_REPORTS = 1517153935658451236
GALLERY_REVIEW = 1517153973835010139
LOCATION_REQUEST = 1517154018776842301
COUNTRY_UPDATES = 1517154053375787198
PLATFORM_FEEDBACK = 1517154088310018129
CASE_FILES = 1517154128541909152

SYNC_FILE = "platform_grove_sync.json"
LOCATION_REQUEST_PREFIX = "LOCATION_REQUEST::"
LOCATION_VIEW_PREFIX = "location_request"

ACCESS_TYPE_OPTIONS = ["Public", "Discreet"]
TERRAIN_OPTIONS = [
    "Beach",
    "Hot Spring",
    "Campground",
    "Forest",
    "Urban Rooftop",
    "Resort",
    "Activity",
    "Stays",
]
SAFETY_LEVEL_OPTIONS = [
    "Beginner Friendly",
    "Trusted",
    "Verified",
    "Intermediate",
    "Experienced",
]

SIDEBAR_ITEMS = [
    "home",
    "explore",
    "gallery",
    "countries",
    "bookings",
    "booking-stays",
    "booking-activities",
    "discussion-rooms",
    "general-room",
    "video-room",
    "notifications",
    "members",
    "settings",
    "rules",
    "policies",
    "verification",
    "admin",
    "admin-overview",
    "admin-applications",
    "admin-reports",
    "admin-users",
    "admin-stays",
]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_json(path, fallback):
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def save_json(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=4)


def split_comma_list(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def parse_location_request_message(message):
    if not (message or "").startswith(LOCATION_REQUEST_PREFIX):
        return None
    raw = message[len(LOCATION_REQUEST_PREFIX):].strip()
    try:
        return json.loads(raw)
    except Exception:
        return None


def location_request_base(row):
    payload = parse_location_request_message(row.get("message")) or {}
    return {
        "request_id": row.get("id"),
        "name": payload.get("placeName") or "Untitled location",
        "location_hint": payload.get("locationHint") or "",
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "website": payload.get("website") or "",
        "request_type": payload.get("requestType") or "location",
        "requester": row.get("user_email") or payload.get("requesterEmail") or "Unknown",
        "notes": payload.get("notes") or "",
        "page_url": payload.get("pageUrl") or row.get("page_url"),
    }


def default_location_draft(row):
    base = location_request_base(row)
    terrain = "Stays" if base["request_type"] == "stay" else "Activity" if base["request_type"] == "activity" else "Beach"
    tags = "stays" if base["request_type"] == "stay" else "activity, events, bookings" if base["request_type"] == "activity" else ""
    return {
        **base,
        "short_description": "",
        "full_description": "",
        "access_type": "Public",
        "terrain": terrain,
        "safety_level": "Beginner Friendly",
        "amenities": "",
        "tags": tags,
    }


def build_location_preview_embed(draft):
    embed = discord.Embed(title=f"📍 {draft.get('name') or 'Location request'}", color=discord.Color.green())
    for name, value in [
        ("Type", draft.get("request_type") or "location"),
        ("Location Hint", draft.get("location_hint") or "None"),
        ("Coordinates", f"{draft.get('latitude')}\n{draft.get('longitude')}" if draft.get("latitude") is not None and draft.get("longitude") is not None else "Not provided"),
        ("Website", draft.get("website") or "None"),
        ("Requester", draft.get("requester") or "Unknown"),
        ("Notes", draft.get("notes") or "None"),
    ]:
        embed.add_field(name=name, value=str(value)[:1024], inline=False)
    embed.set_footer(text=f"Request ID: {draft.get('request_id')}")
    return embed


class ReplyModal(discord.ui.Modal):
    def __init__(self, cog, feedback_id, title="Reply to member"):
        super().__init__(title=title)
        self.cog = cog
        self.feedback_id = feedback_id
        self.message = discord.ui.TextInput(
            label="Message synced to website ticket",
            style=discord.TextStyle.paragraph,
            max_length=1200,
        )
        self.add_item(self.message)

    async def on_submit(self, interaction):
        await self.cog.insert_feedback_reply(
            self.feedback_id,
            interaction.user.id,
            str(interaction.user),
            str(self.message),
        )
        await interaction.response.send_message("✅ Reply synced to website.", ephemeral=True)


class FeedbackView(discord.ui.View):
    def __init__(self, cog, feedback_id):
        super().__init__(timeout=None)
        self.cog = cog
        self.feedback_id = feedback_id

    @discord.ui.button(label="Reply to user", emoji="💬", style=discord.ButtonStyle.primary)
    async def reply(self, interaction, button):
        await interaction.response.send_modal(ReplyModal(self.cog, self.feedback_id))

    @discord.ui.button(label="Close ticket", emoji="✅", style=discord.ButtonStyle.success)
    async def close(self, interaction, button):
        self.cog.supabase.table("feedback_messages").update({
            "status": "closed",
        }).eq("id", self.feedback_id).execute()
        await interaction.response.send_message("✅ Website ticket marked closed.", ephemeral=True)


class LocationTextModal(discord.ui.Modal):
    def __init__(self, view):
        super().__init__(title="Complete location fields")
        self.location_view = view
        draft = view.draft
        self.short_description = discord.ui.TextInput(label="Short Description", max_length=250, required=True, default=draft.get("short_description") or "")
        self.full_description = discord.ui.TextInput(label="Full Description", style=discord.TextStyle.paragraph, max_length=1800, required=True, default=draft.get("full_description") or "")
        self.amenities = discord.ui.TextInput(label="Amenities (comma separated)", max_length=500, required=False, default=draft.get("amenities") or "")
        self.tags = discord.ui.TextInput(label="Tags (comma separated)", max_length=500, required=False, default=draft.get("tags") or "")
        for item in [self.short_description, self.full_description, self.amenities, self.tags]:
            self.add_item(item)

    async def on_submit(self, interaction):
        self.location_view.draft.update({
            "short_description": str(self.short_description),
            "full_description": str(self.full_description),
            "amenities": str(self.amenities),
            "tags": str(self.tags),
        })
        self.location_view.save_draft()
        await interaction.response.send_message("✅ Location form fields saved. Use Preview request to review it.", ephemeral=True)


class LocationRequestView(discord.ui.View):
    def __init__(self, cog, feedback_id, row):
        super().__init__(timeout=None)
        self.cog = cog
        self.feedback_id = feedback_id
        self.row = row
        self.draft = cog.sync_state.setdefault("location_drafts", {}).get(feedback_id) or default_location_draft(row)
        self.add_item(self.build_select("access_type", "Access type", ACCESS_TYPE_OPTIONS))
        self.add_item(self.build_select("terrain", "Type / terrain", TERRAIN_OPTIONS))
        self.add_item(self.build_select("safety_level", "Safety", SAFETY_LEVEL_OPTIONS))
        self.fill_text_fields.custom_id = self.custom_id("fill_text_fields")
        self.preview.custom_id = self.custom_id("preview")
        self.create_location.custom_id = self.custom_id("create_location")

    def custom_id(self, action):
        return f"{LOCATION_VIEW_PREFIX}:{self.feedback_id}:{action}"

    def save_draft(self):
        self.cog.sync_state.setdefault("location_drafts", {})[self.feedback_id] = self.draft
        save_json(SYNC_FILE, self.cog.sync_state)

    def build_select(self, field, placeholder, values):
        options = [discord.SelectOption(label=value, value=value, default=self.draft.get(field) == value) for value in values]
        select = discord.ui.Select(
            placeholder=placeholder,
            min_values=1,
            max_values=1,
            options=options,
            custom_id=self.custom_id(field),
        )
        async def callback(interaction):
            self.draft[field] = select.values[0]
            self.save_draft()
            await interaction.response.send_message(f"✅ {placeholder} set to {select.values[0]}.", ephemeral=True)
        select.callback = callback
        return select

    @discord.ui.button(label="Fill text fields", emoji="📝", style=discord.ButtonStyle.primary, row=3)
    async def fill_text_fields(self, interaction, button):
        await interaction.response.send_modal(LocationTextModal(self))

    @discord.ui.button(label="Preview request", emoji="👀", style=discord.ButtonStyle.secondary, row=3)
    async def preview(self, interaction, button):
        await interaction.response.send_message(embed=build_location_preview_embed(self.draft), ephemeral=True)

    @discord.ui.button(label="Create location", emoji="✅", style=discord.ButtonStyle.success, row=3)
    async def create_location(self, interaction, button):
        required = ["short_description", "full_description"]
        missing = [field.replace("_", " ") for field in required if not self.draft.get(field)]
        if missing:
            await interaction.response.send_message(f"❌ Fill required fields first: {', '.join(missing)}.", ephemeral=True)
            return
        self.cog.supabase.table("naturist_map_spots").insert({
            "name": self.draft.get("name"),
            "description": self.draft.get("full_description"),
            "short_description": self.draft.get("short_description"),
            "latitude": self.draft.get("latitude"),
            "longitude": self.draft.get("longitude"),
            "privacy": self.draft.get("access_type"),
            "location_hint": self.draft.get("location_hint"),
            "access_type": self.draft.get("access_type"),
            "terrain": self.draft.get("terrain"),
            "safety_level": self.draft.get("safety_level"),
            "website": self.draft.get("website"),
            "amenities": split_comma_list(self.draft.get("amenities")),
            "tags": split_comma_list(self.draft.get("tags")),
            "reporter_notes": f"Requested by {self.draft.get('requester')}\nRequest ID: {self.feedback_id}\nNotes: {self.draft.get('notes') or 'None'}",
            "status": "approved",
        }).execute()
        self.cog.supabase.table("feedback_messages").update({"status": "closed"}).eq("id", self.feedback_id).execute()
        await interaction.response.send_message("✅ Location created and website ticket closed.", ephemeral=True)
        
        
class GalleryDecisionView(discord.ui.View):
    def __init__(self, cog, image_path):
        super().__init__(timeout=None)
        self.cog = cog
        self.image_path = image_path

    async def set_gallery(self, interaction, gallery_type):
        self.cog.supabase.table("gallery_media").update({
            "gallery_type": gallery_type,
            "moderation_status": "approved",
            "moderation_reason": f"Approved from Discord by {interaction.user}",
            "updated_at": now_iso(),
        }).eq("image_path", self.image_path).execute()
        await interaction.response.send_message(f"✅ Moved to {gallery_type} gallery.", ephemeral=True)

    @discord.ui.button(label="General gallery", emoji="🌿", style=discord.ButtonStyle.success)
    async def general(self, interaction, button):
        await self.set_gallery(interaction, "general")

    @discord.ui.button(label="Nude gallery", emoji="🖼️", style=discord.ButtonStyle.primary)
    async def nude(self, interaction, button):
        await self.set_gallery(interaction, "nude")

    @discord.ui.button(label="Keep pending", emoji="⏳", style=discord.ButtonStyle.secondary)
    async def pending(self, interaction, button):
        self.cog.supabase.table("gallery_media").update({
            "gallery_type": "pending",
            "moderation_status": "pending",
            "updated_at": now_iso(),
        }).eq("image_path", self.image_path).execute()
        await interaction.response.send_message("⏳ Kept pending for later review.", ephemeral=True)


class MemberActionModal(discord.ui.Modal):
    def __init__(self, cog, user_id, action):
        super().__init__(title=f"{action.title()} member")
        self.cog = cog
        self.user_id = user_id
        self.action = action
        self.reason = discord.ui.TextInput(
            label="Reason / message to member",
            style=discord.TextStyle.paragraph,
            max_length=1200,
        )
        self.add_item(self.reason)

    async def on_submit(self, interaction):
        ticket = self.cog.supabase.table("feedback_messages").insert({
            "user_id": self.user_id,
            "category": "other",
            "message": f"A moderator issued a {self.action} from Discord.",
            "status": "new",
        }).execute()
        feedback_id = ticket.data[0]["id"]
        await self.cog.insert_feedback_reply(
            feedback_id,
            interaction.user.id,
            str(interaction.user),
            str(self.reason),
        )
        if self.action == "ban":
            self.cog.supabase.table("profile_settings").update({
                "user_role": "banned",
                "updated_at": now_iso(),
            }).eq("user_id", self.user_id).execute()
        await interaction.response.send_message(
            f"✅ {self.action.title()} synced to website feedback ticket {feedback_id}.",
            ephemeral=True,
        )


class MemberActionView(discord.ui.View):
    def __init__(self, cog, user_id):
        super().__init__(timeout=None)
        self.cog = cog
        self.user_id = user_id

    @discord.ui.button(label="Warn", emoji="⚠️", style=discord.ButtonStyle.primary)
    async def warn(self, interaction, button):
        await interaction.response.send_modal(MemberActionModal(self.cog, self.user_id, "warning"))

    @discord.ui.button(label="Ban", emoji="⛔", style=discord.ButtonStyle.danger)
    async def ban(self, interaction, button):
        await interaction.response.send_modal(MemberActionModal(self.cog, self.user_id, "ban"))


class PlatformGroveAdmin(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY"),
        )
        self.sync_state = load_json(SYNC_FILE, {
            "feedback": {},
            "reports": {},
            "applications": {},
            "gallery": {},
            "location_drafts": {},
        })
        self.platform_sync.start()

    def cog_unload(self):
        self.platform_sync.cancel()

    async def insert_feedback_reply(self, feedback_id, discord_user_id, discord_user, message):
        self.supabase.table("feedback_replies").insert({
            "feedback_id": feedback_id,
            "author_id": None,
            "author_email": f"discord:{discord_user_id}",
            "author_role": "admin",
            "message": message,
        }).execute()

    def is_staff(self, member):
        return bool(member.guild_permissions.manage_guild or member.guild_permissions.manage_messages)

    def is_member_management_channel(self, interaction):
        if interaction.channel_id == MEMBER_MANAGEMENT:
            return True
        return (
            isinstance(interaction.channel, discord.Thread)
            and interaction.channel.parent_id == MEMBER_MANAGEMENT
        )
        
    def ticket_embed(self, title, row):
        embed = discord.Embed(title=title, description=(row.get("message") or row.get("reason") or "No details")[:4000], color=discord.Color.blurple())
        for name, key in [("ID", "id"), ("User", "user_id"), ("Email", "user_email"), ("Status", "status"), ("Created", "created_at")]:
            value = row.get(key)
            if value:
                embed.add_field(name=name, value=str(value)[:1024], inline=True)
        embed.set_footer(text="BareUnity website ↔ Discord sync")
        return embed

    async def create_forum_thread(self, forum_id, name, content, embed=None, view=None):
        forum = self.bot.get_channel(forum_id) or await self.bot.fetch_channel(forum_id)
        if not isinstance(forum, discord.ForumChannel):
            return None
        created = await forum.create_thread(name=name[:100], content=content, embed=embed, view=view)
        return created.thread

    def gallery_image_url(self, row):
        public_url = (row.get("public_url") or "").strip()
        if public_url:
            return public_url

        image_path = (row.get("image_path") or "").strip()
        if not image_path:
            return None

        try:
            signed = self.supabase.storage.from_("media").create_signed_url(
                image_path,
                60 * 60 * 24 * 7,
            )
        except Exception as error:
            print(f"[PLATFORM_GROVE] Could not sign gallery image {image_path}: {error}")
            return None

        if isinstance(signed, dict):
            return signed.get("signedURL") or signed.get("signedUrl") or signed.get("publicUrl")
        return getattr(signed, "signed_url", None) or getattr(signed, "signedURL", None)
    
    async def restore_location_request_views(self):
        location_threads = self.sync_state.get("feedback", {})
        if not location_threads:
            return

        response = (
            self.supabase.table("feedback_messages")
            .select("*")
            .neq("status", "closed")
            .execute()
        )
        rows_by_id = {row.get("id"): row for row in response.data or []}

        for feedback_id, thread_id in location_threads.items():
            row = rows_by_id.get(feedback_id)
            if not row or not (row.get("message") or "").startswith(LOCATION_REQUEST_PREFIX):
                continue

            view = LocationRequestView(self, feedback_id, row)
            self.bot.add_view(view, message_id=int(thread_id))

            try:
                thread = self.bot.get_channel(int(thread_id)) or await self.bot.fetch_channel(int(thread_id))
                starter_message = await thread.fetch_message(int(thread_id))
                await starter_message.edit(view=view)
            except Exception as error:
                print(f"[PLATFORM_GROVE] Could not refresh location request view {feedback_id}: {error}")

    async def sync_feedback(self):
        response = self.supabase.table("feedback_messages").select("*").neq("status", "closed").order("created_at", desc=True).limit(25).execute()
        for row in response.data or []:
            ticket_id = row["id"]
            if ticket_id in self.sync_state["feedback"]:
                continue
            is_location = (row.get("message") or "").startswith(LOCATION_REQUEST_PREFIX)
            channel_id = LOCATION_REQUEST if is_location else PLATFORM_FEEDBACK
            title = "📍 Location request" if is_location else "💬 Platform feedback"
            if is_location:
                draft = default_location_draft(row)
                content = (
                    f"Website location request synced from BareUnity.\n"
                    f"**{draft['name']}**\n"
                    f"Location hint: {draft['location_hint'] or 'None'}\n"
                    f"Coordinates: {draft['latitude']}, {draft['longitude']}\n"
                    f"Website: {draft['website'] or 'None'}\n"
                    f"Requester: {draft['requester']}\n"
                    f"Request ID: {ticket_id}"
                )
                embed = None
                view = LocationRequestView(self, ticket_id, row)
            else:
                content = "Website ticket synced from BareUnity."
                embed = self.ticket_embed(title, row)
                view = FeedbackView(self, ticket_id)
            thread = await self.create_forum_thread(
                channel_id,
                f"{title} • {ticket_id[:8]}",
                content,
                embed,
                view,
            )
            if thread:
                self.sync_state["feedback"][ticket_id] = str(thread.id)

    async def sync_reports(self):
        response = self.supabase.table("reports").select("*").order("created_at", desc=True).limit(25).execute()
        for row in response.data or []:
            report_id = row["id"]
            if report_id in self.sync_state["reports"]:
                continue
            embed = discord.Embed(title="🚩 Platform report", description=(row.get("reason") or "No reason")[:4000], color=discord.Color.orange())
            for name, key in [("Report ID", "id"), ("Reporter", "reporter_id"), ("Target type", "target_type"), ("Target ID", "target_id")]:
                if row.get(key):
                    embed.add_field(name=name, value=str(row[key])[:1024], inline=True)
            thread = await self.create_forum_thread(PLATFORM_REPORTS, f"Report • {report_id[:8]}", "Website report synced from BareUnity.", embed)
            if thread:
                self.sync_state["reports"][report_id] = str(thread.id)

    async def sync_applications(self):
        response = self.supabase.table("verification_submissions").select("*").eq("status", "pending").order("updated_at", desc=True).limit(25).execute()
        for row in response.data or []:
            user_id = row["user_id"]
            if user_id in self.sync_state["applications"]:
                continue
            embed = discord.Embed(title="🎥 Member application / video meeting", color=discord.Color.green())
            for name, key in [("User ID", "user_id"), ("Display name", "display_name"), ("Country", "country"), ("Membership", "membership_type"), ("Notes", "reviewer_notes")]:
                if row.get(key):
                    embed.add_field(name=name, value=str(row[key])[:1024], inline=False)
            thread = await self.create_forum_thread(MEMBER_APPLICATIONS, f"Application • {row.get('display_name') or user_id[:8]}", "Schedule and record the onboarding video meeting here.", embed)
            if thread:
                self.sync_state["applications"][user_id] = str(thread.id)

    async def sync_gallery(self):
        response = self.supabase.table("gallery_media").select("*").eq("gallery_type", "pending").order("created_at", desc=True).limit(25).execute()
        for row in response.data or []:
            image_path = row.get("image_path")
            if not image_path or image_path in self.sync_state["gallery"]:
                continue
            title = (row.get("title") or "Gallery review").strip()[:80]
            embed = discord.Embed(title="🖼️ Gallery review", color=discord.Color.purple())
            image_url = self.gallery_image_url(row)
            if image_url:
                embed.set_image(url=image_url)
            else:
                embed.description = "⚠️ Image preview unavailable. Use the storage path below."
                embed.add_field(name="Storage path", value=f"`{image_path[:1000]}`", inline=False)
            thread = await self.create_forum_thread(GALLERY_REVIEW, f"Gallery • {title}", "Choose the final gallery destination. The image preview is attached below.", embed, GalleryDecisionView(self, image_path))
            if thread:
                self.sync_state["gallery"][image_path] = str(thread.id)

    @tasks.loop(minutes=2)
    async def platform_sync(self):
        try:
            await self.sync_feedback()
            await self.sync_reports()
            await self.sync_applications()
            await self.sync_gallery()
            save_json(SYNC_FILE, self.sync_state)
        except Exception as error:
            print(f"[PLATFORM_GROVE] Sync error: {error}")

    @platform_sync.before_loop
    async def before_platform_sync(self):
        await self.bot.wait_until_ready()
        await self.restore_location_request_views()

    @app_commands.command(name="platform_overview", description="Post current BareUnity website stats in platform-overview")
    async def platform_overview(self, interaction):
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        counts = {}
        for table in ["profiles", "posts", "comments", "gallery_media", "feedback_messages", "reports", "verification_submissions"]:
            result = self.supabase.table(table).select("*", count="exact").limit(1).execute()
            counts[table] = result.count or 0
        embed = discord.Embed(title="🌿 BareUnity platform overview", color=discord.Color.green(), timestamp=datetime.now(timezone.utc))
        for table, count in counts.items():
            embed.add_field(name=table.replace("_", " ").title(), value=str(count), inline=True)
        channel = self.bot.get_channel(PLATFORM_OVERVIEW) or await self.bot.fetch_channel(PLATFORM_OVERVIEW)
        await channel.send(embed=embed)
        await interaction.response.send_message("✅ Overview posted.", ephemeral=True)

    @app_commands.command(name="sidebar_hide", description="Hide a website sidebar option from Discord")
    @app_commands.choices(item=[app_commands.Choice(name=item, value=item) for item in SIDEBAR_ITEMS[:25]])
    async def sidebar_hide(self, interaction, item: app_commands.Choice[str]):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        current = self.supabase.table("platform_settings").select("sidebar_hidden_items").eq("id", True).maybe_single().execute()
        hidden = list((current.data or {}).get("sidebar_hidden_items") or [])
        if item.value not in hidden:
            hidden.append(item.value)
        self.supabase.table("platform_settings").upsert({"id": True, "sidebar_hidden_items": hidden, "updated_at": now_iso()}).execute()
        await interaction.response.send_message(f"✅ Hidden `{item.value}` on the website sidebar.", ephemeral=True)

    @app_commands.command(name="sidebar_show", description="Show a website sidebar option from Discord")
    @app_commands.choices(item=[app_commands.Choice(name=item, value=item) for item in SIDEBAR_ITEMS[:25]])
    async def sidebar_show(self, interaction, item: app_commands.Choice[str]):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        current = self.supabase.table("platform_settings").select("sidebar_hidden_items").eq("id", True).maybe_single().execute()
        hidden = [value for value in list((current.data or {}).get("sidebar_hidden_items") or []) if value != item.value]
        self.supabase.table("platform_settings").upsert({"id": True, "sidebar_hidden_items": hidden, "updated_at": now_iso()}).execute()
        await interaction.response.send_message(f"✅ Shown `{item.value}` on the website sidebar.", ephemeral=True)

    @app_commands.command(name="member_profile", description="Open a website member profile card in member-management")
    async def member_profile(self, interaction, username: str):
        if not self.is_member_management_channel(interaction):
            await interaction.response.send_message("❌ Use this in member-management or one of its posts.", ephemeral=True)
            return
        response = self.supabase.table("profiles").select("*").eq("username", username).maybe_single().execute()
        profile = response.data
        if not profile:
            await interaction.response.send_message("❌ Member not found.", ephemeral=True)
            return
        embed = discord.Embed(title=f"👤 {profile.get('display_name') or profile.get('username')}", color=discord.Color.green())
        for name, key in [("User ID", "id"), ("Username", "username"), ("Location", "location"), ("Bio", "bio")]:
            if profile.get(key):
                embed.add_field(name=name, value=str(profile[key])[:1024], inline=False)
        if profile.get("avatar_url"):
            embed.set_thumbnail(url=profile["avatar_url"])
        await interaction.response.send_message(embed=embed, view=MemberActionView(self, profile["id"]), ephemeral=False)


async def setup(bot):
    await bot.add_cog(PlatformGroveAdmin(bot))
