# Development & Onboarding Guidelines
## G.S Gacuba 2A Integrated School Administration Portal

- **Audience:** Core Engineers, Technical Contributors, IT Custodians
- **Document Version:** 2.1.0
- **Status:** Approved Engineering Standards

---

## 1. Developer Prerequisites & Tooling

To contribute to the G.S Gacuba 2A portal codebase, your local workstation should have the following tools installed:

- **Node.js:** v18.18.0+ or v20.x LTS / v22.x
- **Package Manager:** `npm` (v9+)
- **TypeScript:** v5.5+
- **Version Control:** `git` (v2.30+)
- **Database Client / CLI (Optional):** Supabase CLI (`brew install supabase/tap/supabase` or `npm i -g supabase`)
- **IDE Recommendation:** Visual Studio Code with ESLint, Tailwind CSS IntelliSense, and PostCSS Language Support extensions.

---

## 2. Environment Setup & Quickstart

### Step 1: Clone the Repository
```bash
git clone https://github.com/Goallison123/school-system-v2.git
cd school-system-v2
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create your local `.env` configuration file from the template:
```bash
cp .env.example .env
```

Edit `.env` with your Supabase project credentials:
```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-jwt-key
```
*Note: If no Supabase credentials are provided, the application automatically launches in resilient mock mode with local test data, ensuring zero crashes during frontend development.*

### Step 4: Run Development Server
```bash
npm run dev
```
The development server will mount at `http://localhost:3000`.

### Step 5: Execute Automated Verification Suite
```bash
# 1. Run unit test suite (Vitest)
npm test

# 2. Check TypeScript types
npm run typecheck

# 3. Validate code formatting & syntax rules (ESLint)
npm run lint

# 4. Compile production build
npm run build
```

---

## 3. Code Style & Engineering Standards (In addition to sybella systems frontend, backend and software engineering guides written by Alexis and Prashant (Ask if no access to them today))

### 3.1 TypeScript & Type Safety
- **Strict Mode:** Strict type checking is enforced in `tsconfig.app.json`.
- **Zero `any` Policy:** Explicitly define all function signatures, component props, and API response types. Avoid `any`; use `unknown` with type guards or create explicit interfaces in `src/types.ts`.
- **Readonly Immortality:** Avoid direct mutation of state objects or arrays. Use immutable spreading or functional updates.

### 3.2 React Architecture & Hooks
- **Functional Components:** All UI components must be written as functional React components with standard hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`).
- **Heavy Calculation Memoization:** Calculations involving array reductions, filtering thousands of student records, or computing grade distributions must be wrapped in `useMemo`.
- **Event Handler Stability:** Handlers passed down to complex child tables should be wrapped in `useCallback` to prevent unnecessary re-render cycles.
- **Component Modularity:** Large views must be split into logical sub-components. Pure business logic (such as grading thresholds, CSV parsing, or phone validation) must live in `src/utils/` as pure, testable functions decoupled from React.

### 3.3 Tailwind CSS & Styling Guidelines
- **Zero Inline Styles:** Never use `style={{ ... }}` for layout or colors. Use utility classes from Tailwind CSS.
- **Brand Tokens:** Always employ the custom brand palette defined in `tailwind.config.js`:
  - Brand Dark: `bg-[#3A2818]` / `text-[#3A2818]`
  - Brand Accent: `text-[#C59B27]` / `bg-[#C59B27]`
  - Brand Light: `bg-[#FBF9F5]`
  - Brand Border: `border-stone-200` / `border-[#EAE5DC]`
- **Responsive Discipline:** Interfaces must support mobile and desktop views using Tailwind breakpoints (`sm:`, `md:`, `lg:`).

### 3.4 Semantic HTML & Accessibility (a11y)
- Buttons must have accessible text or `aria-label`/`title` attributes.
- Inputs must be paired with visible `<label>` elements or accessible `placeholder` and `aria-label` text.
- Form submissions must prevent default browser behavior (`e.preventDefault()`).

---

## 4. Version Control, Branching & Git Strategy

We follow a **Trunk-Based Development** model with short-lived, focused feature branches.

### 4.1 Branch Naming Conventions
- `feature/<kebab-case-description>`: New functional capabilities (e.g. `feature/students-registry`, `feature/pdf-export-upgrade`).
- `fix/<kebab-case-description>`: Bug and regression fixes (e.g. `fix/sms-recipient-phone-validation`).
- `docs/<kebab-case-description>`: Documentation additions and revisions (e.g. `docs/architecture-baseline`).
- `chore/<kebab-case-description>`: Build tooling, linting, and dependency upgrades.

### 4.2 Semantic Commit Messages
Commit messages must adhere to the Conventional Commits specification:
```text
<type>(<scope>): <short imperative summary>

[optional detailed body explaining why, trade-offs, and verification]
```
Examples:
- `feat(midterm): implement automatic report compilation trigger`
- `fix(csv): support semicolon delimiters in student roster import`
- `docs(adr): document parent contact snapshot isolation decision`
- `test(grading): add Vitest cases for REB grade threshold boundaries`

### 4.3 Pull Request (PR) Checklist & Merge Gates
Before opening or merging a Pull Request into `main`:
1. **Branch up-to-date:** Rebase or merge latest `main` into your feature branch.
2. **All tests green:** `npm test` passes 100% of test cases.
3. **Zero lint warnings:** `npm run lint` reports 0 errors.
4. **Clean compilation:** `npm run build` succeeds without bundle errors.
5. **No leaked secrets:** Verify no `.env` credentials, API tokens, or private service keys are committed.

---

## 5. Database Migration & Deployment Runbook

### 5.1 Authoring Supabase Migrations
Database schema updates must be written as discrete, sequential SQL migration files under `supabase/migrations/`:
```text
supabase/migrations/<YYYYMMDDHHMMSS>_<descriptive_name>.sql
```

Rules for safe migrations:
- **Idempotency:** Always use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`, and `CREATE OR REPLACE FUNCTION`.
- **Transaction Safety:** Wrap complex multi-statement triggers or schema alterations in `DO $$ ... $$` blocks.
- **RLS Required:** Every newly created table must execute `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` immediately upon creation.

### 5.2 Test Data Isolation Policy
- The migration file `20261015110000_seed_school_test_data.sql` is strictly for **local development and staging sandboxes**.
- **NEVER execute test seed migrations on production databases.**
- Production databases must start with an empty schema, allowing authorized school administrators to register real students and staff accounts through the official UI.

---

## 6. Troubleshooting Common Pitfalls

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| **RLS Permission Denied (403)** | Authenticated user has no profile in `public.users` or lacks the required role. | Log in with an IT account and verify/assign the user's role on the `/users` screen. |
| **PDF Download Times Out** | Storage bucket `midterm-reports` does not exist or lacks storage RLS permissions. | In Supabase Dashboard, verify the `midterm-reports` bucket is created with authenticated upload/read policies. |
| **SMS Deduplication Rejection** | An identical notification batch with the same fingerprint was previously queued. | Modify the campaign title or message text slightly to generate a fresh cryptographic fingerprint. |
| **CSV Import Rejects Valid Rows** | Phone numbers contain non-standard international prefixes with <8 digits. | Ensure phone numbers include at least 8 digits (e.g. `0788123456` or `+250788123456`). |
| **Vite Chunk Size Warning** | Bundler warning during production build (>500kB). | Expected due to `jspdf` and `jspdf-autotable`. The application utilizes dynamic `React.lazy()` imports for heavy modules like `MidTermEngine` to keep the initial bundle lightweight. |
