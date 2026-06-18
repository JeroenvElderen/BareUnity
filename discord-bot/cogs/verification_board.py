import discord
import json
import os

from discord.ext import commands
from discord import app_commands


# =========================
# CONFIG
# =========================

VIDEO_REVIEW_CHANNEL = 1515801461651542236

VERIFICATION_FORUM = 1516470493673164810

CALLBACK_CHANNEL = 1516485124835901511

PENDING_REVIEW_TAG = "Pending Review"

# Role given while waiting for board review
ON_HOLD_ROLE = 1516484347442761971

MAPPING_FILE = "verification_threads.json"

OWNER_ROLE = 1516076908742443048
VICE_OWNER_ROLE = 1516076824017506374
STAFF_ROLE = 1516076758275850331

ALLOWED_ROLES = {
    OWNER_ROLE,
    VICE_OWNER_ROLE,
    STAFF_ROLE
}


# =========================
# JSON STORAGE
# =========================

def load_mapping():

    if not os.path.exists(MAPPING_FILE):
        return {}

    try:

        with open(
            MAPPING_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            return json.load(f)

    except Exception:
        return {}


def save_mapping(mapping):

    with open(
        MAPPING_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            mapping,
            f,
            indent=4
        )


# =========================
# COG
# =========================

class VerificationBoard(commands.Cog):

    def __init__(self, bot):

        self.bot = bot
        self.thread_map = load_mapping()

    # -------------------------
    # PERMISSIONS
    # -------------------------

    def has_verification_access(
        self,
        member: discord.Member
    ):

        return any(
            role.id in ALLOWED_ROLES
            for role in member.roles
        )

    # -------------------------
    # THREAD LOOKUP
    # -------------------------

    async def get_or_create_thread(
        self,
        guild: discord.Guild,
        member: discord.Member
    ):

        forum = guild.get_channel(
            VERIFICATION_FORUM
        )

        if not isinstance(
            forum,
            discord.ForumChannel
        ):
            return None

        user_key = str(member.id)

        thread_id = self.thread_map.get(
            user_key
        )

        if thread_id:

            try:

                thread = guild.get_thread(
                    int(thread_id)
                )

                if (
                    isinstance(thread, discord.Thread)
                    and thread.parent_id == VERIFICATION_FORUM
                ):
                    return thread

                thread = await self.bot.fetch_channel(
                    int(thread_id)
                )

                if (
                    isinstance(thread, discord.Thread)
                    and thread.parent_id == VERIFICATION_FORUM
                ):
                    return thread

            except Exception:
                pass

            self.thread_map.pop(
                user_key,
                None
            )

            save_mapping(
                self.thread_map
            )

        joined = (
            f"<t:{int(member.joined_at.timestamp())}:F>"
            if member.joined_at
            else "Unknown"
        )

        created = await forum.create_thread(
            name=f"{member.name}-{member.id}",
            content=(
                f"# Verification Record\n\n"
                f"**User:** {member}\n"
                f"**User ID:** {member.id}\n"
                f"**Account Created:** "
                f"<t:{int(member.created_at.timestamp())}:F>\n"
                f"**Joined Server:** {joined}"
            )
        )

        thread = created.thread

        self.thread_map[
            user_key
        ] = str(thread.id)

        save_mapping(
            self.thread_map
        )

        return thread

    # -------------------------
    # /VNOTE
    # -------------------------

    @app_commands.command(
        name="vnote",
        description="Add an interview note"
    )
    async def vnote(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        note: str
    ):

        if not self.has_verification_access(
            interaction.user
        ):
            await interaction.response.send_message(
                "❌ You do not have permission.",
                ephemeral=True
            )
            return

        if (
            interaction.channel_id
            != VIDEO_REVIEW_CHANNEL
        ):
            await interaction.response.send_message(
                "❌ Use this command in the video verification channel.",
                ephemeral=True
            )
            return

        thread = await self.get_or_create_thread(
            interaction.guild,
            member
        )

        if not thread:

            await interaction.response.send_message(
                "❌ Verification forum not found.",
                ephemeral=True
            )
            return

        embed = discord.Embed(
            title="📝 Interview Note",
            color=discord.Color.orange()
        )

        embed.add_field(
            name="Moderator",
            value=interaction.user.mention,
            inline=False
        )

        embed.add_field(
            name="Candidate",
            value=f"{member} ({member.id})",
            inline=False
        )

        embed.add_field(
            name="Note",
            value=note,
            inline=False
        )

        embed.timestamp = discord.utils.utcnow()

        await thread.send(
            embed=embed
        )

        await interaction.response.send_message(
            f"✅ Note added to **{thread.name}**",
            ephemeral=True
        )

    # -------------------------
    # /HOLD
    # -------------------------

    @app_commands.command(
        name="hold",
        description="Place verification on hold"
    )
    async def hold(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        reason: str
    ):

        if not self.has_verification_access(
            interaction.user
        ):
            await interaction.response.send_message(
                "❌ You do not have permission.",
                ephemeral=True
            )
            return

        if (
            interaction.channel_id
            != VIDEO_REVIEW_CHANNEL
        ):
            await interaction.response.send_message(
                "❌ Use this command in the video verification channel.",
                ephemeral=True
            )
            return

        thread = await self.get_or_create_thread(
            interaction.guild,
            member
        )

        if not thread:

            await interaction.response.send_message(
                "❌ Verification forum not found.",
                ephemeral=True
            )
            return

        embed = discord.Embed(
            title="⏸ Verification On Hold",
            color=discord.Color.red()
        )

        embed.add_field(
            name="Moderator",
            value=interaction.user.mention,
            inline=False
        )

        embed.add_field(
            name="Candidate",
            value=f"{member} ({member.id})",
            inline=False
        )

        embed.add_field(
            name="Reason",
            value=reason,
            inline=False
        )

        embed.timestamp = discord.utils.utcnow()

        await thread.send(
            embed=embed
        )

        # Add Pending Review tag

        try:

            pending_tag = None

            for tag in thread.parent.available_tags:

                if (
                    tag.name.lower()
                    ==
                    PENDING_REVIEW_TAG.lower()
                ):
                    pending_tag = tag
                    break

            if pending_tag:

                tags = list(
                    thread.applied_tags
                )

                if pending_tag not in tags:

                    tags.append(
                        pending_tag
                    )

                    await thread.edit(
                        applied_tags=tags
                    )

        except Exception:
            pass

        # Give On Hold role

        hold_role = interaction.guild.get_role(
            ON_HOLD_ROLE
        )

        if hold_role:

            try:
                await member.add_roles(
                    hold_role,
                    reason="Verification placed on hold"
                )
            except Exception:
                pass

        # Disconnect from voice

        if member.voice:

            try:

                await member.move_to(
                    None,
                    reason="Verification requires board review"
                )

            except Exception:
                pass

        await interaction.response.send_message(
            (
                f"⏸ Verification for "
                f"{member.mention} "
                f"has been placed on hold."
            )
        )

    # -------------------------
    # /UNHOLD
    # -------------------------

    @app_commands.command(
        name="unhold",
        description="Remove verification hold"
    )
    async def unhold(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):

        if not self.has_verification_access(
            interaction.user
        ):
            await interaction.response.send_message(
                "❌ You do not have permission.",
                ephemeral=True
            )
            return

        thread = await self.get_or_create_thread(
            interaction.guild,
            member
        )

        if not thread:

            await interaction.response.send_message(
                "❌ Verification thread not found.",
                ephemeral=True
            )
            return

        # Remove tag

        try:

            pending_tag = None

            for tag in thread.parent.available_tags:

                if (
                    tag.name.lower()
                    ==
                    PENDING_REVIEW_TAG.lower()
                ):
                    pending_tag = tag
                    break

            if pending_tag:

                new_tags = [
                    tag
                    for tag in thread.applied_tags
                    if tag.id != pending_tag.id
                ]

                await thread.edit(
                    applied_tags=new_tags
                )

        except Exception:
            pass

        # Remove hold role

        hold_role = interaction.guild.get_role(
            ON_HOLD_ROLE
        )

        if hold_role:

            try:
                await member.remove_roles(
                    hold_role,
                    reason="Verification hold removed"
                )
            except Exception:
                pass

        embed = discord.Embed(
            title="▶️ Verification Hold Removed",
            color=discord.Color.green()
        )

        embed.add_field(
            name="Moderator",
            value=interaction.user.mention,
            inline=False
        )

        embed.add_field(
            name="Candidate",
            value=f"{member} ({member.id})",
            inline=False
        )

        embed.timestamp = discord.utils.utcnow()

        await thread.send(
            embed=embed
        )

        # Ping user in callback channel

        callback_channel = interaction.guild.get_channel(
            CALLBACK_CHANNEL
        )

        if callback_channel:

            try:

                await callback_channel.send(
                    (
                        f"{member.mention}\n\n"
                        f"✅ Your verification review has been completed.\n\n"
                        f"Please contact one of the moderators for further information"
                    )
                )

            except Exception:
                pass

        await interaction.response.send_message(
            (
                f"✅ Hold removed for "
                f"{member.mention}"
            ),
            ephemeral=True
        )

    # -------------------------
    # /INTERVIEWCASE
    # -------------------------

    @app_commands.command(
        name="interviewcase",
        description="Open a user's verification thread"
    )
    async def interviewcase(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):

        if not self.has_verification_access(
            interaction.user
        ):
            await interaction.response.send_message(
                "❌ You do not have permission.",
                ephemeral=True
            )
            return

        thread = await self.get_or_create_thread(
            interaction.guild,
            member
        )

        if not thread:

            await interaction.response.send_message(
                "❌ Thread not found.",
                ephemeral=True
            )
            return

        await interaction.response.send_message(
            thread.jump_url,
            ephemeral=True
        )


async def setup(bot):

    await bot.add_cog(
        VerificationBoard(bot)
    )