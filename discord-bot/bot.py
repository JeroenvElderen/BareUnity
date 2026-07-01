import os
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
import asyncio
import aiohttp

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

COMMAND_CHANNELS = {
    "approve": [REVIEW_CHANNEL],
    "reject": [REVIEW_CHANNEL],
    "verified": [1515812572157444187],
    "vnote": [1516470493673164810, 1515801461651542236],
    "hold": [1516470493673164810, 1515801461651542236],
    "unhold": [1516470493673164810, 1515801461651542236],
    "interviewcase": [1516470493673164810, 1515801461651542236],
    "warn": [1517155438615859390],
    "approveprofile": [1517155438615859390],
    "rejectprofile": [1517155438615859390],
    "watchlist": [1516069773920960585, 1516175139761291284, 1516172309881290912],
    "reportstats": [1516069773920960585, 1516175139761291284, 1516172309881290912],
    "case": [1516069773920960585, 1516175139761291284, 1516172309881290912],
    "addnote": [1516069773920960585, 1516175139761291284, 1516172309881290912],
    "remove_watch": [1516069773920960585, 1516175139761291284, 1516172309881290912],
    "sync_team_members": [1517154255792902204],
    "platform_overview": [1517154197848592586],
    "sidebar_hide": [1517154255792902204],
    "sidebar_show": [1517154255792902204],
    "member_profile": [1517155438615859390],
    "application_approve": [1517153902087110788],
    "application_reject": [1517153902087110788],
    "admin_user_create": [1517154255792902204],
    "admin_user_search": [1517154255792902204, 1517155438615859390],
    "admin_user_delete": [1517154255792902204],
    "country_get": [1517154255792902204],
    "country_form": [1517154255792902204],
    "stay_form": [1517154255792902204],
    "activity_form": [1517154255792902204],
    "listing_drafts": [1517154255792902204],
    "stay_import": [1517154255792902204],
    "country_upsert_basic": [1517154255792902204],
    "stay_create_basic": [1517154255792902204],
    "activity_create_basic": [1517154255792902204],
    "admin_user_update_json": [1517154255792902204],
    "country_upsert_json": [1517154255792902204],
    "stay_upsert_json": [1517154255792902204],
    "activity_upsert_json": [1517154255792902204],
    "gallery_moderation_update": [1517153973835010139],
    "gathering": [1517154255792902204],
}


async def apply_command_channel_permissions(synced_commands):
    # Discord no longer allows bots to mutate per-command channel permissions via
    # this endpoint; attempting it during startup causes 403/429 noise and can
    # delay readiness. Commands still enforce their allowed channels in handlers.
    return

    if not TOKEN or not bot.user:
        return

    headers = {
        "Authorization": f"Bot {TOKEN}",
        "Content-Type": "application/json",
    }
    base_url = f"https://discord.com/api/v10/applications/{bot.user.id}/guilds/{GUILD_ID}/commands"

    async with aiohttp.ClientSession(headers=headers) as session:
        for command in synced_commands:
            channel_ids = COMMAND_CHANNELS.get(command.name)
            if not channel_ids:
                continue

            permissions = [
                {"id": str(GUILD_ID), "type": 1, "permission": False},
                *[{"id": str(channel_id), "type": 3, "permission": True} for channel_id in channel_ids],
            ]
            async with session.put(
                f"{base_url}/{command.id}/permissions",
                json={"permissions": permissions},
            ) as response:
                if response.status >= 300:
                    body = await response.text()
                    print(f"Could not set channel permissions for /{command.name}: {response.status} {body}")


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
    await apply_command_channel_permissions(synced)

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
        await bot.load_extension("cogs.onboarding_enforcement")
        await bot.load_extension("cogs.thread_verification")
        await bot.load_extension("cogs.camera_enforcement")
        await bot.load_extension("cogs.report_system")
        await bot.load_extension("cogs.forum_mirror")
        await bot.load_extension("cogs.reddit_crosspost")
        await bot.load_extension("cogs.verification_board")
        await bot.load_extension("cogs.bump_reminder")
        await bot.load_extension("cogs.forest_gatherings")
        await bot.load_extension("cogs.member_management")
        await bot.load_extension("cogs.platform_grove_admin")
        await bot.start(TOKEN)


asyncio.run(main())