"""Deterministic Dynamic Team Formation rules for Phase 9C."""

from __future__ import annotations

import re
from dataclasses import dataclass

from agent_office.application.planning.intent import IntentResolution
from agent_office.domain import ComposerIntent, TeamMemberDisposition, TeamPhase


@dataclass(frozen=True, slots=True)
class TeamFormationMember:
    role_key: str
    disposition: TeamMemberDisposition
    reason: str


@dataclass(frozen=True, slots=True)
class TeamFormationDecision:
    phase: TeamPhase
    rationale_summary: str
    members: tuple[TeamFormationMember, ...]


_UI_MARKERS = (
    "ui",
    "ux",
    "frontend",
    "screen",
    "page",
    "layout",
    "dashboard",
    "design",
    "visual",
    "tampilan",
    "halaman",
    "antarmuka",
)
_SECURITY_MARKERS = (
    "auth",
    "oauth",
    "sso",
    "security",
    "secret",
    "token",
    "permission",
    "credential",
    "filesystem",
    "network",
    "login",
    "keamanan",
    "izin",
)
_QA_MARKERS = (
    "qa",
    "test",
    "testing",
    "acceptance",
    "regression",
    "verification",
    "bug",
    "uji",
    "kriteria lulus",
)
_DOC_MARKERS = (
    "docs",
    "documentation",
    "document",
    "readme",
    "user guide",
    "sop",
    "dokumentasi",
    "panduan",
)
_BACKEND_MARKERS = (
    "backend",
    "api",
    "database",
    "schema",
    "service",
    "worker",
    "server",
    "sqlite",
)
_FRONTEND_MARKERS = (
    "frontend",
    "react",
    "css",
    "component",
    "browser",
    "ui",
    "ux",
    "layout",
    "screen",
    "page",
    "dashboard",
    "tampilan",
)
_ARCH_MARKERS = (
    "architecture",
    "arsitektur",
    "integration",
    "integrasi",
    "dependency",
    "service",
    "database",
    "schema",
    "workflow",
)
_REENTRY_MARKERS = (
    "continue",
    "resume",
    "revisit",
    "lanjutkan",
    "lanjut ",
    "sudah lama",
    "old project",
    "existing project",
)

_ROLE_CATALOG = (
    "product-manager",
    "system-analyst",
    "principal-engineer",
    "product-designer",
    "backend-engineer",
    "frontend-engineer",
    "qa-engineer",
    "security-reviewer",
    "technical-writer",
)


def _has_any_marker(text: str, markers: tuple[str, ...]) -> bool:
    """Match words/phrases without treating substrings like "ui" in requirement as UI."""

    return any(
        re.search(rf"(?<!\w){re.escape(marker.strip())}(?!\w)", text) is not None
        for marker in markers
        if marker.strip()
    )


