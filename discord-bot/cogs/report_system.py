import discord
import json
import os
from discord.ext import commands
from discord.ui import View, Button
from discord import app_commands

REPORTS_CHANNEL = 1516069773920960585
CASE_FORUM = 1516175139761291284
COMMUNITY_WATCH_ROLE = 1516171676361035796
MEMBER_RECORDS_CHANNEL = 1516172309881290912

REPORTS_FILE = "reports.json"

WARNING_EMOJI = "⚠️"

# message_id -> report data
def load_reports():

    if not os.path.exists(REPORTS_FILE):
        return {}

    try:

        with open(
            REPORTS_FILE,
            "r",
            encoding="utf-8"
        ) as f:

            return json.load(f)

    except Exception:
        return {}


def save_reports():

    with open(
        REPORTS_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            reports,
            f,
            indent=4
        )


reports = load_reports()


class ReportView(View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Dismiss",
        emoji="✅",
        style=discord.ButtonStyle.success,
        custom_id="report_dismiss"
    )
    async def dismiss(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):

        try:

            embed = interaction.message.embeds[0]

            target_message_id = int(
                embed.footer.text.split("|")[0]
            )

            reports.pop(
                str(target_message_id),
                None
            )

            save_reports()

        except Exception:
            pass
        
        await interaction.message.delete()

    @discord.ui.button(
        label="Take Action",
        emoji="⛔",
        style=discord.ButtonStyle.danger,
        custom_id="report_action"
    )
    async def action(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):

        embed = interaction.message.embeds[0]

        target_message_id = int(
            embed.footer.text.split("|")[0]
        )

        guild = interaction.guild

        data = reports.get(
            str(target_message_id)
        )

        if not data:
            await interaction.response.send_message(
                "Report data not found.",
                ephemeral=True
            )
            return

        channel = guild.get_channel(data["channel_id"])

        if channel is None:
            channel = guild.get_thread(data["channel_id"])

        try:
            message = await channel.fetch_message(
                target_message_id
            )
        except Exception:
            message = None

        offender = guild.get_member(
            data["author_id"]
        )
        
        saved_files = []
        
        if message:
            
            for attachment in message.attachments:
                
                try:
                    saved_files.append(
                        await attachment.to_file()
                    )
                except Exception:
                    pass

        # Assign Community Watch
        if offender:

            role = guild.get_role(
                COMMUNITY_WATCH_ROLE
            )

            if role:
                try:
                    await offender.add_roles(role)
                except Exception:
                    pass


                # Member Records entry
        if offender:

            records_channel = guild.get_channel(
                MEMBER_RECORDS_CHANNEL
            )

            if records_channel:
                
                existing_message = None

                async for msg in records_channel.history(limit=500):

                    if not msg.embeds:
                        continue

                    try:

                        user_id_field = msg.embeds[0].fields[2]

                        if user_id_field.value == str(offender.id):
                            existing_message = msg
                            break

                    except Exception:
                        pass
    
                embed = discord.Embed(
                    title="⚠️ Community Watch Record",
                    color=discord.Color.orange()
                )

                embed.add_field(
                    name="User",
                    value=offender.mention,
                    inline=False
                )

                embed.add_field(
                    name="Username",
                    value=str(offender),
                    inline=False
                )

                embed.add_field(
                    name="User ID",
                    value=str(offender.id),
                    inline=False
                )

                embed.add_field(
                    name="Moderator",
                    value=interaction.user.mention,
                    inline=False
                )

                report_count = 1
                
                if existing_message:
                    
                    try:
                        
                        old_embed = existing_message.embeds[0]
                        
                        old_count = int(
                            old_embed.fields[4].value
                        )
                        
                        report_count = old_count + 1
                    
                    except Exception:
                        report_count = 1
                
                embed.add_field(
                    name="Reports",
                    value=str(report_count),
                    inline=False
                )

                report_text = (
                    data["content"][:1800]
                    if data["content"]
                    else "No content"
                )

                attachments = "No attachments"

                if data.get("attachments"):
                    attachments = "\n".join(
                        data["attachments"]
                    )

                embed.add_field(
                    name="Reported Content",
                    value=report_text,
                    inline=False
                )
                
                if attachments != "No attachments":
                    
                    embed.add_field(
                        name="Attachments",
                        value=attachments[:1024],
                        inline=False
                    )

                embed.set_thumbnail(
                    url=offender.display_avatar.url
                )

                if existing_message:
                    
                    await existing_message.edit(
                        embed=embed
                    )
                
                else:
                    
                    await records_channel.send(
                        embed=embed
                    )

        # Create / append case thread
        if offender:

            forum = guild.get_channel(
                CASE_FORUM
            )

            if isinstance(
                forum,
                discord.ForumChannel
            ):

                case_name = (
                    f"{offender.name}-report"
                ).lower()

                existing_thread = None

                try:
                    async for thread in forum.archived_threads(
                        limit=100
                    ):
                        if (
                            thread.name.lower()
                            == case_name
                        ):
                            existing_thread = thread
                            break
                except Exception:
                    pass

                if not existing_thread:

                    for thread in forum.threads:
                        if (
                            thread.name.lower()
                            == case_name
                        ):
                            existing_thread = thread
                            break

                report_text = (
                    data["content"][:1800]
                    if data["content"]
                    else "No content"
                )

                case_message = (
                    f"## ⚠️ Community Watch Case\n\n"

                    f"### 👤 Reported User\n"
                    f"**Mention:** {offender.mention}\n"
                    f"**Username:** {offender}\n"
                    f"**User ID:** {offender.id}\n"
                    f"**Account Created:** <t:{int(offender.created_at.timestamp())}:F>\n"
                    f"**Joined Server:** <t:{int(offender.joined_at.timestamp())}:F>\n\n"

                    f"### 🛡️ Moderator Action\n"
                    f"**Moderator:** {interaction.user.mention}\n"
                    f"**Reports:** {report_count}\n\n"

                    f"### 📍 Original Location\n"
                    f"<#{data['channel_id']}>\n\n"

                    f"### 📝 Reported Content\n"
                    f"```{report_text}```"

                    f"\n\n### 📎 Attachments\n{attachments}"
                )

                if existing_thread:

                    try:
                        
                        starter_message = (
                            await existing_thread.fetch_message(
                                existing_thread.id
                            )
                        )
                        
                        await starter_message.edit(
                            content=case_message
                        )
                    
                    except Exception as e:
                        
                        print(
                            f"Case update failed: {e}"
                        )

                else:

                    thread_with_message = await forum.create_thread(
                        name=case_name,
                        content=case_message
                    )

                    created_thread = thread_with_message.thread

                    if message:

                        for file in saved_files:
                            
                            await created_thread.send(
                                file=file
                            )

        reports.pop(
            str(target_message_id),
            None
        )
        
        save_reports()

        await interaction.message.delete()


