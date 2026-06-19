import asyncio
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import discord
import structlog
from models.entities import RecordingSession, TrackMetadata
from storage.s3 import S3Storage
from transcription.base import TranscriptionProvider
from utils.config import Settings

log = structlog.get_logger()

class FlacSink(discord.sinks.Sink):
    """A multitrack sink that lets discord.py write one native 48 kHz stream per user.

    discord.py supplies per-user AudioData objects. The sink stores them separately and
    finalization converts each stream to FLAC with ffmpeg, preserving the native sample rate.
    """
    def __init__(self, session_path: Path):
        super().__init__()
        self.encoding = "pcm"
        self.vc = None
        self.session_path = session_path
        self.raw_dir = session_path / "raw"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self._files: dict[int, object] = {}

    def write(self, data, user):
        user_id = int(user.id)
        if user_id not in self._files:
            self._files[user_id] = open(self.raw_dir / f"user_{user_id}.pcm", "ab")
        self._files[user_id].write(data)

    def cleanup(self):
        for handle in self._files.values():
            handle.close()
        super().cleanup()

class RecordingService:
    def __init__(self, settings: Settings, storage: S3Storage, transcription: TranscriptionProvider):
        self.settings = settings
        self.storage = storage
        self.transcription = transcription
        self.sessions: dict[int, RecordingSession] = {}
        self.voice_clients: dict[int, discord.VoiceClient] = {}

    async def start(self, interaction: discord.Interaction) -> RecordingSession:
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
            raise RuntimeError("Join a voice channel before starting a recording.")
        if interaction.guild_id in self.sessions:
            raise RuntimeError("A recording is already active in this server.")
        session = RecordingSession(interaction.guild_id, member.voice.channel.id, interaction.channel_id, member.id, id=uuid4())
        session.path = Path(self.settings.temp_dir) / f"session_{session.id}"
        session.path.mkdir(parents=True, exist_ok=True)
        vc = await member.voice.channel.connect(self_deaf=True, reconnect=True)
        sink = FlacSink(session.path)
        vc.start_recording(sink, self._recording_finished, interaction.channel, session.id)
        self.sessions[interaction.guild_id] = session
        self.voice_clients[interaction.guild_id] = vc
        for voice_member in member.voice.channel.members:
            if not voice_member.bot:
                self.mark_join(session, voice_member)
        log.info("recording_started", session_id=str(session.id), guild_id=interaction.guild_id)
        return session

    def mark_join(self, session: RecordingSession, member: discord.Member) -> None:
        session.tracks.setdefault(member.id, TrackMetadata(member.id, str(member), datetime.now(timezone.utc), track_filename=f"user_{member.id}.flac"))

    def mark_leave(self, guild_id: int, member: discord.Member) -> None:
        session = self.sessions.get(guild_id)
        if session and member.id in session.tracks:
            session.tracks[member.id].left_at = datetime.now(timezone.utc)

    async def stop(self, guild_id: int) -> RecordingSession:
        session = self.sessions[guild_id]
        vc = self.voice_clients.pop(guild_id)
        vc.stop_recording()
        await vc.disconnect(force=False)
        session.stopped_at = datetime.now(timezone.utc)
        session.status = "finalizing"
        return session

    async def finalize(self, session: RecordingSession) -> list[str]:
        assert session.path is not None
        urls: list[str] = []
        for track in session.tracks.values():
            track.left_at = track.left_at or datetime.now(timezone.utc)
            raw = session.path / "raw" / f"user_{track.user_id}.pcm"
            flac = session.path / track.track_filename
            if raw.exists():
                proc = await asyncio.create_subprocess_exec("ffmpeg", "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", str(raw), str(flac))
                code = await proc.wait()
                if code != 0:
                    raise RuntimeError(f"ffmpeg failed for {raw} with exit {code}")
                key = f"recordings/session_{session.id}/{track.track_filename}"
                self.storage.upload_file(flac, key)
                track.storage_key = key
                urls.append(self.storage.signed_url(key))
        metadata = {"session_id": str(session.id), "participants": [track.__dict__ | {"joined_at": track.joined_at.isoformat(), "left_at": track.left_at.isoformat() if track.left_at else None} for track in session.tracks.values()]}
        (session.path / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        self.storage.upload_file(session.path / "metadata.json", f"recordings/session_{session.id}/metadata.json")
        session.status = "uploaded"
        return urls

    async def transcribe(self, session: RecordingSession, urls: list[str]) -> str:
        job = await self.transcription.upload_audio(str(session.id), urls)
        for _ in range(120):
            status = await self.transcription.get_status(job.job_id)
            if status in {"completed", "done", "succeeded"}:
                return await self.transcription.get_transcript(job.job_id)
            if status in {"failed", "error"}:
                raise RuntimeError(f"Transcription failed: {status}")
            await asyncio.sleep(15)
        raise TimeoutError("Timed out waiting for transcription")

    async def cleanup(self, session: RecordingSession) -> None:
        if session.path and session.path.exists():
            shutil.rmtree(session.path, ignore_errors=True)

    async def _recording_finished(self, sink, channel: discord.TextChannel, session_id):
        sink.cleanup()
        log.info("discord_recording_sink_finished", session_id=str(session_id), channel_id=channel.id)
