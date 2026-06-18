import discord
from discord.ext import commands

print("AutoRole cog loaded")

ROLE_ID = 1516075786350628955

class AutoRole(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member):
        print(f"[JOIN] {member} joined {member.guild.name}")

        role = member.guild.get_role(ROLE_ID)

        if role is None:
            print(f"[ERROR] Role {ROLE_ID} not found")
            return

        try:
            await member.add_roles(role)
            print(f"[SUCCESS] Added '{role.name}' to {member}")
        except discord.Forbidden:
            print("[ERROR] Missing permissions or role hierarchy issue")
        except Exception as e:
            print(f"[ERROR] {e}")

async def setup(bot):
    await bot.add_cog(AutoRole(bot))