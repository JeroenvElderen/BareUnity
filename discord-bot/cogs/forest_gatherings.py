import asyncio
import json
import os
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

FOREST_GATHERINGS_FORUM_ID = 1521828325356736554
STATE_FILE = "forest_gatherings.json"
EVENT_LENGTH_DAYS = 7

DEFAULT_THEME = "🗺️ The Unknown Path"
DEFAULT_MISSION = (
    "Explore a local forest, beach, park, hiking trail, mountain, or other natural area. "
    "Create your own forum post with 1–5 photos, at least 5 discoveries, a short reflection, "
    "and at least one photo showing you were present."
)
DEFAULT_DISCOVERIES = [
    "A tree older than you",
    "Flowing water",
    "A hidden trail",
    "A colourful flower",
    "Evidence of wildlife",
    "An interesting rock",
    "Moss or fungi",
    "A beautiful viewpoint",
    "A wild animal or bird",
    "Something that made you smile",
]


def load_state():
    if not os.path.exists(STATE_FILE):
        return {}

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return {}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as file:
        json.dump(state, file, indent=4)


def parse_discoveries(value):
    if not value:
        return DEFAULT_DISCOVERIES

    normalized = value.replace(",", "\n")
    items = [item.strip(" -•✅\t") for item in normalized.splitlines()]
    items = [item for item in items if item]
    return items[:10] if items else DEFAULT_DISCOVERIES


