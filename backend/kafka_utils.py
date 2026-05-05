import json
import threading
from kafka import KafkaProducer
from config import settings

_producer = None
_lock = threading.Lock()


def get_producer() -> KafkaProducer:
    global _producer
    with _lock:
        if _producer is None:
            try:
                _producer = KafkaProducer(
                    bootstrap_servers=settings.kafka_bootstrap,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                )
            except Exception as e:
                print(f"[Kafka] Could not connect: {e}")
                return None
    return _producer


def publish_event(topic: str, event: dict):
    producer = get_producer()
    if producer:
        try:
            producer.send(topic, event)
            producer.flush()
        except Exception as e:
            print(f"[Kafka] Failed to publish: {e}")
