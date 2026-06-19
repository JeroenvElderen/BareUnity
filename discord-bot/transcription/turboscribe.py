import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential
from transcription.base import TranscriptionJob, TranscriptionProvider
from utils.config import Settings

class TurboScribeProvider(TranscriptionProvider):
    def __init__(self, settings: Settings):
        self.base_url = settings.turboscribe_base_url.rstrip('/')
        self.api_key = settings.turboscribe_api_key

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=30))
    async def upload_audio(self, session_id: str, audio_urls: list[str]) -> TranscriptionJob:
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.post(f"{self.base_url}/v1/jobs", json={"external_id": session_id, "audio_urls": audio_urls}) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return TranscriptionJob(job_id=str(data["id"]), status=data.get("status", "queued"))

    async def get_status(self, job_id: str) -> str:
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.get(f"{self.base_url}/v1/jobs/{job_id}") as resp:
                resp.raise_for_status()
                return (await resp.json()).get("status", "unknown")

    async def get_transcript(self, job_id: str) -> str:
        async with aiohttp.ClientSession(headers=self._headers()) as session:
            async with session.get(f"{self.base_url}/v1/jobs/{job_id}/transcript") as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data.get("text", "")
