import discord
import asyncio
import json
import os

from discord.ext import commands

DISBOARD_BOT_ID = 302050872383242240
BUMP_CHANNEL = 1514975253908947040

DATA_FILE = "bump_tracker.json"


class BumpReminder(commands.Cog):

    def __init__(self, bot):
        self.bot = bot
        self.bump_task = None

    def load_data(self):

        if not os.path.exists(DATA_FILE):
            return {}

        try:
            with open(DATA_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def save_data(self, data):

        with open(DATA_FILE, "w") as f:
            json.dump(data, f, indent=4)

    async def update_tracker(
        self,
        bumper=None,
        next_bump=None
    ):

        data = self.load_data()

        channel = self.bot.get_channel(
            BUMP_CHANNEL
        )

        if not channel:
            return

        message = None

        message_id = data.get(
            "tracker_message"
        )

        if message_id:

            try:
                message = await channel.fetch_message(
                    message_id
                )
            except Exception:
                pass

        if not message:

            message = await channel.send(
                "Initializing bump tracker..."
            )

            data[
                "tracker_message"
            ] = message.id

            self.save_data(data)

        embed = discord.Embed(
            title="🔔 Disboard Bump Tracker",
            color=discord.Color.green()
        )

        embed.add_field(
            name="Last Bumper",
            value=(
                bumper.mention
                if bumper
                else "Unknown"
            ),
            inline=False
        )

        if next_bump:

            embed.add_field(
                name="Next Bump",
                value=(
                    f"<t:{next_bump}:R>\n"
                    f"<t:{next_bump}:F>"
                ),
                inline=False
            )

        await message.edit(
            content=None,
            embed=embed
        )

    async def reminder_timer(
        self,
        seconds
    ):

        try:

            await asyncio.sleep(
                seconds
            )

            channel = self.bot.get_channel(
                BUMP_CHANNEL
            )

            if channel:

                await channel.send(
                    "🔔 Disboard bump is available again! Use `/bump`."
                )

        except asyncio.CancelledError:
            pass

    @commands.Cog.listener()
    async def on_ready(self):

        if self.bump_task:
            return

        data = self.load_data()

        next_bump = data.get(
            "next_bump"
        )

        if not next_bump:
            return

        remaining = (
            next_bump
            - int(
                discord.utils.utcnow().timestamp()
            )
        )

        if remaining > 0:

            self.bump_task = (
                asyncio.create_task(
                    self.reminder_timer(
                        remaining
                    )
                )
            )

    @commands.Cog.listener()
    async def on_message(
        self,
        message
    ):

        if (
            message.author.id
            != DISBOARD_BOT_ID
        ):
            return

        if not message.embeds:
            return

        embed = message.embeds[0]

        description = (
            embed.description.lower()
            if embed.description
            else ""
        )

        if "bump done" not in description:
            return

        next_bump = (
            int(
                discord.utils.utcnow().timestamp()
            )
            + 7200
        )

        data = self.load_data()

        data["next_bump"] = next_bump

        self.save_data(data)

        if self.bump_task:
            self.bump_task.cancel()

        self.bump_task = (
            asyncio.create_task(
                self.reminder_timer(
                    7200
                )
            )
        )

        await self.update_tracker(
            bumper=message.interaction.user
            if message.interaction
            else None,
            next_bump=next_bump
        )


async def setup(bot):
    await bot.add_cog(
        BumpReminder(bot)
    )