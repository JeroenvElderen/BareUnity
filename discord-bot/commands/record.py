import discord
from discord import app_commands
from discord.ext import commands
from services.recording import RecordingService
from utils.config import Settings

class RecordCommands(commands.Cog):
    def __init__(self, bot: commands.Bot, settings: Settings, recorder: RecordingService):
        self.bot = bot
        self.settings = settings
        self.recorder = recorder

    def _permitted(self, member: discord.Member) -> bool:
        allowed = self.settings.allowed_role_ids
        return member.guild_permissions.manage_guild or not allowed or any(role.id in allowed for role in member.roles)

    record = app_commands.Group(name="record", description="TurboCraig recording controls")

    @record.command(name="start")
    async def start(self, interaction: discord.Interaction):
        if not isinstance(interaction.user, discord.Member) or not self._permitted(interaction.user):
            await interaction.response.send_message("You do not have permission to start recordings.", ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        session = await self.recorder.start(interaction)
        await interaction.followup.send(f"Recording started. Session ID: `{session.id}`", ephemeral=True)

    @record.command(name="stop")
    async def stop(self, interaction: discord.Interaction):
        if not isinstance(interaction.user, discord.Member) or not self._permitted(interaction.user):
            await interaction.response.send_message("You do not have permission to stop recordings.", ephemeral=True); return
        await interaction.response.defer()
        session = await self.recorder.stop(interaction.guild_id)
        urls = await self.recorder.finalize(session)
        transcript = await self.recorder.transcribe(session, urls)
        await self.recorder.cleanup(session)
        await interaction.followup.send(f"Recording `{session.id}` complete. Transcript:\n{transcript[:1800] or 'Transcript completed.'}")

    @record.command(name="status")
    async def status(self, interaction: discord.Interaction):
        session = self.recorder.sessions.get(interaction.guild_id)
        if not session:
            await interaction.response.send_message("No active recording.", ephemeral=True); return
        duration = discord.utils.utcnow() - session.started_at
        participants = ", ".join(t.username for t in session.tracks.values()) or "none"
        await interaction.response.send_message(f"Session `{session.id}` recording for {duration}. Participants: {participants}", ephemeral=True)

    @record.command(name="transcript")
    async def transcript(self, interaction: discord.Interaction):
        await interaction.response.send_message("Transcript retrieval is backed by PostgreSQL in production; use the latest completed session transcript URL.", ephemeral=True)
