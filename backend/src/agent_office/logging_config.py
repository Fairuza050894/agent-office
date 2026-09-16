import json
import logging
from datetime import UTC, datetime


class StructuredJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
        }

        for field in (
            "operation",
            "project_id",
            "run_id",
            "agent_run_id",
            "safe_code",
            "duration",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )


def configure_logging(level: str) -> logging.Logger:
    logger = logging.getLogger("agent_office")

    logger.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(StructuredJsonFormatter())

    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False

    return logger