class DynamicTeamFormationService:
    """Produce the smallest useful planning team from explicit facts."""

    def form(
        self,
        *,
        resolution: IntentResolution,
        instruction: str,
        project_selected: bool,
    ) -> TeamFormationDecision:
        text = " ".join(instruction.strip().lower().split())

        ui_scope = _has_any_marker(text, _UI_MARKERS)
        security_scope = _has_any_marker(text, _SECURITY_MARKERS)
        qa_scope = _has_any_marker(text, _QA_MARKERS)
        doc_scope = _has_any_marker(text, _DOC_MARKERS)
        backend_scope = _has_any_marker(text, _BACKEND_MARKERS)
        frontend_scope = _has_any_marker(text, _FRONTEND_MARKERS)
        architecture_scope = _has_any_marker(text, _ARCH_MARKERS)
        reentry = _has_any_marker(text, _REENTRY_MARKERS)

        members: list[TeamFormationMember] = []

        def add(
            role_key: str,
            disposition: TeamMemberDisposition,
            reason: str,
        ) -> None:
            if any(member.role_key == role_key for member in members):
                return
            members.append(
                TeamFormationMember(
                    role_key=role_key,
                    disposition=disposition,
                    reason=reason,
                )
            )

        def add_excluded_roles() -> None:
            excluded_reasons = {
                "product-manager": (
                    "No product-scope ownership is required by the resolved planning facts."
                ),
                "system-analyst": (
                    "No additional system-analysis role is required by the resolved planning facts."
                ),
                "principal-engineer": (
                    "No additional architecture or dependency review is required by the explicit scope."
                ),
                "product-designer": (
                    "No user-interface or user-experience scope was identified."
                ),
                "backend-engineer": (
                    "No backend implementation role is activated for this planning turn."
                ),
                "frontend-engineer": (
                    "No frontend implementation role is activated for this planning turn."
                ),
                "qa-engineer": (
                    "No explicit acceptance, regression, test, or defect scope was identified."
                ),
                "security-reviewer": (
                    "No explicit authentication, permission, secret, filesystem, or network risk was identified."
                ),
                "technical-writer": (
                    "No explicit documentation scope was identified."
                ),
            }
            for role_key in _ROLE_CATALOG:
                add(
                    role_key,
                    TeamMemberDisposition.EXCLUDED,
                    excluded_reasons[role_key],
                )

        if resolution.resolved_intent is ComposerIntent.ASK:
            add(
                "system-analyst",
                TeamMemberDisposition.INCLUDED,
                "A read-only question needs factual project/system interpretation.",
            )
            if architecture_scope:
                add(
                    "principal-engineer",
                    TeamMemberDisposition.INCLUDED,
                    "Architecture or dependency scope is present in the question.",
                )
            if ui_scope:
                add(
                    "product-designer",
                    TeamMemberDisposition.INCLUDED,
                    "The question includes user-interface or experience scope.",
                )
            if security_scope:
                add(
                    "security-reviewer",
                    TeamMemberDisposition.INCLUDED,
                    "The question includes authentication, permission, secret, or network risk.",
                )
            add_excluded_roles()
            return TeamFormationDecision(
                phase=TeamPhase.PLANNING,
                rationale_summary="ASK uses a minimal read-only specialist cell.",
                members=tuple(members),
            )

        documentation_only = doc_scope and not (
            backend_scope or frontend_scope or architecture_scope or ui_scope
        )

        if documentation_only:
            add(
                "technical-writer",
                TeamMemberDisposition.INCLUDED,
                "The requested scope is documentation-focused.",
            )
            add(
                "system-analyst",
                TeamMemberDisposition.INCLUDED,
                "Documentation still needs factual system/context validation.",
            )
        else:
            add(
                "product-manager",
                TeamMemberDisposition.INCLUDED,
                (
                    "Project re-entry needs requirement framing before implementation."
                    if reentry
                    else "Planning needs a single owner for scope, priorities, and user decisions."
                ),
            )
            add(
                "system-analyst",
                TeamMemberDisposition.INCLUDED,
                "Current requirements and system facts must be separated from assumptions.",
            )
            add(
                "principal-engineer",
                TeamMemberDisposition.INCLUDED,
                (
                    "The request has architecture/dependency impact."
                    if architecture_scope
                    else "A technical boundary is needed before implementation roles are activated."
                ),
            )

        if ui_scope:
            add(
                "product-designer",
                TeamMemberDisposition.INCLUDED,
                "User-facing behavior or visual scope is explicitly present.",
            )
        if qa_scope:
            add(
                "qa-engineer",
                TeamMemberDisposition.INCLUDED,
                "Acceptance, test, regression, or defect scope is explicitly present.",
            )
        if security_scope:
            add(
                "security-reviewer",
                TeamMemberDisposition.INCLUDED,
                "Authentication, permission, secret, filesystem, or network risk is present.",
            )
        if doc_scope and not any(member.role_key == "technical-writer" for member in members):
            add(
                "technical-writer",
                TeamMemberDisposition.INCLUDED,
                "The request explicitly includes documentation impact.",
            )

        if not documentation_only:
            implementation_reason = (
                "Implementation stays deferred until requirements are approved and an execution "
                "proposal passes the later promotion gate."
            )
            if backend_scope or not frontend_scope:
                add(
                    "backend-engineer",
                    TeamMemberDisposition.DEFERRED,
                    implementation_reason,
                )
            if frontend_scope or ui_scope or not backend_scope:
                add(
                    "frontend-engineer",
                    TeamMemberDisposition.DEFERRED,
                    implementation_reason,
                )

        if not project_selected:
            rationale = (
                "A planning team is proposed, but repository-scoped work remains blocked until "
                "a registered Project is selected."
            )
        elif resolution.resolved_intent is ComposerIntent.RUN:
            rationale = (
                "Execution intent is recorded, but Phase 9C keeps the team in planning/preflight "
                "until approved requirements can be promoted safely."
            )
        elif resolution.resolved_intent is ComposerIntent.BRAINSTORM:
            rationale = "A bounded cross-functional brainstorming cell is proposed."
        else:
            rationale = (
                "A small planning cell is proposed first; implementation roles remain deferred "
                "until scope is approved."
            )

        add_excluded_roles()
        return TeamFormationDecision(
            phase=TeamPhase.PLANNING,
            rationale_summary=rationale,
            members=tuple(members),
        )
