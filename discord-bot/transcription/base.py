from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class TranscriptionJob:
    job_id: str
    status: str

class TranscriptionProvider(ABC):
    @abstractmethod
    async def upload_audio(self, session_id: str, audio_urls: list[str]) -> TranscriptionJob: ...
    @abstractmethod
    async def get_status(self, job_id: str) -> str: ...
    @abstractmethod
    async def get_transcript(self, job_id: str) -> str: ...
