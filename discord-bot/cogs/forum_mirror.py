import discord
from discord.ext import commands
from discord import app_commands
import json
import os

SOURCE_FORUM_ID = 1515820692803686451
DEST_FORUM_ID = 1516381020125925427

MAPPING_FILE = "forum_mirror.json"


class ForumMirror(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.thread_map = self.load_mapping()

    def load_mapping(self):
        if not os.path.exists(MAPPING_FILE):
            return {}

        try:
            with open(MAPPING_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def save_mapping(self):
        with open(MAPPING_FILE, "w", encoding="utf-8") as f:
            json.dump(self.thread_map, f, indent=4)

    def get_destination_tags(
        self,
        source_forum: discord.ForumChannel,
        dest_forum: discord.ForumChannel,
        source_thread: discord.Thread
    ):
        tag_lookup = {
            tag.name: tag
            for tag in dest_forum.available_tags
        }

        destination_tags = []

        for source_tag in source_thread.applied_tags:
            dest_tag = tag_lookup.get(source_tag.name)

            if dest_tag:
                destination_tags.append(dest_tag)

        return destination_tags

    async def fetch_starter_message(
        self,
        thread: discord.Thread
    ):
        try:
            return await thread.fetch_message(
                thread.id
            )
        except Exception:
            pass

        async for msg in thread.history(
            oldest_first=True,
            limit=1
        ):
            return msg

        return None

    async def mirror_thread(
        self,
        source_thread: discord.Thread
    ):

        if str(source_thread.id) in self.thread_map:
            return

        source_forum = source_thread.parent

        dest_forum = self.bot.get_channel(
            DEST_FORUM_ID
        )

        if not isinstance(
            dest_forum,
            discord.ForumChannel
        ):
            print(
                "Destination forum not found"
            )
            return

        starter_message = (
            await self.fetch_starter_message(
                source_thread
            )
        )

        if not starter_message:
            print(
                f"Could not fetch starter "
                f"message for "
                f"{source_thread.id}"
            )
            return

        print(
            f"Content length: "
            f"{len(starter_message.content)}"
        )

        tags = self.get_destination_tags(
            source_forum,
            dest_forum,
            source_thread
        )

        try:

            image_file = None

            for attachment in starter_message.attachments:

                if (
                    attachment.content_type
                    and attachment.content_type.startswith(
                        "image/"
                    )
                ):
                    try:
                        image_file = (
                            await attachment.to_file(
                                filename="profile.jpg"
                            )
                        )
                        break

                    except Exception as e:
                        print(
                            f"Image error: {e}"
                        )

            thread_files = []
            
            if image_file:
                thread_files.append(image_file)
            
            role_name = "Member"
            
            roles = [
                role
                for role in starter_message.author.roles
                if role.name != "@everyone"
            ]
            
            if roles:
                role_name = roles[-1].name
                
            created = (
                await dest_forum.create_thread(
                    name=source_thread.name,
                    content=(
                        f"👤 {starter_message.author.display_name}"
                        f" - {role_name}"
                    ),
                    files=thread_files,
                    applied_tags=tags
                )
            )

            mirror_thread = created.thread

            embed = discord.Embed(
                title=source_thread.name,
                description=starter_message.content[:4096],
                color=discord.Color.blue()
            )

            embed.set_author(
                name=starter_message.author.display_name
            )

            await mirror_thread.send(
                embed=embed
            )

            self.thread_map[
                str(source_thread.id)
            ] = str(mirror_thread.id)

            self.save_mapping()

            try:
                await mirror_thread.edit(
                    locked=True
                )

            except Exception as e:
                print(
                    f"Lock/archive error: "
                    f"{e}"
                )

            print(
                f"Mirrored thread: "
                f"{source_thread.name}"
            )

        except Exception as e:
            print(
                f"Mirror creation failed: "
                f"{e}"
            )

    @commands.Cog.listener()
    async def on_thread_create(
        self,
        thread: discord.Thread
    ):

        if thread.parent_id != SOURCE_FORUM_ID:
            return

        await self.mirror_thread(
            thread
        )

    @app_commands.command(
        name="sync_team_members",
        description="Backfill forum mirror"
    )
    async def sync_team_members(
        self,
        interaction: discord.Interaction
    ):

        if not (
            interaction.user.guild_permissions
            .administrator
        ):
            await (
                interaction.response.send_message(
                    "❌ Administrator only.",
                    ephemeral=True
                )
            )
            return

        await (
            interaction.response.defer(
                ephemeral=True
            )
        )

        source_forum = (
            self.bot.get_channel(
                SOURCE_FORUM_ID
            )
        )

        if not isinstance(
            source_forum,
            discord.ForumChannel
        ):
            await (
                interaction.followup.send(
                    "❌ Source forum not found.",
                    ephemeral=True
                )
            )
            return

        count = 0

        threads = []

        threads.extend(
            source_forum.threads
        )

        try:

            async for thread in (
                source_forum.archived_threads(
                    limit=None
                )
            ):
                threads.append(
                    thread
                )

        except Exception:
            pass

        unique_threads = {
            t.id: t
            for t in threads
        }

        for thread in (
            unique_threads.values()
        ):

            if (
                str(thread.id)
                in self.thread_map
            ):
                continue

            await self.mirror_thread(
                thread
            )

            count += 1

        await (
            interaction.followup.send(
                f"✅ Mirrored "
                f"{count} thread(s).",
                ephemeral=True
            )
        )

    @commands.Cog.listener()
    async def on_ready(self):

        try:

            self.bot.tree.add_command(
                self.sync_team_members
            )

        except Exception:
            pass


async def setup(bot):
    await bot.add_cog(
        ForumMirror(bot)
    )