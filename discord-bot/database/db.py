from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from utils.config import Settings

class Database:
    def __init__(self, settings: Settings):
        self.engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

    def session(self) -> AsyncSession:
        return self.session_factory()
