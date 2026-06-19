import hashlib
import json
import os
import re
from pathlib import Path
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
FEEDBACK_VIEW_PREFIX = "feedback_ticket"
REPORT_VIEW_PREFIX = "platform_report"
GALLERY_VIEW_PREFIX = "gallery_review"
MEMBER_VIEW_PREFIX = "member_action"

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


def stable_component_id(prefix, identifier, action):
    digest = hashlib.sha256(str(identifier).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}:{action}"


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "bareunity-listing"


def has_strong_password(password):
    return (
        len(password or "") >= 12
        and re.search(r"[A-Z]", password or "")
        and re.search(r"[a-z]", password or "")
        and re.search(r"\d", password or "")
        and re.search(r"[^\w\s]", password or "")
    )


def normalize_username(value):
    normalized = re.sub(r"[^a-z0-9_-]+", "-", (value or "").strip().lower()).strip("-_")
    return normalized[:30] or "naturist"


def parse_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def load_json_payload(value):
    try:
        parsed = json.loads(value or "{}")
    except Exception as error:
        raise ValueError(f"Invalid JSON: {error}") from error
    if not isinstance(parsed, dict):
        raise ValueError("JSON payload must be an object.")
    return parsed


def list_from_payload(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if item not in (None, "")]
    if isinstance(value, str):
        return split_comma_list(value)
    return []


def value_for(payload, *keys, default=None):
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return default


def repo_root():
    return Path(__file__).resolve().parents[2]


def parse_location_request_message(message):
    if not (message or "").startswith(LOCATION_REQUEST_PREFIX):
        return None
    raw = message[len(LOCATION_REQUEST_PREFIX):].strip()
    try:
        return json.loads(raw)
    except Exception:
        return None


def location_coordinate(payload, *keys):
    for key in keys:
        coordinate = parse_float(payload.get(key), None)
        if coordinate is not None:
            return coordinate
    return None


