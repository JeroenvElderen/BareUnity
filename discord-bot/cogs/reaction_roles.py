import discord
from discord.ext import commands

# Verification reaction role
VERIFY_CHANNEL_ID = 1514975253908947037
VERIFY_MESSAGE_ID = 1515780207985033266
VERIFY_ROLE_ID = 1516093480630489089

# Team Guide reaction role
TEAM_GUIDE_CHANNEL_ID = 1515812480478220328
TEAM_GUIDE_MESSAGE_ID = 1515820006250643726
TEAM_GUIDE_ROLE_ID = 1516104121550241902


class ReactionRoles(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload):

        if payload.guild_id is None:
            return

        if str(payload.emoji) != "✅":
            return

        guild = self.bot.get_guild(payload.guild_id)

        if guild is None:
            return

        member = guild.get_member(payload.user_id)

        if member is None or member.bot:
            return

        # Verification role
        if (
            payload.channel_id == VERIFY_CHANNEL_ID
            and payload.message_id == VERIFY_MESSAGE_ID
        ):
            role = guild.get_role(VERIFY_ROLE_ID)

            if role:
                await member.add_roles(role)
                print(f"Added {role.name} to {member}")

        # Team Guide role
        elif (
            payload.channel_id == TEAM_GUIDE_CHANNEL_ID
            and payload.message_id == TEAM_GUIDE_MESSAGE_ID
        ):
            role = guild.get_role(TEAM_GUIDE_ROLE_ID)

            if role:
                await member.add_roles(role)
                print(f"Added {role.name} to {member}")

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload):

        if payload.guild_id is None:
            return

        if str(payload.emoji) != "✅":
            return

        guild = self.bot.get_guild(payload.guild_id)

        if guild is None:
            return

        member = guild.get_member(payload.user_id)

        if member is None:
            return

        # Verification role
        if (
            payload.channel_id == VERIFY_CHANNEL_ID
            and payload.message_id == VERIFY_MESSAGE_ID
        ):
            role = guild.get_role(VERIFY_ROLE_ID)

            if role:
                await member.remove_roles(role)

        # Team Guide role
        elif (
            payload.channel_id == TEAM_GUIDE_CHANNEL_ID
            and payload.message_id == TEAM_GUIDE_MESSAGE_ID
        ):
            role = guild.get_role(TEAM_GUIDE_ROLE_ID)

            if role:
                await member.remove_roles(role)


async def setup(bot):
    await bot.add_cog(ReactionRoles(bot))