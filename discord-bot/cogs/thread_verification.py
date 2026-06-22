import discord
from discord.ext import commands
from discord import app_commands

FORUM_CHANNEL = 1515812572157444187
SHOWCASE_FORUM = 1516078310994612235

VERIFIED_ROLE = 1516076523625648279      # Evergreen
BLOOMHEARTS_ROLE = 1518175366395596860   # Bloomhearts
SELF_INTRO_ROLE = 1516105660507357357    # Self Introduction
APPROVED_ROLE = 1516076346025971803      # Sapling
PENDING_ROLE = 1516093480630489089       # Verification
UNVERIFIED_ROLE = 1516075786350628955    # Seedling
TEAM_GUIDE_ROLE = 1516104121550241902    # Team Guide

ONBOARDING_CLEANUP_FORUMS = {
    1516496171831394437: "welcome",
    1515796912840773672: "verification request",
}


class ThreadVerification(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def fetch_thread_starter(
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

    async def thread_belongs_to_member(
        self,
        thread: discord.Thread,
        member: discord.Member
    ):

        starter_message = await self.fetch_thread_starter(
            thread
        )

        if not starter_message:
            return False

        if starter_message.author.id == member.id:
            return True

        mentioned_user_ids = {
            mentioned_user.id
            for mentioned_user in starter_message.mentions
        }

        return member.id in mentioned_user_ids

    async def matching_forum_threads(
        self,
        forum: discord.ForumChannel,
        member: discord.Member
    ):

        seen_thread_ids = set()

        for thread in forum.threads:
            seen_thread_ids.add(
                thread.id
            )

            if await self.thread_belongs_to_member(
                thread,
                member
            ):
                yield thread

        async for thread in forum.archived_threads(
            limit=None
        ):
            if thread.id in seen_thread_ids:
                continue

            seen_thread_ids.add(
                thread.id
            )

            if await self.thread_belongs_to_member(
                thread,
                member
            ):
                yield thread

    async def delete_onboarding_forum_posts(
        self,
        guild: discord.Guild,
        member: discord.Member
    ):

        deleted = []
        failed = []

        for forum_id, forum_label in ONBOARDING_CLEANUP_FORUMS.items():
            forum = guild.get_channel(
                forum_id
            )

            if not isinstance(
                forum,
                discord.ForumChannel
            ):
                failed.append(
                    f"{forum_label}: forum not found"
                )
                continue

            async for thread in self.matching_forum_threads(
                forum,
                member
            ):
                thread_name = thread.name

                try:
                    await thread.delete(
                        reason=(
                            "Onboarding cleanup after "
                            f"/verified for {member}"
                        )
                    )
                    deleted.append(
                        f"{forum_label}: {thread_name}"
                    )
                except Exception as error:
                    failed.append(
                        f"{forum_label}: {thread_name} ({error})"
                    )

        return deleted, failed

    @app_commands.command(
        name="verified",
        description="Verify a user's introduction thread"
    )
    async def verified(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):

        # Must be used inside a thread
        if not isinstance(interaction.channel, discord.Thread):
            await interaction.response.send_message(
                "❌ This command can only be used inside a forum thread.",
                ephemeral=True
            )
            return

        # Must belong to the introductions forum
        if interaction.channel.parent_id != FORUM_CHANNEL:
            await interaction.response.send_message(
                "❌ This command can only be used in the introductions forum.",
                ephemeral=True
            )
            return

        # Staff permission check
        if not interaction.user.guild_permissions.manage_roles:
            await interaction.response.send_message(
                "❌ You don't have permission.",
                ephemeral=True
            )
            return

        verified_role = interaction.guild.get_role(VERIFIED_ROLE)
        bloomhearts_role = interaction.guild.get_role(BLOOMHEARTS_ROLE)
        self_intro_role = interaction.guild.get_role(SELF_INTRO_ROLE)
        approved_role = interaction.guild.get_role(APPROVED_ROLE)
        pending_role = interaction.guild.get_role(PENDING_ROLE)
        unverified_role = interaction.guild.get_role(UNVERIFIED_ROLE)
        team_guide_role = interaction.guild.get_role(TEAM_GUIDE_ROLE)

        if verified_role is None:
            await interaction.response.send_message(
                "❌ Verified role not found.",
                ephemeral=True
            )
            return

        if bloomhearts_role is None:
            await interaction.response.send_message(
                "❌ Bloomhearts role not found.",
                ephemeral=True
            )
            return

        try:
            # Add final verified and Bloomhearts roles
            await member.add_roles(verified_role, bloomhearts_role)

            # Remove onboarding roles
            roles_to_remove = []

            for role in [
                self_intro_role,
                approved_role,
                pending_role,
                unverified_role,
                team_guide_role
            ]:
                if role:
                    roles_to_remove.append(role)

            if roles_to_remove:
                await member.remove_roles(*roles_to_remove)

            # Get original post
            starter_message = None

            async for msg in interaction.channel.history(
                limit=1,
                oldest_first=True
            ):
                starter_message = msg

            # Get showcase forum
            showcase_forum = interaction.guild.get_channel(
                SHOWCASE_FORUM
            )

            if (
                showcase_forum
                and starter_message
                and isinstance(showcase_forum, discord.ForumChannel)
            ):

                # Match tags by name
                destination_tags = []

                try:
                    source_tags = interaction.channel.applied_tags

                    for source_tag in source_tags:
                        for forum_tag in showcase_forum.available_tags:
                            if forum_tag.name == source_tag.name:
                                destination_tags.append(forum_tag)
                                break

                except Exception:
                    pass

                # Copy attachments
                files = []

                for attachment in starter_message.attachments:
                    try:
                        files.append(
                            await attachment.to_file()
                        )
                    except Exception:
                        pass

                # Original content
                thread_content = (
                    starter_message.content
                    if starter_message.content
                    else "*No text provided*"
                )

                # Create showcase forum thread
                await showcase_forum.create_thread(
                    name=interaction.channel.name,
                    content=thread_content,
                    files=files,
                    applied_tags=destination_tags
                )

            # Lock original thread
            await interaction.channel.edit(
                locked=True
            )

            deleted_posts, cleanup_failures = (
                await self.delete_onboarding_forum_posts(
                    interaction.guild,
                    member
                )
            )

            cleanup_message = (
                "🧹 Deleted onboarding forum posts: "
                f"{len(deleted_posts)}."
            )

            if cleanup_failures:
                cleanup_message += (
                    "\n⚠️ Cleanup issues: "
                    + "; ".join(cleanup_failures[:3])
                )

            await interaction.response.send_message(
                f"✅ {member.mention} has been verified.\n"
                f"📢 Introduction copied to showcase forum.\n"
                f"🔒 Thread locked.\n"
                f"{cleanup_message}"
            )

        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I don't have permission to manage roles, threads or forum posts.",
                ephemeral=True
            )

        except Exception as e:
            await interaction.response.send_message(
                f"❌ Error: {e}",
                ephemeral=True
            )


async def setup(bot):
    await bot.add_cog(ThreadVerification(bot))