class GatheringSetupModal(discord.ui.Modal):
    def __init__(self, cog):
        super().__init__(title="Start Forest Gathering")
        self.cog = cog

        self.theme = discord.ui.TextInput(
            label="Monthly theme",
            placeholder="Example: Follow the Water",
            default=DEFAULT_THEME,
            max_length=100
        )
        self.mission = discord.ui.TextInput(
            label="Mission",
            style=discord.TextStyle.paragraph,
            placeholder="What should members do during this gathering?",
            default=DEFAULT_MISSION,
            max_length=1000
        )
        self.discoveries = discord.ui.TextInput(
            label="Discovery challenge",
            style=discord.TextStyle.paragraph,
            placeholder="Add up to 10 discoveries, one per line.",
            default="\n".join(DEFAULT_DISCOVERIES),
            max_length=1800
        )
        self.wrap_up = discord.ui.TextInput(
            label="Weekly wrap-up note",
            style=discord.TextStyle.paragraph,
            placeholder="Optional: Tell members when/how the wrap-up will happen.",
            required=False,
            max_length=700
        )

        self.add_item(self.theme)
        self.add_item(self.mission)
        self.add_item(self.discoveries)
        self.add_item(self.wrap_up)

    async def on_submit(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message(
                "❌ You need Manage Channels permission to start a Forest Gathering.",
                ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)
        await self.cog.start_event(
            interaction=interaction,
            theme=str(self.theme.value).strip() or DEFAULT_THEME,
            mission=str(self.mission.value).strip() or DEFAULT_MISSION,
            discoveries=parse_discoveries(str(self.discoveries.value)),
            wrap_up=str(self.wrap_up.value).strip() or None
        )


class ForestGatherings(commands.Cog):
    gathering = app_commands.Group(
        name="gathering",
        description="Manage BareUnity Forest Gatherings"
    )

    def __init__(self, bot):
        self.bot = bot
        self.close_task = None
        self.state = load_state()

    def get_forum(self):
        channel = self.bot.get_channel(FOREST_GATHERINGS_FORUM_ID)
        if isinstance(channel, discord.ForumChannel):
            return channel
        return None

    def build_event_embed(self, theme, mission, discoveries, ends_at, wrap_up=None):
        embed = discord.Embed(
            title=f"🌳 BareUnity Forest Gathering: {theme}",
            description=(
                "A 7-day nature adventure from wherever you are in the world. "
                "Open your own forum post for this challenge and share your journey."
            ),
            color=discord.Color.green()
        )
        embed.add_field(name="🎯 Mission", value=mission[:1024], inline=False)
        embed.add_field(
            name="🔍 Discovery Challenge",
            value="\n".join(f"✅ {item}" for item in discoveries)[:1024],
            inline=False
        )
        embed.add_field(
            name="📸 How to participate",
            value=(
                "Create one forum post with **1–5 photos**, the discoveries you found, "
                "a short story or reflection, and an optional general location. "
                "At least one photo must include you at the location."
            ),
            inline=False
        )
        if wrap_up:
            embed.add_field(
                name="🎉 Weekly Wrap-Up",
                value=wrap_up[:1024],
                inline=False
            )

        embed.add_field(
            name="⏳ Closes",
            value=f"<t:{ends_at}:F>\n<t:{ends_at}:R>",
            inline=False
        )
        return embed

    async def set_forum_open(self, forum, is_open):
        default_role = forum.guild.default_role
        overwrite = forum.overwrites_for(default_role)
        overwrite.view_channel = is_open
        overwrite.create_public_threads = is_open
        overwrite.send_messages = is_open
        overwrite.send_messages_in_threads = is_open
        await forum.set_permissions(default_role, overwrite=overwrite)

    async def close_forum(self, reason="Forest Gathering ended"):
        forum = self.get_forum()
        if not forum:
            return False, "Forest Gathering forum channel was not found."

        await self.set_forum_open(forum, False)

        for thread in list(forum.threads):
            try:
                await thread.edit(locked=True, archived=True, reason=reason)
            except Exception as error:
                print(f"[FOREST_GATHERINGS] Could not lock thread {thread.id}: {error}")

        self.state["active"] = False
        self.state["closed_at"] = int(discord.utils.utcnow().timestamp())
        save_state(self.state)
        return True, "Forest Gathering channel closed."

    async def close_when_due(self):
        try:
            while True:
                end_at = self.state.get("end_at")
                if not self.state.get("active") or not end_at:
                    return

                remaining = end_at - int(discord.utils.utcnow().timestamp())
                if remaining <= 0:
                    await self.close_forum()
                    return

                await asyncio.sleep(min(remaining, 3600))
        except asyncio.CancelledError:
            return

    def schedule_close(self):
        if self.close_task:
            self.close_task.cancel()
        self.close_task = asyncio.create_task(self.close_when_due())

    @commands.Cog.listener()
    async def on_ready(self):
        if self.state.get("active"):
            self.schedule_close()

    async def start_event(self, interaction, theme, mission, discoveries, wrap_up=None):
        forum = self.get_forum()
        if not forum:
            await interaction.followup.send(
                "❌ Forest Gathering forum channel was not found.",
                ephemeral=True
            )
            return

        now = discord.utils.utcnow()
        ends_at = int((now + timedelta(days=EVENT_LENGTH_DAYS)).timestamp())

        await self.set_forum_open(forum, True)

        embed = self.build_event_embed(
            theme,
            mission,
            discoveries,
            ends_at,
            wrap_up=wrap_up
        )
        created = await forum.create_thread(
            name=f"🌳 Forest Gathering - {theme[:70]}",
            content=(
                "🌿 **The Forest Gathering is open!**\n"
                "Create your own post in this forum to join the current challenge."
            ),
            embed=embed
        )

        starter = created.message
        try:
            await starter.pin()
        except Exception:
            pass

        self.state = {
            "active": True,
            "theme": theme,
            "mission": mission,
            "discoveries": discoveries,
            "wrap_up": wrap_up,
            "forum_id": FOREST_GATHERINGS_FORUM_ID,
            "announcement_thread_id": created.thread.id,
            "announcement_message_id": starter.id,
            "started_at": int(now.timestamp()),
            "end_at": ends_at,
        }
        save_state(self.state)
        self.schedule_close()

        await interaction.followup.send(
            f"✅ Forest Gathering started in {forum.mention} and will close <t:{ends_at}:R>.",
            ephemeral=True
        )

    @gathering.command(
        name="start",
        description="Open a form, or start directly if options are provided"
    )
    @app_commands.describe(
        theme="Monthly theme, for example: The Unknown Path",
        mission="Optional custom mission text",
        discoveries="Optional comma-separated list of around 10 discoveries"
    )
    async def start(
        self,
        interaction: discord.Interaction,
        theme: str | None = None,
        mission: str | None = None,
        discoveries: str | None = None
    ):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message(
                "❌ You need Manage Channels permission to start a Forest Gathering.",
                ephemeral=True
            )
            return

        if not theme and not mission and not discoveries:
            await interaction.response.send_modal(GatheringSetupModal(self))
            return

        await interaction.response.defer(ephemeral=True)
        await self.start_event(
            interaction=interaction,
            theme=theme.strip() if theme and theme.strip() else DEFAULT_THEME,
            mission=mission.strip() if mission and mission.strip() else DEFAULT_MISSION,
            discoveries=parse_discoveries(discoveries),
        )

    @gathering.command(
        name="setup",
        description="Open a form to fill in the Forest Gathering game details"
    )
    async def setup_gathering(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message(
                "❌ You need Manage Channels permission to start a Forest Gathering.",
                ephemeral=True
            )
            return

        await interaction.response.send_modal(GatheringSetupModal(self))

    @gathering.command(
        name="close",
        description="Close the Forest Gatherings forum immediately"
    )
    async def close(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message(
                "❌ You need Manage Channels permission to close a Forest Gathering.",
                ephemeral=True
            )
            return

        await interaction.response.defer(ephemeral=True)
        ok, message = await self.close_forum(reason=f"Closed by {interaction.user}")
        prefix = "✅" if ok else "❌"
        await interaction.followup.send(f"{prefix} {message}", ephemeral=True)

    @gathering.command(
        name="status",
        description="Show the current Forest Gathering status"
    )
    async def status(self, interaction: discord.Interaction):
        if not self.state.get("active"):
            await interaction.response.send_message(
                "🌲 No Forest Gathering is currently open.",
                ephemeral=True
            )
            return

        end_at = self.state.get("end_at")
        await interaction.response.send_message(
            f"🌳 **{self.state.get('theme', 'Forest Gathering')}** is open until <t:{end_at}:F> (<t:{end_at}:R>), in <#{FOREST_GATHERINGS_FORUM_ID}>.",
            ephemeral=True
        )


async def setup(bot):
    await bot.add_cog(ForestGatherings(bot))
