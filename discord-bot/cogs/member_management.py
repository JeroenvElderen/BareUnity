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

        forum = self.bot.get_channel(
            MEMBER_MANAGEMENT_FORUM
        )

        if not isinstance(
            forum,
            discord.ForumChannel
        ):
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

            created = await forum.create_thread(
                name=thread_name[:100],
                content="👤 Creating profile card..."
            )

            thread = created.thread

            try:

                starter_message = created.message

                await starter_message.edit(
                    content="",
                    embed=embed
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

        except Exception:

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
                    embed=embed
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

            response = (
                self.supabase
                .table("profiles")
                .select("*")
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
                "❌ Use inside a member-manement thread.",
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