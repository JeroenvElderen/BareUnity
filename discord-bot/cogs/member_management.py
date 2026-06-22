import discord
import json
import os

from discord import app_commands
from discord.ext import commands, tasks
from supabase import create_client

MEMBER_MANAGEMENT_FORUM = 1517155438615859390

THREADS_FILE = "member_threads.json"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

PROFILE_BASE_URL = "https://www.bareunity.com/members"
RANGER_ROLE = 1517153248065355857


class MemberRejectModal(discord.ui.Modal):

    def __init__(self, cog, user_uuid):
        super().__init__(title="Reject profile")
        self.cog = cog
        self.user_uuid = user_uuid
        self.reason = discord.ui.TextInput(
            label="Reason sent to member",
            style=discord.TextStyle.paragraph,
            max_length=1200
        )
        self.add_item(self.reason)

    async def on_submit(self, interaction):
        await self.cog.reject_profile(
            interaction,
            self.user_uuid,
            str(self.reason),
            close_thread=True
        )


class MemberManagementView(discord.ui.View):

    def __init__(self, cog, user_uuid):
        super().__init__(timeout=None)
        self.cog = cog
        self.user_uuid = user_uuid
        self.approve.custom_id = f"member_management:{user_uuid}:approve"
        self.reject.custom_id = f"member_management:{user_uuid}:reject"
        self.delete_account.custom_id = f"member_management:{user_uuid}:delete"

    async def check_ranger(self, interaction):
        if not self.cog.is_ranger(interaction.user):
            await interaction.response.send_message(
                "❌ Ranger role required.",
                ephemeral=True
            )
            return False
        return True

    @discord.ui.button(label="Approve profile", emoji="✅", style=discord.ButtonStyle.success)
    async def approve(self, interaction, button):
        if not await self.check_ranger(interaction):
            return
        await self.cog.approve_profile(
            interaction,
            self.user_uuid,
            close_thread=True
        )

    @discord.ui.button(label="Reject profile", emoji="⛔", style=discord.ButtonStyle.danger)
    async def reject(self, interaction, button):
        if not await self.check_ranger(interaction):
            return
        await interaction.response.send_modal(
            MemberRejectModal(self.cog, self.user_uuid)
        )

    @discord.ui.button(label="Delete account", emoji="🗑️", style=discord.ButtonStyle.danger)
    async def delete_account(self, interaction, button):
        if not await self.check_ranger(interaction):
            return
        await self.cog.delete_account(
            interaction,
            self.user_uuid,
            close_thread=True
        )


