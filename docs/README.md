# G.S Gacuba 2A Technical Documentation Suite (v2.1.0)

Welcome to the central technical documentation library for the **Groupe Scolaire Gacuba 2A Integrated School Administration Portal**.

This suite serves as the single source of truth for software engineers, database architects, and system custodians operating, extending, or auditing the platform.

---

## 1. Release v2.1.0 Engineering Delta

Version `2.1.0` introduces significant architectural and functional expansions over the initial prototype:

1. **Teacher Workspace & Assigned Stream Governance:** Dedicated portal view for teachers (`TeacherOverview.tsx`, `TeacherStudentRegister.tsx`) with strict Row-Level Security ensuring educators only see and grade students in assigned classes via `teacher_class_assignments`.
2. **Production Mid-Term Academic Engine:** Complete lifecycle state machine (`open` -> `locked` -> `finalized`), dynamic REB subject configuration, automated ranking calculation, and bulk parent PDF generation via `jspdf-autotable`.
3. **Cryptographic Parent Report Tokenization:** Edge function `issue-midterm-links` generates tamper-proof URL access tokens, allowing parents to securely view and download official bilingual report cards without credential friction.
4. **Africa's Talking Telecommunications Integration:** Direct carrier routing for SMS notifications (+250 Rwandan mobile numbers), batch chunking, credit balance monitoring, and automated delivery auditing.
5. **Student Archival & Historical Recovery:** Soft-deletion subsystem backed by `school_students_archive` with mandatory reason audit logging and instant restoration capabilities.
6. **Zero-Config In-Memory Resilience:** Universal client-side fallback allowing full demonstration, UI testing, and offline operations without requiring live database credentials.

---

## 2. Documentation Architecture

| Document | File | Purpose & Architectural Highlights |
|---|---|---|
| **Product Requirements & Specifications** | [PRD_SRS.md](PRD_SRS.md) | Exhaustive requirements specification: User personas, Gherkin acceptance criteria for all modules (SIS, Midterm, SMS, CMS), performance metrics, and compliance constraints. |
| **Software Design Document (SDD)** | [SOFTWARE_DESIGN_DOCUMENT.md](SOFTWARE_DESIGN_DOCUMENT.md) | High-level system topology, React 18 component tree hierarchy, PostgreSQL relational ERD schemas, database triggers, and client/edge caching protocols. |
| **Architecture Decision Records (ADRs)** | [ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md) | 13 formal records documenting technical choices: React SPA, RLS boundaries, student archive lifecycle, tokenized parent report links, and ADR-013 scope boundaries (omission of daily attendance/payroll to enforce 500MB/1GB storage survival). |
| **API & Integration Specifications** | [API_INTEGRATION_SPECIFICATIONS.md](API_INTEGRATION_SPECIFICATIONS.md) | End-to-end specification of Supabase PostgREST endpoints, PostgreSQL stored procedures/RPCs, Deno Edge Functions, and Africa's Talking SMS gateway webhooks. |
| **Database Production Audit** | [DATABASE_PRODUCTION_AUDIT.md](DATABASE_PRODUCTION_AUDIT.md) | Comprehensive schema audit, index verification, foreign key cascades, and RLS policy review for production deployment. |
| **UI/UX Design Documentation** | [UI_UX_DESIGN_DOCUMENTATION.md](UI_UX_DESIGN_DOCUMENTATION.md) | Design token specifications, institutional typography (`Plus Jakarta Sans` / `JetBrains Mono`), layout matrices, and ASCII wireframe blueprints. |
| **Development & Onboarding Guidelines** | [DEVELOPMENT_ONBOARDING_GUIDELINES.md](DEVELOPMENT_ONBOARDING_GUIDELINES.md) | Engineer onboarding manual: Environment setup, coding standards, Git workflow, branch naming, migration runbooks, and CI/CD pipelines. |
| **Mid-Term Workflow Test Plan** | [midterm-workflow-test-plan.md](midterm-workflow-test-plan.md) | End-to-end integration and user acceptance testing plan for academic grading, mark verification, period locking, and report issuance. |

---

## 3. Technology & Institutional Reference

- **Primary Institution:** Groupe Scolaire Gacuba 2A
- **Location:** Rubavu District, Gisenyi Sector, Western Province, Republic of Rwanda
- **Curriculum Standard:** Rwanda Education Board (REB) grading system (`A` to `E`, 80/70/60/50 thresholds)
- **Frontend Core:** React 18.3, TypeScript 5.5, Vite 5.4, Tailwind CSS 3.4, Lucide Icons, jsPDF
- **Backend Core:** Supabase PostgreSQL 15 (Row-Level Security), GoTrue Auth, PostgREST 12, Deno Edge Functions
- **Telecom Gateway:** Africa's Talking Bulk SMS API (Rwanda Sandbox & Production)

---

## 4. Architectural Principles

1. **Database as the Ultimate Authority:** The database is never treated as a passive storage bucket. PostgreSQL schemas enforce business constraints, audit trails, and role-based access rules directly at the data layer.
2. **Offline-Tolerant Single Page Application:** Educational institutions in Rubavu frequently encounter intermittent cellular broadband. The UI prioritizes client-side caching, local state resilience, and optimistic updates.
3. **Immutability of Academic History:** Once an academic period is marked as `finalized`, marks and student demographic snapshots are locked against retroactive modifications.
4. **Privacy-Preserving Parent Communication:** Parent links are cryptographically random and time-bounded. No personal phone numbers or academic results are exposed to public unauthenticated crawlers.
