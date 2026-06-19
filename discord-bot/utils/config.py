from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    discord_token: str
    discord_guild_id: int | None = None
    recording_role_ids: str = ""
    database_url: str
    storage_endpoint_url: str
    storage_access_key_id: str
    storage_secret_access_key: str
    storage_bucket: str
    storage_public_base_url: str | None = None
    signed_url_ttl_seconds: int = 604800
    turboscribe_api_key: str = ""
    turboscribe_base_url: str = "https://api.turboscribe.ai"
    temp_dir: str = "/tmp/turbocraig"
    log_level: str = "INFO"
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def allowed_role_ids(self) -> set[int]:
        return {int(x.strip()) for x in self.recording_role_ids.split(',') if x.strip()}

@lru_cache
def get_settings() -> Settings:
    return Settings()
