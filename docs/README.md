# G.S Gacuba 2A Admin Portal Documentation

Welcome to the central technical documentation repository for the **Groupe Scolaire Gacuba 2A Integrated School Administration Portal**.

This documentation suite provides a complete, line-by-line architectural, operational, and requirements reference for developers, system architects, and school administrators.

---

## Documentation Suite

| Document | File | Purpose & Highlights |
|---|---|---|
| **Product Requirements & Software Specs** | [PRD_SRS.md](PRD_SRS.md) | Comprehensive functional modules (Student Registry, Mid-Term Academic Engine, PDF Report Cards, Multi-Channel SMS, Public CMS, Admissions Desk), user stories with Gherkin acceptance criteria, and non-functional performance benchmarks. |
| **Software Design Document (SDD)** | [SOFTWARE_DESIGN_DOCUMENT.md](SOFTWARE_DESIGN_DOCUMENT.md) | High-level system topology, frontend React 18 component tree, complete PostgreSQL relational ERD schemas, database triggers (`auto_compile_midterm_on_mark_save`), security barrier views, and 7-day storage cache architecture. |
| **Architecture Decision Records (ADRs)** | [ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md) | Formal records detailing key technical choices: React SPA over Django monolith, database-enforced RLS, public users profile table, decoupled parent contact snapshots, client-side PDF caching, and cryptographic SMS deduplication. |
| **UI/UX Design Documentation** | [UI_UX_DESIGN_DOCUMENTATION.md](UI_UX_DESIGN_DOCUMENTATION.md) | Design philosophy, color tokens (`#3A2818` espresso, `#C59B27` gold), state diagrams, user flows, and high-fidelity ASCII wireframes for every single application screen (reflecting paper wireframes and physical brainstorming systems; no Figma). |
| **API & Integration Specifications** | [API_INTEGRATION_SPECIFICATIONS.md](API_INTEGRATION_SPECIFICATIONS.md) | Complete PostgREST endpoint specifications, Supabase RPC stored procedures, Deno Edge Function email worker (`dispatch-midterm-emails`), private storage bucket protocols, and external SMS gateway webhook contracts. |
| **Development & Onboarding Guidelines** | [DEVELOPMENT_ONBOARDING_GUIDELINES.md](DEVELOPMENT_ONBOARDING_GUIDELINES.md) | Developer quickstart steps, TypeScript strict coding standards, Tailwind CSS guidelines, Git branching policies, conventional commits, and database migration runbooks. |

---

## System Quick Reference

- **Frontend Stack:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Font Awesome, jsPDF.
- **Backend Stack:** Supabase, PostgreSQL 15 with Row-Level Security, PostgREST API, Deno Edge Functions, Supabase Storage.
- **Primary Institution:** Groupe Scolaire Gacuba 2A (Rubavu District, Gisenyi, Western Province, Rwanda).
- **Curriculum Standard:** Rwanda Education Board (REB) grading system (`A` to `E`).