def location_request_base(row):
    payload = parse_location_request_message(row.get("message")) or {}
    latitude = location_coordinate(payload, "latitude", "lat", "mapLatitude", "map_latitude")
    longitude = location_coordinate(payload, "longitude", "lng", "lon", "mapLongitude", "map_longitude")
    return {
        "request_id": row.get("id"),
        "name": payload.get("placeName") or "Untitled location",
        "location_hint": payload.get("locationHint") or "",
        "latitude": latitude,
        "longitude": longitude,
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
        self.reply.custom_id = f"{FEEDBACK_VIEW_PREFIX}:{feedback_id}:reply"
        self.close.custom_id = f"{FEEDBACK_VIEW_PREFIX}:{feedback_id}:close"

    @discord.ui.button(label="Reply to user", emoji="💬", style=discord.ButtonStyle.primary)
    async def reply(self, interaction, button):
        await interaction.response.send_modal(ReplyModal(self.cog, self.feedback_id))

    @discord.ui.button(label="Close ticket", emoji="✅", style=discord.ButtonStyle.success)
    async def close(self, interaction, button):
        try:
            self.cog.supabase.table("feedback_messages").update({
                "status": "closed",
            }).eq("id", self.feedback_id).execute()
        except Exception as error:
            await interaction.response.send_message(
                f"❌ Could not close website ticket: {error}",
                ephemeral=True,
            )
            return

        await interaction.response.send_message(
            "✅ Website ticket marked closed. Deleting this Discord ticket thread…",
            ephemeral=True,
        )
        await self.cog.delete_feedback_ticket_thread(interaction, self.feedback_id)



class ReportDecisionView(discord.ui.View):
    def __init__(self, cog, report_id):
        super().__init__(timeout=None)
        self.cog = cog
        self.report_id = report_id
        self.archive.custom_id = f"{REPORT_VIEW_PREFIX}:{report_id}:archive"

    @discord.ui.button(label="Archive report", emoji="✅", style=discord.ButtonStyle.success)
    async def archive(self, interaction, button):
        if not self.cog.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        self.cog.supabase.table("reports").delete().eq("id", self.report_id).execute()
        await interaction.response.send_message("✅ Report archived/removed from the website queue.", ephemeral=True)



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
        required = ["short_description", "full_description", "latitude", "longitude"]
        missing = [
            field.replace("_", " ")
            for field in required
            if self.draft.get(field) in (None, "")
        ]
        if missing:
            await interaction.response.send_message(f"❌ Fill required fields first: {', '.join(missing)}.", ephemeral=True)
            return
        try:
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
        except Exception as error:
            await interaction.response.send_message(f"❌ Could not create location: {error}", ephemeral=True)
            return
        await interaction.response.send_message("✅ Location created and website ticket closed.", ephemeral=True)
        
        
class GalleryDecisionView(discord.ui.View):
    def __init__(self, cog, image_path):
        super().__init__(timeout=None)
        self.cog = cog
        self.image_path = image_path
        self.general.custom_id = stable_component_id(GALLERY_VIEW_PREFIX, image_path, "general")
        self.nude.custom_id = stable_component_id(GALLERY_VIEW_PREFIX, image_path, "nude")
        self.reject.custom_id = stable_component_id(GALLERY_VIEW_PREFIX, image_path, "reject")
        self.pending.custom_id = stable_component_id(GALLERY_VIEW_PREFIX, image_path, "pending")

    async def close_review_post(self, interaction, message):
        self.cog.sync_state.setdefault("gallery", {}).pop(self.image_path, None)
        self.cog.sync_state.setdefault("gallery_decided", {})[self.image_path] = now_iso()
        save_json(SYNC_FILE, self.cog.sync_state)
        await interaction.response.send_message(message, ephemeral=True)
        try:
            if isinstance(interaction.channel, discord.Thread):
                await interaction.channel.delete()
            else:
                await interaction.message.delete()
        except Exception as error:
            print(f"[PLATFORM_GROVE] Could not delete gallery review post {self.image_path}: {error}")

    async def set_gallery(self, interaction, gallery_type):
        self.cog.supabase.table("gallery_media").update({
            "gallery_type": gallery_type,
            "moderation_status": "approved",
            "moderation_reason": f"Approved from Discord by {interaction.user}",
            "updated_at": now_iso(),
        }).eq("image_path", self.image_path).execute()
        await self.close_review_post(interaction, f"✅ Moved to {gallery_type} gallery and removed the review post.")

    @discord.ui.button(label="General gallery", emoji="🌿", style=discord.ButtonStyle.success)
    async def general(self, interaction, button):
        await self.set_gallery(interaction, "general")

    @discord.ui.button(label="Nude gallery", emoji="🖼️", style=discord.ButtonStyle.primary)
    async def nude(self, interaction, button):
        await self.set_gallery(interaction, "nude")

    @discord.ui.button(label="Reject", emoji="🗑️", style=discord.ButtonStyle.danger)
    async def reject(self, interaction, button):
        self.cog.supabase.table("gallery_media").update({
            "gallery_type": "pending",
            "moderation_status": "rejected",
            "moderation_reason": f"Rejected from Discord by {interaction.user}",
            "updated_at": now_iso(),
        }).eq("image_path", self.image_path).execute()
        await self.close_review_post(interaction, "🗑️ Gallery item rejected and review post removed.")

    @discord.ui.button(label="Keep pending", emoji="⏳", style=discord.ButtonStyle.secondary)
    async def pending(self, interaction, button):
        self.cog.supabase.table("gallery_media").update({
            "gallery_type": "pending",
            "moderation_status": "pending",
            "updated_at": now_iso(),
        }).eq("image_path", self.image_path).execute()
        await self.close_review_post(interaction, "⏳ Gallery item left pending and review post removed.")


class ApplicationDecisionView(discord.ui.View):
    def __init__(self, cog, user_id):
        super().__init__(timeout=None)
        self.cog = cog
        self.user_id = user_id
        self.approve.custom_id = stable_component_id("application_review", user_id, "approve")
        self.reject.custom_id = stable_component_id("application_review", user_id, "reject")

    async def decide(self, interaction, status):
        await self.cog.set_application_status(interaction, self.user_id, status, None, close_thread=True)

    @discord.ui.button(label="Approve", emoji="✅", style=discord.ButtonStyle.success)
    async def approve(self, interaction, button):
        await self.decide(interaction, "approved")

    @discord.ui.button(label="Reject", emoji="⛔", style=discord.ButtonStyle.danger)
    async def reject(self, interaction, button):
        await self.decide(interaction, "rejected")


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
        self.warn.custom_id = f"{MEMBER_VIEW_PREFIX}:{user_id}:warn"
        self.ban.custom_id = f"{MEMBER_VIEW_PREFIX}:{user_id}:ban"

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
            "gallery_decided": {},
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
    
    async def delete_feedback_ticket_thread(self, interaction, feedback_id):
        self.sync_state.setdefault("feedback", {}).pop(feedback_id, None)
        self.sync_state.setdefault("location_drafts", {}).pop(feedback_id, None)
        save_json(SYNC_FILE, self.sync_state)

        try:
            if isinstance(interaction.channel, discord.Thread):
                await interaction.channel.delete()
            elif interaction.message:
                await interaction.message.delete()
        except Exception as error:
            print(f"[PLATFORM_GROVE] Could not delete feedback ticket thread {feedback_id}: {error}")
                
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
    
    async def restore_persistent_views(self):
        """Re-register buttons/selects on synced forum starter messages after restarts."""
        feedback_threads = self.sync_state.get("feedback", {})
        if feedback_threads:
            response = (
                self.supabase.table("feedback_messages")
                .select("*")
                .neq("status", "closed")
                .execute()
            )
            rows_by_id = {row.get("id"): row for row in response.data or []}
            for feedback_id, thread_id in feedback_threads.items():
                row = rows_by_id.get(feedback_id)
                if not row:
                    continue
                is_location = (row.get("message") or "").startswith(LOCATION_REQUEST_PREFIX)
                view = LocationRequestView(self, feedback_id, row) if is_location else FeedbackView(self, feedback_id)
                await self.restore_thread_view(thread_id, view, feedback_id)

        for report_id, thread_id in self.sync_state.get("reports", {}).items():
            await self.restore_thread_view(thread_id, ReportDecisionView(self, report_id), report_id)

        for user_id, thread_id in self.sync_state.get("applications", {}).items():
            await self.restore_thread_view(thread_id, ApplicationDecisionView(self, user_id), user_id)

        for image_path, thread_id in self.sync_state.get("gallery", {}).items():
            await self.restore_thread_view(thread_id, GalleryDecisionView(self, image_path), image_path)

    def remove_stale_sync_entry(self, label):
        removed = False
        for bucket in ("feedback", "reports", "applications", "gallery"):
            entries = self.sync_state.setdefault(bucket, {})
            if label in entries:
                entries.pop(label, None)
                removed = True
        if removed:
            save_json(SYNC_FILE, self.sync_state)
        return removed

    async def restore_thread_view(self, thread_id, view, label):
        try:
            message_id = int(thread_id)
        except (TypeError, ValueError):
            return
        self.bot.add_view(view, message_id=message_id)
        try:
            thread = self.bot.get_channel(message_id) or await self.bot.fetch_channel(message_id)
            starter_message = await thread.fetch_message(message_id)
            await starter_message.edit(view=view)
        except discord.NotFound as error:
            if self.remove_stale_sync_entry(label):
                print(f"[PLATFORM_GROVE] Removed stale persistent view {label}: {error}")
            else:
                print(f"[PLATFORM_GROVE] Could not refresh persistent view {label}: {error}")
        except Exception as error:
            print(f"[PLATFORM_GROVE] Could not refresh persistent view {label}: {error}")

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
            thread = await self.create_forum_thread(PLATFORM_REPORTS, f"Report • {report_id[:8]}", "Website report synced from BareUnity.", embed, ReportDecisionView(self, report_id))
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
            thread = await self.create_forum_thread(MEMBER_APPLICATIONS, f"Application • {row.get('display_name') or user_id[:8]}", "Schedule and record the onboarding video meeting here.", embed, ApplicationDecisionView(self, user_id))
            if thread:
                self.sync_state["applications"][user_id] = str(thread.id)

    async def sync_gallery(self):
        response = self.supabase.table("gallery_media").select("*").eq("gallery_type", "pending").order("created_at", desc=True).limit(25).execute()
        for row in response.data or []:
            image_path = row.get("image_path")
            if (
                not image_path
                or image_path in self.sync_state["gallery"]
                or image_path in self.sync_state.get("gallery_decided", {})
            ):
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
        await self.restore_persistent_views()

    async def ensure_unique_username(self, requested):
        base = normalize_username(requested)
        response = self.supabase.table("profiles").select("id").eq("username", base).limit(1).execute()
        if not response.data:
            return base
        for suffix in range(1, 100):
            candidate = f"{base}-{suffix}"
            response = self.supabase.table("profiles").select("id").eq("username", candidate).limit(1).execute()
            if not response.data:
                return candidate
        return f"{base}-{datetime.now(timezone.utc).strftime('%H%M%S')}"

    @app_commands.command(name="admin_user_create", description="Create a BareUnity website user from Discord")
    async def admin_user_create(self, interaction, email: str, password: str, display_name: str, username: str | None = None):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        if "@" not in email or not has_strong_password(password):
            await interaction.response.send_message("❌ Enter a valid email and a 12+ character password with uppercase, lowercase, number, and symbol.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        final_username = await self.ensure_unique_username(username or display_name or email.split("@")[0])
        try:
            created = self.supabase.auth.admin.create_user({
                "email": email.strip().lower(),
                "password": password,
                "email_confirm": True,
                "user_metadata": {"display_name": display_name.strip()},
            })
            user = getattr(created, "user", None) or (created.get("user") if isinstance(created, dict) else None)
            user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        except Exception as error:
            await interaction.followup.send(f"❌ Could not create auth user: {error}", ephemeral=True)
            return
        if not user_id:
            await interaction.followup.send("❌ Supabase did not return a user id.", ephemeral=True)
            return
        profile_response = self.supabase.table("profiles").upsert({
            "id": user_id,
            "username": final_username,
            "display_name": display_name.strip(),
        }).execute()
        if not profile_response.data:
            await interaction.followup.send("⚠️ User auth account was created, but the profile upsert did not return data.", ephemeral=True)
            return
        await interaction.followup.send(f"✅ Created website user `{final_username}` ({user_id}).", ephemeral=True)

    @app_commands.command(name="admin_user_search", description="Search BareUnity website users from Discord")
    async def admin_user_search(self, interaction, query: str):
        if interaction.channel_id != PLATFORM_OPERATIONS and not self.is_member_management_channel(interaction):
            await interaction.response.send_message("❌ Use this in #platform-operations or member-management.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        response = (
            self.supabase.table("profiles")
            .select("id, username, display_name, location, created_at")
            .or_(f"username.ilike.%{query}%,display_name.ilike.%{query}%")
            .limit(10)
            .execute()
        )
        if not response.data:
            await interaction.response.send_message("No matching website users found.", ephemeral=True)
            return
        embed = discord.Embed(title="Website user search", color=discord.Color.green())
        for profile in response.data:
            embed.add_field(
                name=profile.get("display_name") or profile.get("username") or profile.get("id"),
                value=f"ID: `{profile.get('id')}`\nUsername: `{profile.get('username')}`\nLocation: {profile.get('location') or 'Unknown'}",
                inline=False,
            )
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="admin_user_delete", description="Delete a BareUnity website auth user and profile from Discord")
    async def admin_user_delete(self, interaction, user_id: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        try:
            self.supabase.auth.admin.delete_user(user_id)
        except Exception as error:
            await interaction.followup.send(f"❌ Could not delete auth user: {error}", ephemeral=True)
            return
        self.supabase.table("profiles").delete().eq("id", user_id).execute()
        await interaction.followup.send(f"✅ Deleted website user `{user_id}`.", ephemeral=True)

    @app_commands.command(name="country_get", description="Show a BareUnity country discovery profile")
    async def country_get(self, interaction, name: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        response = self.supabase.table("country_discovery_profiles").select("*").ilike("name", name).limit(1).execute()
        if not response.data:
            await interaction.response.send_message("❌ Country profile not found.", ephemeral=True)
            return
        country = response.data[0]
        embed = discord.Embed(title=f"{country.get('flag') or '🌍'} {country.get('name')}", description=country.get("tagline") or "", color=discord.Color.green())
        for label, key in [("Slug", "slug"), ("Continent", "continent"), ("Legal", "legal_status"), ("Best time", "best_time")]:
            if country.get(key):
                embed.add_field(name=label, value=str(country[key])[:1024], inline=True)
        if country.get("hero_image"):
            embed.set_image(url=country["hero_image"])
        await interaction.response.send_message(embed=embed, ephemeral=False)

    @app_commands.command(name="country_upsert_basic", description="Create/update a country discovery profile from Discord")
    async def country_upsert_basic(self, interaction, name: str, flag: str, continent: str, tagline: str, hero_image: str, legal_status: str, best_time: str, slug: str | None = None):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        final_slug = slugify(slug or name)
        payload = {
            "slug": final_slug,
            "name": name.strip(),
            "flag": flag.strip(),
            "continent": continent.strip(),
            "tagline": tagline.strip(),
            "hero_image": hero_image.strip(),
            "legal_status": legal_status.strip(),
            "beaches_count": "Add details",
            "resorts_count": "Add details",
            "community_rating": "New",
            "community_members": "0",
            "glance": {},
            "culture_scores": {},
            "laws": [{"topic": "Naturism", "status": "caution", "summary": legal_status.strip()}],
            "first_time_tips": ["Check local guidance before visiting."],
            "etiquette": ["Respect local rules and community privacy."],
            "best_time": best_time.strip(),
            "regions": [],
            "beaches": [],
            "season": {"months": [], "air": [], "sea": [], "vibe": []},
            "faqs": [],
            "tags": [],
            "updated_at": now_iso(),
        }
        response = self.supabase.table("country_discovery_profiles").upsert(payload, on_conflict="slug").execute()
        if not response.data:
            await interaction.response.send_message("⚠️ Country upsert completed but returned no data.", ephemeral=True)
            return
        await interaction.response.send_message(f"✅ Country profile `{final_slug}` saved from Discord.", ephemeral=True)

    @app_commands.command(name="stay_create_basic", description="Create a basic stay listing and map spot from Discord")
    async def stay_create_basic(self, interaction, name: str, country: str, place_name: str, website_url: str, latitude: str, longitude: str, description: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        slug = slugify(name)
        lat = parse_float(latitude)
        lon = parse_float(longitude)
        stay_payload = {
            "slug": slug, "name": name, "country": country, "place_name": place_name, "type": "Naturist camping",
            "rating": 4.5, "price": "Check website", "badge": "Discord-created stay", "vibe": "Naturist-friendly stay",
            "amenities": [], "description": description, "website_url": website_url, "address": place_name,
            "map_latitude": lat, "map_longitude": lon, "check_in_window": "Check the stay website for current arrival times",
            "gallery": [], "policies": [],
        }
        self.supabase.table("stays").upsert(stay_payload, on_conflict="slug").execute()
        self.supabase.table("naturist_map_spots").upsert({
            "name": name, "description": description, "short_description": description[:240], "latitude": lat, "longitude": lon,
            "privacy": "Public", "location_hint": place_name, "access_type": "Public", "terrain": "Stays",
            "safety_level": "Beginner Friendly", "website": website_url, "amenities": [], "tags": ["stays"],
            "reporter_notes": f"Created from Discord by {interaction.user}", "status": "approved",
        }).execute()
        await interaction.response.send_message(f"✅ Stay `{slug}` saved and map spot created.", ephemeral=True)

    @app_commands.command(name="activity_create_basic", description="Create a basic activity map listing from Discord")
    async def activity_create_basic(self, interaction, name: str, place_name: str, website_url: str, latitude: str, longitude: str, description: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        lat = parse_float(latitude)
        lon = parse_float(longitude)
        self.supabase.table("naturist_map_spots").insert({
            "name": name, "description": description, "short_description": description[:240], "latitude": lat, "longitude": lon,
            "privacy": "Public", "location_hint": place_name, "access_type": "Public", "terrain": "Activity",
            "safety_level": "Beginner Friendly", "website": website_url, "amenities": ["Hosted activity"],
            "tags": ["activities", "events", "bookings"], "reporter_notes": f"Created from Discord by {interaction.user}", "status": "approved",
        }).execute()
        await interaction.response.send_message("✅ Activity map listing created from Discord.", ephemeral=True)

    @app_commands.command(name="admin_user_update_json", description="Update detailed website user/profile fields from a JSON payload")
    async def admin_user_update_json(self, interaction, user_id: str, payload_json: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        try:
            payload = load_json_payload(payload_json)
        except ValueError as error:
            await interaction.response.send_message(f"❌ {error}", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        profile_fields = {
            key: value_for(payload, key)
            for key in [
                "username", "display_name", "bio", "location", "avatar_url", "cover_url",
                "membership_type", "verification_status", "country", "website", "instagram",
            ]
            if value_for(payload, key) is not None
        }
        if "username" in profile_fields:
            profile_fields["username"] = normalize_username(profile_fields["username"])
        if profile_fields:
            self.supabase.table("profiles").update(profile_fields).eq("id", user_id).execute()

        settings_fields = {
            key: value_for(payload, key)
            for key in ["user_role", "is_private", "email_notifications", "push_notifications"]
            if value_for(payload, key) is not None
        }
        if settings_fields:
            settings_fields["user_id"] = user_id
            settings_fields["updated_at"] = now_iso()
            self.supabase.table("profile_settings").upsert(settings_fields, on_conflict="user_id").execute()

        auth_metadata = value_for(payload, "user_metadata", "metadata")
        if isinstance(auth_metadata, dict):
            try:
                self.supabase.auth.admin.update_user_by_id(user_id, {"user_metadata": auth_metadata})
            except Exception as error:
                await interaction.followup.send(f"⚠️ Profile updated, but auth metadata update failed: {error}", ephemeral=True)
                return

        await interaction.followup.send(f"✅ Website user `{user_id}` updated from Discord JSON.", ephemeral=True)

    @app_commands.command(name="country_upsert_json", description="Create/update a full country discovery profile from JSON")
    async def country_upsert_json(self, interaction, payload_json: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        try:
            payload = load_json_payload(payload_json)
        except ValueError as error:
            await interaction.response.send_message(f"❌ {error}", ephemeral=True)
            return
        name = str(value_for(payload, "name", default="")).strip()
        final_slug = slugify(value_for(payload, "slug", default=name))
        if not name:
            await interaction.response.send_message("❌ Country JSON must include `name`.", ephemeral=True)
            return
        row = {
            "slug": final_slug,
            "name": name,
            "flag": value_for(payload, "flag", default="🌍"),
            "continent": value_for(payload, "continent", default="Unknown"),
            "tagline": value_for(payload, "tagline", default=f"Naturist guide for {name}"),
            "hero_image": value_for(payload, "heroImage", "hero_image", default="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee"),
            "legal_status": value_for(payload, "legalStatus", "legal_status", default="Check local guidance before visiting."),
            "beaches_count": value_for(payload, "beachesCount", "beaches_count", default="0"),
            "resorts_count": value_for(payload, "resortsCount", "resorts_count", default="0"),
            "community_rating": value_for(payload, "communityRating", "community_rating", default="New"),
            "community_members": value_for(payload, "communityMembers", "community_members", default="0"),
            "glance": value_for(payload, "glance", default={}),
            "culture_scores": value_for(payload, "cultureScores", "culture_scores", default={}),
            "laws": value_for(payload, "laws", default=[]),
            "first_time_tips": value_for(payload, "firstTimeTips", "first_time_tips", default=[]),
            "etiquette": value_for(payload, "etiquette", default=[]),
            "best_time": value_for(payload, "bestTime", "best_time", default="Year-round with local checks"),
            "regions": value_for(payload, "regions", default=[]),
            "beaches": value_for(payload, "beaches", default=[]),
            "season": value_for(payload, "season", default={}),
            "faqs": value_for(payload, "faqs", default=[]),
            "tags": list_from_payload(value_for(payload, "tags", default=[])),
            "updated_at": now_iso(),
        }
        self.supabase.table("country_discovery_profiles").upsert(row, on_conflict="slug").execute()
        await interaction.response.send_message(f"✅ Full country profile `{final_slug}` saved from Discord JSON.", ephemeral=True)

    @app_commands.command(name="stay_upsert_json", description="Create/update a full stay listing from JSON")
    async def stay_upsert_json(self, interaction, payload_json: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        try:
            payload = load_json_payload(payload_json)
        except ValueError as error:
            await interaction.response.send_message(f"❌ {error}", ephemeral=True)
            return
        name = str(value_for(payload, "name", default="")).strip()
        if not name:
            await interaction.response.send_message("❌ Stay JSON must include `name`.", ephemeral=True)
            return
        slug = slugify(value_for(payload, "slug", default=name))
        lat = parse_float(value_for(payload, "mapLatitude", "map_latitude", "latitude", default=0))
        lon = parse_float(value_for(payload, "mapLongitude", "map_longitude", "longitude", default=0))
        row = {
            "slug": slug,
            "name": name,
            "country": value_for(payload, "country", default=""),
            "place_name": value_for(payload, "placeName", "place_name", default=""),
            "type": value_for(payload, "type", default="Naturist camping"),
            "rating": parse_float(value_for(payload, "rating", default=4.5), 4.5),
            "price": value_for(payload, "price", default="Check website"),
            "badge": value_for(payload, "badge", default="Discord-managed stay"),
            "vibe": value_for(payload, "vibe", default="Naturist-friendly stay"),
            "amenities": list_from_payload(value_for(payload, "amenities", default=[])),
            "description": value_for(payload, "description", default=""),
            "website_url": value_for(payload, "websiteUrl", "website_url", default=""),
            "address": value_for(payload, "address", default=value_for(payload, "placeName", "place_name", default="")),
            "map_latitude": lat,
            "map_longitude": lon,
            "check_in_window": value_for(payload, "checkInWindow", "check_in_window", default="Check the stay website for current arrival times"),
            "gallery": list_from_payload(value_for(payload, "gallery", default=[])),
            "policies": value_for(payload, "policies", default=[]),
        }
        self.supabase.table("stays").upsert(row, on_conflict="slug").execute()
        self.supabase.table("naturist_map_spots").upsert({
            "name": name,
            "description": row["description"],
            "short_description": str(row["description"])[:240],
            "latitude": lat,
            "longitude": lon,
            "privacy": value_for(payload, "privacy", default="Public"),
            "location_hint": row["place_name"] or row["address"],
            "access_type": value_for(payload, "accessType", "access_type", default="Public"),
            "terrain": "Stays",
            "safety_level": value_for(payload, "safetyLevel", "safety_level", default="Beginner Friendly"),
            "website": row["website_url"],
            "amenities": row["amenities"],
            "tags": list_from_payload(value_for(payload, "tags", default=["stays"])),
            "reporter_notes": f"Full stay upsert from Discord by {interaction.user}",
            "status": "approved",
        }).execute()
        await interaction.response.send_message(f"✅ Full stay `{slug}` saved from Discord JSON.", ephemeral=True)

    @app_commands.command(name="activity_upsert_json", description="Create/update a full activity listing JSON file and map spot")
    async def activity_upsert_json(self, interaction, payload_json: str):
        if interaction.channel_id != PLATFORM_OPERATIONS:
            await interaction.response.send_message("❌ Use this in #platform-operations.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        try:
            payload = load_json_payload(payload_json)
        except ValueError as error:
            await interaction.response.send_message(f"❌ {error}", ephemeral=True)
            return
        name = str(value_for(payload, "name", default="")).strip()
        if not name:
            await interaction.response.send_message("❌ Activity JSON must include `name`.", ephemeral=True)
            return
        slug = slugify(value_for(payload, "slug", default=name))
        lat = parse_float(value_for(payload, "mapLatitude", "map_latitude", "latitude", default=0))
        lon = parse_float(value_for(payload, "mapLongitude", "map_longitude", "longitude", default=0))
        listing = {
            "slug": slug,
            "name": name,
            "country": value_for(payload, "country", default=""),
            "placeName": value_for(payload, "placeName", "place_name", default=""),
            "type": value_for(payload, "type", default="Event"),
            "rating": parse_float(value_for(payload, "rating", default=4.5), 4.5),
            "price": value_for(payload, "price", default="Check website"),
            "badge": value_for(payload, "badge", default="Discord-managed activity"),
            "vibe": value_for(payload, "vibe", default="Naturist-friendly experience"),
            "amenities": list_from_payload(value_for(payload, "amenities", default=[])),
            "description": value_for(payload, "description", default=""),
            "websiteUrl": value_for(payload, "websiteUrl", "website_url", default=""),
            "address": value_for(payload, "address", default=value_for(payload, "placeName", "place_name", default="")),
            "mapLatitude": lat,
            "mapLongitude": lon,
            "checkInWindow": value_for(payload, "checkInWindow", "check_in_window", default="Check the activity website for current schedule"),
            "gallery": list_from_payload(value_for(payload, "gallery", default=[])),
            "policies": value_for(payload, "policies", default=[]),
        }
        data_path = repo_root() / "src/app/bookings/activities/activities-data-store.json"
        saved_file = False
        if data_path.exists():
            try:
                current = json.loads(data_path.read_text(encoding="utf-8"))
                if not isinstance(current, list):
                    current = []
                current = [item for item in current if item.get("slug") != slug]
                current.append(listing)
                current.sort(key=lambda item: str(item.get("name", "")).lower())
                data_path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
                saved_file = True
            except Exception as error:
                await interaction.response.send_message(f"❌ Could not write activity data file: {error}", ephemeral=True)
                return
        self.supabase.table("naturist_map_spots").upsert({
            "name": name,
            "description": listing["description"],
            "short_description": str(listing["description"])[:240],
            "latitude": lat,
            "longitude": lon,
            "privacy": value_for(payload, "privacy", default="Public"),
            "location_hint": listing["placeName"] or listing["address"],
            "access_type": value_for(payload, "accessType", "access_type", default="Public"),
            "terrain": "Activity",
            "safety_level": value_for(payload, "safetyLevel", "safety_level", default="Beginner Friendly"),
            "website": listing["websiteUrl"],
            "amenities": listing["amenities"],
            "tags": list_from_payload(value_for(payload, "tags", default=["activities", "events", "bookings"])),
            "reporter_notes": f"Full activity upsert from Discord by {interaction.user}",
            "status": "approved",
        }).execute()
        file_note = " and activity data file updated" if saved_file else " (map spot only; data file not found in bot runtime)"
        await interaction.response.send_message(f"✅ Full activity `{slug}` saved from Discord JSON{file_note}.", ephemeral=True)

    @app_commands.command(name="gallery_moderation_update", description="Moderate a gallery image by storage path from Discord")
    async def gallery_moderation_update(self, interaction, image_path: str, action: str, reason: str | None = None):
        if interaction.channel_id != GALLERY_REVIEW:
            await interaction.response.send_message("❌ Use this in #gallery-review.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return
        action_map = {
            "approve_general": ("general", "approved"),
            "approve_nude": ("nude", "approved"),
            "reject": ("pending", "rejected"),
            "pending": ("pending", "pending"),
        }
        if action not in action_map:
            await interaction.response.send_message("❌ Action must be approve_general, approve_nude, reject, or pending.", ephemeral=True)
            return
        gallery_type, moderation_status = action_map[action]
        self.supabase.table("gallery_media").update({
            "gallery_type": gallery_type,
            "moderation_status": moderation_status,
            "moderation_reason": reason or f"{action} from Discord by {interaction.user}",
            "updated_at": now_iso(),
        }).eq("image_path", image_path).execute()
        await interaction.response.send_message(f"✅ Gallery media `{image_path}` updated to `{moderation_status}` / `{gallery_type}`.", ephemeral=True)

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

    async def set_application_status(self, interaction, user_id: str, status: str, notes: str | None = None, close_thread: bool = False):
        if interaction.channel_id != MEMBER_APPLICATIONS and not (
            isinstance(interaction.channel, discord.Thread)
            and interaction.channel.parent_id == MEMBER_APPLICATIONS
        ):
            await interaction.response.send_message("❌ Use this in member-applications or one of its posts.", ephemeral=True)
            return
        if not self.is_staff(interaction.user):
            await interaction.response.send_message("❌ Staff only.", ephemeral=True)
            return

        update = {
            "status": status,
            "reviewer_notes": notes or f"{status.title()} from Discord by {interaction.user}",
            "updated_at": now_iso(),
        }
        response = (
            self.supabase.table("verification_submissions")
            .update(update)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            await interaction.response.send_message("❌ Application not found.", ephemeral=True)
            return

        if status == "approved":
            self.supabase.table("profile_settings").upsert({
                "user_id": user_id,
                "user_role": "newcomer",
                "onboarding_completed": True,
                "updated_at": now_iso(),
            }, on_conflict="user_id").execute()

        self.sync_state.setdefault("applications", {}).pop(user_id, None)
        save_json(SYNC_FILE, self.sync_state)
        await interaction.response.send_message(f"✅ Application `{user_id}` marked {status} on the website.", ephemeral=True)
        if close_thread:
            try:
                if isinstance(interaction.channel, discord.Thread):
                    await interaction.channel.delete()
            except Exception as error:
                print(f"[PLATFORM_GROVE] Could not delete application post {user_id}: {error}")

    @app_commands.command(name="application_approve", description="Approve a website verification application from Discord")
    async def application_approve(self, interaction, user_id: str, notes: str | None = None):
        await self.set_application_status(interaction, user_id, "approved", notes)

    @app_commands.command(name="application_reject", description="Reject a website verification application from Discord")
    async def application_reject(self, interaction, user_id: str, notes: str | None = None):
        await self.set_application_status(interaction, user_id, "rejected", notes)

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
