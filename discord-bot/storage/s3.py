from pathlib import Path
import boto3
from botocore.config import Config
from tenacity import retry, stop_after_attempt, wait_exponential
from utils.config import Settings

class S3Storage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint_url,
            aws_access_key_id=settings.storage_access_key_id,
            aws_secret_access_key=settings.storage_secret_access_key,
            config=Config(signature_version="s3v4"),
        )

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=30))
    def upload_file(self, path: Path, key: str) -> str:
        self.client.upload_file(str(path), self.settings.storage_bucket, key)
        return key

    def signed_url(self, key: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.settings.storage_bucket, "Key": key},
            ExpiresIn=self.settings.signed_url_ttl_seconds,
        )
