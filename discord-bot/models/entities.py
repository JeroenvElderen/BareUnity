from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

@dataclass
class TrackMetadata:
    user_id: int
    username: str
    joined_at: datetime
    left_at: datetime | None = None
    track_filename: str = ""
    storage_key: str | None = None

@dataclass
class RecordingSession:
    guild_id: int
    channel_id: int
    text_channel_id: int | None
    started_by: int
    id: UUID = field(default_factory=uuid4)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    stopped_at: datetime | None = None
    status: str = "recording"
    tracks: dict[int, TrackMetadata] = field(default_factory=dict)
    path: Path | None = None
