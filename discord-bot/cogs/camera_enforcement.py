import asyncio
import discord
from discord.ext import commands

ENFORCED_CHANNELS = {
    1516062837301182606,  # Gaming-room
    1516060861330882762,  # Naturist-talks
}

WAITING_ROOM = 1516167597723353219  # Base Camp

GRACE_PERIOD = 30


class CameraEnforcement(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

        # Stores the channel a user came from
        self.return_channels = {}

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState
    ):

        # User joins a camera-required room
        if (
            after.channel
            and after.channel.id in ENFORCED_CHANNELS
            and (
                before.channel is None
                or before.channel.id != after.channel.id
            )
        ):
            asyncio.create_task(
                self.check_camera(
                    member,
                    after.channel.id
                )
            )

        # User turns camera on while in Base Camp
        if (
            after.channel
            and after.channel.id == WAITING_ROOM
            and after.self_video
        ):

            original_channel_id = self.return_channels.get(
                member.id
            )

            if original_channel_id:

                destination = member.guild.get_channel(
                    original_channel_id
                )

                if destination:

                    try:
                        await member.move_to(
                            destination,
                            reason="Camera enabled"
                        )

                        # Cleanup stored channel
                        self.return_channels.pop(
                            member.id,
                            None
                        )

                        print(
                            f"Moved {member} back to "
                            f"{destination.name}"
                        )

                    except Exception as e:
                        print(
                            f"Failed moving {member}: {e}"
                        )

    async def check_camera(
        self,
        member: discord.Member,
        channel_id: int
    ):

        await asyncio.sleep(GRACE_PERIOD)

        # User left voice
        if member.voice is None:
            return

        # User moved to another channel
        if member.voice.channel.id != channel_id:
            return

        # Camera enabled
        if member.voice.self_video:
            return

        waiting_channel = member.guild.get_channel(
            WAITING_ROOM
        )

        if waiting_channel:

            try:
                # Remember where they came from
                self.return_channels[
                    member.id
                ] = channel_id

                await member.move_to(
                    waiting_channel,
                    reason="Camera not enabled within 30 seconds"
                )

                print(
                    f"Moved {member} to Base Camp "
                    f"(camera not enabled)"
                )

            except Exception as e:
                print(
                    f"Failed moving {member}: {e}"
                )


async def setup(bot):
    await bot.add_cog(
        CameraEnforcement(bot)
    )