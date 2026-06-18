import discord
from discord.ext import commands

FORUM_CHANNEL_ID = 1515820692803686451
SELF_INTRO_ROLE = 1516105660507357357


class SelfIntroRole(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload):

        if payload.guild_id is None:
            return

        if str(payload.emoji) != "🌿":
            return

        guild = self.bot.get_guild(payload.guild_id)

        if guild is None:
            return

        try:
            channel = await self.bot.fetch_channel(payload.channel_id)
        except Exception:
            return

        if not isinstance(channel, discord.Thread):
            return

        if channel.parent_id != FORUM_CHANNEL_ID:
            return

        member = guild.get_member(payload.user_id)

        if member is None or member.bot:
            return

        role = guild.get_role(SELF_INTRO_ROLE)

        if role is None:
            return

        await member.add_roles(role)

        print(
            f"Added Self Introduction role to {member}"
        )


async def setup(bot):
    await bot.add_cog(SelfIntroRole(bot))