class ReportSystem(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def find_case_thread(
        self,
        guild,
        member
    ):
        forum = guild.get_channel(
            CASE_FORUM
        )

        if not isinstance(
            forum,
            discord.ForumChannel
        ):
            return None

        case_name = (
            f"{member.name}-report"
        ).lower()

        for thread in forum.threads:

            if thread.name.lower() == case_name:
                return thread

        try:
            async for thread in forum.archived_threads(
                limit=100
            ):
                if (
                    thread.name.lower()
                    == case_name
                ):
                    return thread
        except Exception:
            pass

        return None
    
    @app_commands.command(
        name="watchlist",
        description="Show all Community Watch users"
    )
    async def watchlist(
        self,
        interaction: discord.Interaction
    ):
        role = interaction.guild.get_role(
            COMMUNITY_WATCH_ROLE
        )

        if not role:
            await interaction.response.send_message(
                "Role not found.",
                ephemeral=True
            )
            return

        embed = discord.Embed(
            title="⚠️ Community Watch",
            color=discord.Color.orange()
        )

        embed.description = (
            "\n".join(
                f"• {m.mention}"
                for m in role.members
            )
            or "No users on Community Watch."
        )

        await interaction.response.send_message(
            embed=embed
        )

    @app_commands.command(
        name="reportstats",
        description="Report statistics"
    )
    async def reportstats(
        self,
        interaction: discord.Interaction
    ):

        role = interaction.guild.get_role(
            COMMUNITY_WATCH_ROLE
        )

        count = (
            len(role.members)
            if role
            else 0
        )

        embed = discord.Embed(
            title="📊 Report Statistics",
            color=discord.Color.blurple()
        )

        embed.add_field(
            name="Community Watch",
            value=str(count),
            inline=False
        )

        embed.add_field(
            name="Open Reports",
            value=str(len(reports)),
            inline=False
        )

        await interaction.response.send_message(
            embed=embed
        )

    @app_commands.command(
        name="case",
        description="Open a user's case"
    )
    async def case(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):

        thread = await self.find_case_thread(
            interaction.guild,
            member
        )

        if not thread:
            await interaction.response.send_message(
                "Case not found.",
                ephemeral=True
            )
            return

        await interaction.response.send_message(
            thread.jump_url,
            ephemeral=True
        )

    @app_commands.command(
        name="addnote",
        description="Add a note to a case"
    )
    async def addnote(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        note: str
    ):

        thread = await self.find_case_thread(
            interaction.guild,
            member
        )

        if not thread:
            await interaction.response.send_message(
                "Case not found.",
                ephemeral=True
            )
            return

        embed = discord.Embed(
            title="📝 Moderator Note",
            color=discord.Color.blue()
        )

        embed.add_field(
            name="Moderator",
            value=interaction.user.mention,
            inline=False
        )

        embed.add_field(
            name="Note",
            value=note,
            inline=False
        )

        await thread.send(
            embed=embed
        )

        await interaction.response.send_message(
            "Note added.",
            ephemeral=True
        )

    @app_commands.command(
        name="remove_watch",
        description="Remove Community Watch"
    )
    async def remove_watch(
        self,
        interaction: discord.Interaction,
        member: discord.Member
    ):

        role = interaction.guild.get_role(
            COMMUNITY_WATCH_ROLE
        )

        if not role:
            await interaction.response.send_message(
                "Role not found.",
                ephemeral=True
            )
            return

        await member.remove_roles(role)

        thread = await self.find_case_thread(
            interaction.guild,
            member
        )

        if thread:

            embed = discord.Embed(
                title="✅ Community Watch Removed",
                color=discord.Color.green()
            )

            embed.add_field(
                name="User",
                value=member.mention,
                inline=False
            )

            embed.add_field(
                name="Moderator",
                value=interaction.user.mention,
                inline=False
            )

            await thread.send(
                embed=embed
            )

        await interaction.response.send_message(
            f"Removed Community Watch from {member.mention}"
        )

    @commands.Cog.listener()
    async def on_ready(self):

        self.bot.add_view(
            ReportView()
        )

        print(
            "Report system loaded"
        )
        
        
    @commands.Cog.listener()
    async def on_raw_reaction_add(
        self,
        payload
    ):

        if payload.user_id == self.bot.user.id:
            return

        if str(payload.emoji) != WARNING_EMOJI:
            return

        guild = self.bot.get_guild(
            payload.guild_id
        )

        if guild is None:
            return

        channel = guild.get_channel(
            payload.channel_id
        )

        if channel is None:
            channel = guild.get_thread(
                payload.channel_id
            )

        if channel is None:
            return

        try:
            message = await channel.fetch_message(
                payload.message_id
            )
        except Exception:
            return

        reporter = guild.get_member(
            payload.user_id
        )

        if reporter is None:
            return

        if message.author.bot:
            return

        reports_channel = guild.get_channel(
            REPORTS_CHANNEL
        )

        if reports_channel is None:
            return

        if str(payload.message_id) in reports:

            data = reports[
                str(payload.message_id)
            ]

            if (
                reporter.id
                not in data["reporters"]
            ):
                data["reporters"].append(
                    reporter.id
                )

            report_msg = await reports_channel.fetch_message(
                data["report_message_id"]
            )

            embed = report_msg.embeds[0]

            embed.set_field_at(
                3,
                name="Report Count",
                value=str(
                    len(
                        data["reporters"]
                    )
                ),
                inline=False
            )

            reporters_text = "\n".join(
                [
                    f"<@{x}>"
                    for x in data[
                        "reporters"
                    ]
                ]
            )

            embed.set_field_at(
                4,
                name="Reported By",
                value=reporters_text,
                inline=False
            )

            await report_msg.edit(
                embed=embed
            )

            return

        jump_link = (
            f"https://discord.com/channels/"
            f"{guild.id}/"
            f"{channel.id}/"
            f"{message.id}"
        )

        embed = discord.Embed(
            title="🚨 New Report",
            color=discord.Color.red()
        )

        embed.add_field(
            name="Reported User",
            value=message.author.mention,
            inline=False
        )

        embed.add_field(
            name="Channel",
            value=channel.mention,
            inline=False
        )

        embed.add_field(
            name="Message",
            value=(
                message.content[:1000]
                if message.content
                else "*No text*"
            ),
            inline=False
        )

        embed.add_field(
            name="Report Count",
            value="1",
            inline=False
        )

        embed.add_field(
            name="Reported By",
            value=reporter.mention,
            inline=False
        )

        embed.add_field(
            name="Jump",
            value=f"[Open Message]({jump_link})",
            inline=False
        )

        if message.attachments:

            first_attachment = message.attachments[0]

            if first_attachment.content_type:

                if first_attachment.content_type.startswith(
                    "image"
                ):
                    embed.set_image(
                        url=first_attachment.url
                    )
            
        embed.set_footer(
            text=f"{message.id}|"
                 f"{message.author.id}"
        )

        report_message = await reports_channel.send(
            embed=embed,
            view=ReportView()
        )

        try:
            await message.remove_reaction(
                WARNING_EMOJI,
                reporter
            )
        except Exception:
            pass

        reports[str(payload.message_id)] = {
            "author_id":
                message.author.id,
            "channel_id":
                channel.id,
            "content":
                message.content,
            "attachments":
                [
                    attachment.url
                    for attachment
                    in message.attachments
                ],
            "reporters":
                [reporter.id],
            "report_message_id":
                report_message.id
        }
        
        save_reports()


async def setup(bot):
    await bot.add_cog(
        ReportSystem(bot)
    )