import discord
from discord.ext import commands
from discord import app_commands

APPROVED_ROLE = 1516076346025971803
PENDING_ROLE = 1516093480630489089
UNVERIFIED_ROLE = 1516075786350628955
REVIEW_CHANNEL = 1515801461651542236


class VideoReview(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(
        name="approve",
        description="Approve a user's verification video"
    )
    async def approve(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):
        if interaction.channel_id != REVIEW_CHANNEL:
            await interaction.response.send_message(
                "❌ Use this command in the review channel.",
                ephemeral=True
            )
            return

        if not interaction.user.guild_permissions.manage_roles:
            await interaction.response.send_message(
                "❌ You don't have permission.",
                ephemeral=True
            )
            return

        approved_role = interaction.guild.get_role(APPROVED_ROLE)
        pending_role = interaction.guild.get_role(PENDING_ROLE)
        unverified_role = interaction.guild.get_role(UNVERIFIED_ROLE)

        if approved_role is None:
            await interaction.response.send_message(
                "❌ Approved role not found.",
                ephemeral=True
            )
            return

        try:
            # Add approved role
            await member.add_roles(approved_role)

            # Remove old roles
            roles_to_remove = []

            if pending_role:
                roles_to_remove.append(pending_role)

            if unverified_role:
                roles_to_remove.append(unverified_role)

            if roles_to_remove:
                await member.remove_roles(*roles_to_remove)

            await interaction.response.send_message(
                f"✅ Approved {member.mention}"
            )

        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I don't have permission to manage those roles.",
                ephemeral=True
            )

    @app_commands.command(
        name="reject",
        description="Reject a user's verification video"
    )
    async def reject(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):
        if interaction.channel_id != REVIEW_CHANNEL:
            await interaction.response.send_message(
                "❌ Use this command in the review channel.",
                ephemeral=True
            )
            return

        if not interaction.user.guild_permissions.kick_members:
            await interaction.response.send_message(
                "❌ You don't have permission.",
                ephemeral=True
            )
            return

        try:
            await member.kick(
                reason=f"Verification rejected by {interaction.user}"
            )

            await interaction.response.send_message(
                f"❌ {member.mention} has been rejected and kicked."
            )

        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I don't have permission to kick that member.",
                ephemeral=True
            )


async def setup(bot):
    await bot.add_cog(VideoReview(bot))