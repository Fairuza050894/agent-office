"""Deterministic Dynamic Team Formation rules for Phase 9C."""

from __future__ import annotations

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

        ui_scope = any(marker in text for marker in _UI_MARKERS)
        security_scope = any(marker in text for marker in _SECURITY_MARKERS)
        qa_scope = any(marker in text for marker in _QA_MARKERS)
        doc_scope = any(marker in text for marker in _DOC_MARKERS)
        backend_scope = any(marker in text for marker in _BACKEND_MARKERS)
        frontend_scope = any(marker in text for marker in _FRONTEND_MARKERS)
        architecture_scope = any(marker in text for marker in _ARCH_MARKERS)
        reentry = any(marker in text for marker in _REENTRY_MARKERS)

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

        return TeamFormationDecision(
            phase=TeamPhase.PLANNING,
            rationale_summary=rationale,
            members=tuple(members),
        )
