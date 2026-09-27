"""Deterministic Universal Composer intent resolution for Phase 9C.

This resolver is deliberately conservative. It does not call a model and it
never converts AUTO directly into RUN.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_office.domain import ComposerIntent


@dataclass(frozen=True, slots=True)
class IntentResolution:
    resolved_intent: ComposerIntent
    reason_summary: str
    requires_user_action: bool = False


_BRAINSTORM_MARKERS = (
    "brainstorm",
    "ideation",
    "explore options",
    "explore ideas",
    "alternative",
    "alternatif",
    "opsi",
    "ide ",
    "ide-",
    "konsep",
    "brain storm",
)

_MUTATION_MARKERS = (
    "implement",
    "implementation",
    "build ",
    "create ",
    "change ",
    "modify",
    "edit ",
    "fix ",
    "refactor",
    "ship ",
    "deploy",
    "kerjakan",
    "implementasi",
    "buat ",
    "ubah ",
    "perbaiki",
    "benahi",
    "coding",
    "kode",
    "lanjutkan",
    "continue",
    "resume",
)

_EXECUTION_MARKERS = (
    "start run",
    "run it",
    "execute",
    "langsung kerjakan",
    "langsung coding",
    "langsung implement",
    "gas implement",
    "mulai run",
    "jalankan",
)

_QUESTION_PREFIXES = (
    "what ",
    "why ",
    "how ",
    "when ",
    "where ",
    "which ",
    "can ",
    "does ",
    "is ",
    "are ",
    "apa ",
    "kenapa ",
    "mengapa ",
    "bagaimana ",
    "kapan ",
    "dimana ",
    "di mana ",
    "mana ",
    "bisakah ",
    "bisa ",
    "apakah ",
    "jelaskan ",
    "explain ",
)


class IntentResolver:
    """Resolve an explicit/AUTO Composer intent without provider inference."""

    def resolve(
        self,
        *,
        requested_intent: ComposerIntent,
        instruction: str,
        project_selected: bool,
    ) -> IntentResolution:
        normalized = " ".join(instruction.strip().lower().split())

        if requested_intent is not ComposerIntent.AUTO:
            if requested_intent is ComposerIntent.RUN:
                return IntentResolution(
                    resolved_intent=ComposerIntent.RUN,
                    reason_summary=(
                        "RUN was selected explicitly. Phase 9C records the execution intent "
                        "but still requires approved scope and the later execution-promotion gate."
                    ),
                    requires_user_action=True,
                )
            return IntentResolution(
                resolved_intent=requested_intent,
                reason_summary=f"{requested_intent.value} was selected explicitly.",
                requires_user_action=(
                    not project_selected
                    and requested_intent in {ComposerIntent.PLAN, ComposerIntent.BRAINSTORM}
                ),
            )

        if any(marker in normalized for marker in _BRAINSTORM_MARKERS):
            return IntentResolution(
                resolved_intent=ComposerIntent.BRAINSTORM,
                reason_summary="AUTO detected an explicit ideation/options request.",
                requires_user_action=False,
            )

        looks_like_question = normalized.endswith("?") or normalized.startswith(_QUESTION_PREFIXES)
        contains_mutation = any(marker in normalized for marker in _MUTATION_MARKERS)

        if looks_like_question and not contains_mutation:
            return IntentResolution(
                resolved_intent=ComposerIntent.ASK,
                reason_summary=(
                    "AUTO detected a read-only question with no "
                    "repository-changing request."
                ),
                requires_user_action=False,
            )

        if any(marker in normalized for marker in _EXECUTION_MARKERS):
            return IntentResolution(
                resolved_intent=ComposerIntent.PLAN,
                reason_summary=(
                    "AUTO does not start execution. The execution request is converted to PLAN "
                    "until requirements and an execution proposal are explicitly approved."
                ),
                requires_user_action=False,
            )

        return IntentResolution(
            resolved_intent=ComposerIntent.PLAN,
            reason_summary=(
                "AUTO conservatively selected PLAN because the request is broad, changing, "
                "or requires repository context before execution."
            ),
            requires_user_action=not project_selected,
        )
