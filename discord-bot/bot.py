import os
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
import asyncio

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = 1514974981711462561

APPROVED_ROLE = 1516076346025971803
PENDING_ROLE = 1516093480630489089
REVIEW_CHANNEL = 1515801461651542236

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.reactions = True
intents.voice_states = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)


@app_commands.command(
    name="approve",
    description="Approve a user's verification video"
)
async def approve(
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

    await member.add_roles(approved_role)

    if pending_role:
        await member.remove_roles(pending_role)

    await interaction.response.send_message(
        f"✅ Approved {member.mention}"
    )


@app_commands.command(
    name="reject",
    description="Reject a user's verification video"
)
async def reject(
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

    await member.kick(
        reason=f"Verification rejected by {interaction.user}"
    )

    await interaction.response.send_message(
        f"❌ {member.mention} has been rejected and kicked."
    )


bot.tree.add_command(approve)
bot.tree.add_command(reject)


@bot.event
async def on_ready():
    guild = discord.Object(id=GUILD_ID)

    print("Registered commands:")

    for cmd in bot.tree.get_commands():
        print(cmd.name)

    bot.tree.copy_global_to(guild=guild)

    synced = await bot.tree.sync(guild=guild)

    print(f"Synced {len(synced)} guild command(s)")

    for cmd in synced:
        print(f"/{cmd.name}")

    print(f"Logged in as {bot.user}")

async def main():
    async with bot:
        await bot.load_extension("cogs.auto_role")
        await bot.load_extension("cogs.welcome_threads")
        await bot.load_extension("cogs.reaction_roles")
        await bot.load_extension("cogs.self_intro_role")
        await bot.load_extension("cogs.thread_verification")
        await bot.load_extension("cogs.camera_enforcement")
        await bot.load_extension("cogs.report_system")
        await bot.load_extension("cogs.forum_mirror")
        await bot.load_extension("cogs.verification_board")
        await bot.load_extension("cogs.bump_reminder")
        await bot.load_extension("cogs.member_management")
        await bot.load_extension("cogs.location_requests")
        await bot.start(TOKEN)


asyncio.run(main())