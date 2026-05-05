from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://dropbox_user:dropbox_pass@localhost:5432/dropbox_db"
    hdfs_host: str = "namenode"
    hdfs_port: int = 9000
    hdfs_url: str = "http://namenode:9870"
    kafka_bootstrap: str = "kafka:9092"
    secret_key: str = "dev-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours

    class Config:
        env_file = ".env"

settings = Settings()