class MemberManagement(commands.Cog):

    def __init__(self, bot):
        self.bot = bot

        self.supabase = create_client(
            SUPABASE_URL,
            SUPABASE_KEY
        )

        self.thread_map = self.load_threads()

        self.profile_sync.start()

    def cog_unload(self):
        self.profile_sync.cancel()

    # -------------------------
    # JSON STORAGE
    # -------------------------

    def load_threads(self):

        if not os.path.exists(
            THREADS_FILE
        ):
            return {}

        try:

            with open(
                THREADS_FILE,
                "r",
                encoding="utf-8"
            ) as f:

                return json.load(f)

        except Exception:
            return {}

    def save_threads(self):

        with open(
            THREADS_FILE,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                self.thread_map,
                f,
                indent=4
            )

    async def member_forum(self):

        forum = self.bot.get_channel(
            MEMBER_MANAGEMENT_FORUM
        )

        if forum is None:

            try:

                forum = await self.bot.fetch_channel(
                    MEMBER_MANAGEMENT_FORUM
                )

            except Exception as e:

                print(
                    f"[MEMBERS] Could not fetch member "
                    f"management forum: {e}"
                )

                return None

        if not isinstance(
            forum,
            discord.ForumChannel
        ):

            print(
                "[MEMBERS] Member management channel "
                "is not a forum channel."
            )

            return None

        return forum

    async def existing_member_thread_ids(
        self,
        forum
    ):

        thread_ids = {
            str(thread.id)
            for thread in forum.threads
        }

        try:

            async for thread in forum.archived_threads(
                limit=None
            ):

                thread_ids.add(
                    str(thread.id)
                )

        except Exception as e:

            print(
                f"[MEMBERS] Could not inspect archived "
                f"member threads: {e}"
            )

        return thread_ids

    async def prune_deleted_member_threads(self):

        if not self.thread_map:

            return

        forum = await self.member_forum()

        if forum is None:

            return

        existing_thread_ids = await self.existing_member_thread_ids(
            forum
        )

        stale_profile_ids = [
            profile_id
            for profile_id, thread_id in self.thread_map.items()
            if str(thread_id) not in existing_thread_ids
        ]

        if not stale_profile_ids:

            return

        for profile_id in stale_profile_ids:

            self.thread_map.pop(
                profile_id,
                None
            )

        self.save_threads()

        print(
            f"[MEMBERS] Removed {len(stale_profile_ids)} "
            "deleted member thread mapping(s)."
        )
    
    def is_ranger(
        self,
        member
    ):
        
        return any(
            role.id == RANGER_ROLE
            for role in member.roles
        )
    
    async def get_profile_uuid(
        self,
        thread
    ):
            
        async for msg in thread.history(
            limit=20,
            oldest_first=True
        ):
                
            if (
                msg.author.id
                == self.bot.user.id
                and msg.embeds
            ):
                    
                footer = (
                    msg.embeds[0]
                    .footer.text
                )
                    
                if (
                    footer
                    and footer.startswith(
                        "UUID: "
                    )
                ):
                        
                    return footer.replace(
                        "UUID: ",
                        ""
                    )
        return None

    def verification_request_label(
        self,
        profile
    ):

        submission = profile.get(
            "verification_submissions"
        )

        if isinstance(
            submission,
            dict
        ):

            status = submission.get(
                "status"
            ) or "requested"

            updated_at = submission.get(
                "updated_at"
            )

            if updated_at:
                return f"Yes — {status} ({updated_at})"

            return f"Yes — {status}"

        return "No verification request found"
    
    # -------------------------
    # PROFILE EMBED
    # -------------------------

    def build_embed(
        self,
        profile
    ):

        username = profile.get(
            "username",
            "Unknown"
        )

        display_name = (
            profile.get(
                "display_name"
            )
            or username
        )

        bio = (
            profile.get(
                "bio"
            )
            or "No bio provided."
        )

        location = (
            profile.get(
                "location"
            )
            or "Not specified"
        )

        avatar = profile.get(
            "avatar_url"
        )

        embed = discord.Embed(
            title=f"👤 {display_name}",
            color=discord.Color.green()
        )

        embed.add_field(
            name="Username",
            value=username,
            inline=False
        )

        embed.add_field(
            name="Display Name",
            value=display_name,
            inline=False
        )

        embed.add_field(
            name="Location",
            value=location,
            inline=False
        )

        embed.add_field(
            name="Bio",
            value=bio[:1024],
            inline=False
        )

        embed.add_field(
            name="Profile",
            value=f"{PROFILE_BASE_URL}/{username}",
            inline=False
        )

        embed.add_field(
            name="Verification Request",
            value=self.verification_request_label(profile),
            inline=False
        )

        if (
            avatar
            and isinstance(
                avatar,
                str
            )
        ):

            avatar = avatar.strip()

            if avatar.startswith(
                (
                    "https://",
                    "http://"
                )
            ):

                try:

                    embed.set_thumbnail(
                        url=avatar
                    )

                except Exception:

                    print(
                        f"[MEMBERS] Invalid avatar URL: "
                        f"{avatar}"
                    )

        embed.set_footer(
            text=f"UUID: {profile['id']}"
        )

        return embed

    # -------------------------
    # CREATE THREAD
    # -------------------------

    async def create_member_thread(
        self,
        profile
    ):

        forum = await self.member_forum()

        if forum is None:

            return

        username = profile.get(
            "username",
            "unknown"
        )

        display_name = (
            profile.get(
                "display_name"
            )
            or username
        )

        thread_name = (
            f"{display_name} "
            f"(@{username})"
        )

        try:

            embed = self.build_embed(
                profile
            )

            applied_tags = []

            if forum.flags.require_tag:

                available_tags = list(
                    forum.available_tags
                )

                applied_tags = [
                    tag
                    for tag in available_tags
                    if not getattr(
                        tag,
                        "moderated",
                        False
                    )
                ][:1]

                if (
                    not applied_tags
                    and available_tags
                ):

                    applied_tags = available_tags[:1]

            created = await forum.create_thread(
                name=thread_name[:100],
                content="👤 Creating profile card...",
                view=MemberManagementView(self, profile["id"]),
                applied_tags=applied_tags
            )

            thread = created.thread

            try:

                starter_message = created.message

                await starter_message.edit(
                    content="",
                    embed=embed,
                    view=MemberManagementView(self, profile["id"])
                )

            except Exception as e:

                print(
                    f"[MEMBERS] Failed editing starter "
                    f"message: {e}"
                )

            self.thread_map[
                profile["id"]
            ] = str(thread.id)

            self.save_threads()

            print(
                f"[MEMBERS] Created thread "
                f"for {username}"
            )

        except Exception as e:

            print(
                f"[MEMBERS] Failed creating "
                f"thread for {username}: {e}"
            )

    # -------------------------
    # UPDATE THREAD
    # -------------------------

    async def update_member_thread(
        self,
        profile
    ):

        thread_id = self.thread_map.get(
            profile["id"]
        )

        if not thread_id:

            await self.create_member_thread(
                profile
            )
            return

        try:

            thread = self.bot.get_channel(
                int(thread_id)
            )

            if thread is None:

                thread = await self.bot.fetch_channel(
                    int(thread_id)
                )

        except discord.NotFound:

            print(
                f"[MEMBERS] Stored thread {thread_id} "
                f"for profile {profile['id']} no longer exists; "
                "recreating."
            )

            self.thread_map.pop(
                profile["id"],
                None
            )

            self.save_threads()

            await self.create_member_thread(
                profile
            )

            return

        except Exception as e:

            print(
                f"[MEMBERS] Failed fetching stored "
                f"thread {thread_id} for profile "
                f"{profile['id']}: {e}"
            )

            return

        embed = self.build_embed(
            profile
        )

        try:

            target_message = None

            async for msg in thread.history(
                limit=20,
                oldest_first=True
            ):

                if (
                    msg.author.id
                    == self.bot.user.id
                    and msg.embeds
                ):

                    target_message = msg
                    break

            if target_message:

                await target_message.edit(
                    embed=embed,
                    view=MemberManagementView(self, profile["id"])
                )

        except Exception as e:

            print(
                f"[MEMBERS] Failed updating "
                f"profile {profile['id']}: {e}"
            )

    # -------------------------
    # SYNC TASK
    # -------------------------

    @tasks.loop(minutes=30)
    async def profile_sync(self):

        try:

            await self.prune_deleted_member_threads()

            response = (
                self.supabase
                .table("profiles")
                .select("*, verification_submissions(status, updated_at)")
                .execute()
            )

            profiles = (
                response.data
                if response.data
                else []
            )

            print(
                f"[MEMBERS] Found "
                f"{len(profiles)} profiles"
            )

            for profile in profiles:

                if (
                    profile["id"]
                    not in self.thread_map
                ):

                    await self.create_member_thread(
                        profile
                    )

                else:

                    await self.update_member_thread(
                        profile
                    )

        except Exception as e:

            print(
                f"[MEMBERS] Sync error: {e}"
            )

    @profile_sync.before_loop
    async def before_sync(self):

        await self.bot.wait_until_ready()

    # -------------------------
    # READY
    # -------------------------

    @commands.Cog.listener()
    async def on_ready(self):

        print(
            "Member Management loaded"
        )
        
    @app_commands.command(
        name="warn",
        description="Send a profile warning"
    )
    async def warn(
        self,
        interaction: discord.Interaction,
        reason: str
    ):
        
        if not self.is_ranger(
            interaction.user
        ):
            
            await interaction.response.send_message(
                "❌ Range role required",
                ephemeral=True
            )
            return

        if not isinstance(
            interaction.channel,
            discord.Thread
        ):
            
            await interaction.response.send_message(
                "❌ Use inside a member thread.",
                ephemeral=True
            )
            return
        
        if interaction.channel.parent_id != MEMBER_MANAGEMENT_FORUM:
            
            await interaction.response.send_message(
                "❌ Use inside a member-management thread.",
                ephemeral=True
            )
            return
        
        user_uuid = await self.get_profile_uuid(
            interaction.channel
        )
        
        if not user_uuid:
            
            await interaction.response.send_message(
                "❌ Could not find profile UUID.",
                ephemeral=True
            )
            return
        
        ticket = (
            self.supabase
            .table("feedback_messages")
            .insert({
                "user_id": user_uuid,
                "category": "other",
                "message": "A moderator has issued a warning regarding your profile.",
                "status": "new"
            })
            .execute()
        )
        
        feedback_id = (
            ticket.data[0]["id"]
        )
        
        (
            self.supabase
            .table("feedback_replies")
            .insert({
                "feedback_id": feedback_id,
                "author_role": "admin",
                "message": reason
            })
            .execute()
        )
        
        embed = discord.Embed(
            title="⚠️ Warning Issued",
            description=reason,
            color=discord.Color.orange()
        )
        
        embed.add_field(
            name="Moderator",
            value=interaction.user.mention
        )
        
        await interaction.channel.send(
            embed=embed
        )
        
        await interaction.response.send_message(
            "✅ Warning sent.",
            ephemeral=True
        )
    
    @app_commands.command(
        name="approveprofile",
        description="Approve profile"
    )
    async def approve(
        self,
        interaction: discord.Interaction
    ):
        
        if not isinstance(
            interaction.channel,
            discord.Thread
        ):
            
            await interaction.response.send_message(
                "❌ Use inside a member thread.",
                ephemeral=True
            )
            return
        
        if interaction.channel.parent_id != MEMBER_MANAGEMENT_FORUM:
            
            await interaction.response.send_message(
                "❌ Use inside a member-management thread.",
                ephemeral=True
            )
            return
        
        if not self.is_ranger(
            interaction.user
        ):
            
            await interaction.response.send_message(
                "❌ Ranger role required.",
                ephemeral=True
            )
            return 
        
        embed = discord.Embed(
            title="✅ Profile Approved",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="Moderator",
            value=interaction.user.mention
        )
        
        await interaction.channel.send(
            embed=embed
        )
        
        await interaction.response.send_message(
            "✅ Logged.",
            ephemeral=True
        )
    
    @app_commands.command(
        name="rejectprofile",
        description="Reject profile"
    )
    async def reject(
        self,
        interaction: discord.Interaction,
        reason: str
    ):
        
        if not isinstance(
            interaction.channel,
            discord.Thread
        ):
            
            await interaction.response.send_message(
                "❌ Use inside a member thread.",
                ephemeral=True
            )
            return
        
        if interaction.channel.parent_id != MEMBER_MANAGEMENT_FORUM:
            
            await interaction.response.send_message(
                "❌ Use inside a member-management thread.",
                ephemeral=True
            )
            return
        
        if not self.is_ranger(
            interaction.user
        ):
            
            await interaction.response.send_message(
                "❌ Ranger role required.",
                ephemeral=True
            )
            return
        
        user_uuid = await self.get_profile_uuid(
            interaction.channel
        )
        
        if not user_uuid:

            await interaction.response.send_message(
                "❌ Could not find profile UUID.",
                ephemeral=True
            )
            return
        
        ticket = (
            self.supabase
            .table("feedback_messages")
            .insert({
                "user_id": user_uuid,
                "category": "other",
                "message": "A moderator has rejected your profile.",
                "status": "new"
            })
            .execute()
        )
        
        feedback_id = (
            ticket.data[0]["id"]
        )
        
        (
            self.supabase
            .table("feedback_replies")
            .insert({
                "feedback_id": feedback_id,
                "author_role": "admin",
                "message": reason
            })
            .execute()
        )
        
        embed = discord.Embed(
            title="⛔ Profile Rejected",
            description=reason,
            color=discord.Color.red()
        )
        
        embed.add_field(
            name="Moderator",
            value=interaction.user.mention
        )
        
        await interaction.channel.send(
            embed=embed
        )
        
        await interaction.response.send_message(
            "✅ Rejection sent.",
            ephemeral=True
        )


    async def close_member_thread(self, interaction, user_uuid):

        self.thread_map.pop(user_uuid, None)
        self.save_threads()

        try:
            if isinstance(interaction.channel, discord.Thread):
                await interaction.channel.delete()
        except Exception as e:
            print(f"[MEMBERS] Failed deleting member thread for {user_uuid}: {e}")

    async def approve_profile(self, interaction, user_uuid, close_thread=False):

        embed = discord.Embed(
            title="✅ Profile Approved",
            color=discord.Color.green()
        )
        embed.add_field(name="Moderator", value=interaction.user.mention)
        await interaction.channel.send(embed=embed)
        await interaction.response.send_message("✅ Profile approved and post removed.", ephemeral=True)

        if close_thread:
            await self.close_member_thread(interaction, user_uuid)

    async def reject_profile(self, interaction, user_uuid, reason, close_thread=False):

        ticket = (
            self.supabase
            .table("feedback_messages")
            .insert({
                "user_id": user_uuid,
                "category": "other",
                "message": "A moderator has rejected your profile.",
                "status": "new"
            })
            .execute()
        )
        feedback_id = ticket.data[0]["id"]
        (
            self.supabase
            .table("feedback_replies")
            .insert({
                "feedback_id": feedback_id,
                "author_role": "admin",
                "message": reason
            })
            .execute()
        )
        embed = discord.Embed(title="⛔ Profile Rejected", description=reason, color=discord.Color.red())
        embed.add_field(name="Moderator", value=interaction.user.mention)
        await interaction.channel.send(embed=embed)
        await interaction.response.send_message("✅ Profile rejected and post removed.", ephemeral=True)

        if close_thread:
            await self.close_member_thread(interaction, user_uuid)

    async def delete_account(self, interaction, user_uuid, close_thread=False):

        await interaction.response.defer(ephemeral=True)
        try:
            self.supabase.table("profiles").delete().eq("id", user_uuid).execute()
            self.supabase.auth.admin.delete_user(user_uuid)
        except Exception as e:
            await interaction.followup.send(f"❌ Could not delete account: {e}", ephemeral=True)
            return

        await interaction.followup.send("🗑️ Account deleted and member-management post removed.", ephemeral=True)
        if close_thread:
            await self.close_member_thread(interaction, user_uuid)

    # -------------------------
    # MANUAL SYNC COMMAND
    # -------------------------

    @commands.command()
    @commands.has_permissions(
        administrator=True
    )
    async def syncmembers(
        self,
        ctx
    ):

        await ctx.send(
            "🔄 Running member sync..."
        )

        await self.profile_sync()

        await ctx.send(
            "✅ Member sync complete."
        )


async def setup(bot):

    await bot.add_cog(
        MemberManagement(bot)
    )
