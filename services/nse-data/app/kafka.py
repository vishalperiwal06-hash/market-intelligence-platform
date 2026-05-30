import json
import logging
from confluent_kafka import Producer
from app.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


class KafkaPublisher:
    def __init__(self) -> None:
        self.enabled = settings.kafka_enabled
        self.producer: Producer | None = None
        if self.enabled:
            self.producer = Producer(
                {
                    "bootstrap.servers": settings.kafka_bootstrap_servers,
                    "compression.type": "lz4",
                    "linger.ms": 25,
                    "batch.num.messages": 1000,
                    "message.timeout.ms": 5000,
                }
            )

    def publish(self, topic: str, key: str, value: dict) -> None:
        if not self.enabled or self.producer is None:
            return
        try:
            self.producer.produce(
                topic,
                key=key,
                value=json.dumps(value, default=str).encode("utf-8"),
            )
            self.producer.poll(0)
        except Exception as exc:
            logger.warning("kafka_publish_failed", extra={"topic": topic, "error": str(exc)})

    def flush(self) -> None:
        if self.producer is not None:
            self.producer.flush(5)


kafka_publisher = KafkaPublisher()
