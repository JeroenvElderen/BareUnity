import discord
from discord.ext import commands
from discord import app_commands

FORUM_CHANNEL = 1515812572157444187
SHOWCASE_FORUM = 1516078310994612235

VERIFIED_ROLE = 1516076523625648279      # Evergreen
SELF_INTRO_ROLE = 1516105660507357357    # Self Introduction
APPROVED_ROLE = 1516076346025971803      # Sapling
PENDING_ROLE = 1516093480630489089       # Verification
UNVERIFIED_ROLE = 1516075786350628955    # Seedling
TEAM_GUIDE_ROLE = 1516104121550241902    # Team Guide


class ThreadVerification(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

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

        try:
            # Add final verified role
            await member.add_roles(verified_role)

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

            await interaction.response.send_message(
                f"✅ {member.mention} has been verified.\n"
                f"📢 Introduction copied to showcase forum.\n"
                f"🔒 Thread locked."
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