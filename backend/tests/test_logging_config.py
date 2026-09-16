import json
import logging

from agent_office.logging_config import (
    StructuredJsonFormatter,
    configure_logging,
)


def test_structured_formatter_emits_safe_machine_readable_fields() -> None:
    record = logging.LogRecord(
        name="agent_office.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="project registered",
        args=(),
        exc_info=None,
    )

    record.operation = "project.register"
    record.project_id = "project-test"

    payload = json.loads(
        StructuredJsonFormatter().format(record),
    )

    assert payload["level"] == "INFO"
    assert payload["module"] == "agent_office.test"
    assert payload["message"] == "project registered"
    assert payload["operation"] == "project.register"
    assert payload["project_id"] == "project-test"

    assert "timestamp" in payload


def test_configure_logging_uses_requested_level() -> None:
    logger = configure_logging("WARNING")

    assert logger.level == logging.WARNING
    assert len(logger.handlers) == 1
    assert isinstance(
        logger.handlers[0].formatter,
        StructuredJsonFormatter,
    )
