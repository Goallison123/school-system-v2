# UI/UX Design Documentation
## G.S Gacuba 2A Integrated School Administration Portal

- **Design Classification:** Administrative & Academic Web Interface
- **Methodology Notice:** Physical Paper Wireframes & Whiteboard Brainstorming System
- **Figma Status:** **No Figma Prototype Available**. In accordance with the school's rapid prototyping and engineering process, all early interface concepts, layout grids, and interactive flows were conceptualized on physical paper wireframes and whiteboard brainstorming sessions, then implemented directly into responsive production code using Tailwind CSS.

---

## 1. Design Philosophy & Foundations

### 1.1 Context & Constraints
Groupe Scolaire Gacuba 2A operates in an active academic environment where administrators, deans, and teachers interact with the software using diverse devices: desktop workstations in administrative offices, laptops in staff rooms, and smartphones/tablets in classrooms.

Key design imperatives:
1. **High Information Density with Zero Clutter:** Administrative staff manage hundreds of pupils per stream. Layouts prioritize clean tabular data, clear typography, and compact actions over decorative filler.
2. **Strict Visual Hierarchy:** Primary actions (e.g., *Add Student*, *Compile Reports*, *Send Notification*) stand out with bold espresso styling and warm gold iconography, while secondary filters remain unobtrusive.
3. **Role-Tailored Workspaces:** When a teacher logs in, they are not confronted with complex administrative menus or parent contact data. They enter a focused, distraction-free mark input environment.
4. **Physical Brainstorming Lineage:** The interface mimics the physical mark sheets, report card booklets, and paper ledgers historically used by Rwandan educators, ensuring intuitive adoption without extensive training.
5. **Clear, Human UI Copy:** Write for school staff using the page, not developers. Use short, action-first labels and conversational help text; avoid backend terms, invented status messages, and instructions that do not match the screen.
6. **Role-Specific Home Pages:** Each staff role starts with its own overview and only sees links and recovery options for pages available to that role. Use tables for home-page totals instead of metric cards.

---

## 2. Design System Tokens & Color Palette

The interface is built with a bespoke color palette reflecting academic dignity and warmth:

```
+-------------------------------------------------------------------------------+
|                              CORE PALETTE TOKENS                              |
+-------------------+-------------------+-------------------+-------------------+
|  Espresso Dark    |   Deep Mocha      |    Warm Gold      |    Soft Bone      |
|     #3A2818       |     #281B10       |     #C59B27       |     #FBF9F5       |
| Primary Brand /   | Hover / Active    | Badges / Icons /  | Application Body  |
| Sidebar / Headers | Dark Accents      | Highlights        | Background        |
+-------------------+-------------------+-------------------+-------------------+
|  Sandstone Border |   Emerald Paid    |    Amber Partial  |    Rose Unpaid    |
|     #EAE5DC       |  #059669 / #ECFDF5|  #D97706 / #FFFBEB|  #E11D48 / #FFF1F2|
| Card Borders /    | Full Fee Settled  | Partial Payment   | Outstanding Fees  |
| Table Dividers    | / Grade A-B Dot   | / Grade C-D Dot   | / Grade E Dot     |
+-------------------+-------------------+-------------------+-------------------+
```

### 2.1 Typography
- **Primary Interface Font:** `Inter`, `DM Sans`, system sans-serif (clean readability for numeric data, student codes, and tables).
- **Headings & Accents:** Classical Serif (`Georgia`, `Times New Roman`) for formal institutional headings and diplomas, paired with bold geometric sans-serif for dashboard figures.

---

## 3. High-Fidelity ASCII Wireframes

Below are the structural wireframes developed from our physical brainstorming sessions and paper wireframe sheets.

### Screen 1: Login & Staff Authentication
```text
+---------------------------------------------------------------------------------+
|                                                                                 |
|                       [ School Community Photograph ]                           |
|                                G.S Gacuba 2A                                    |
|                           School staff sign in                                 |
|                                                                                 |
|                   +---------------------------------------+                     |
|                   |  Sign in                              |                     |
|                   |                                       |                     |
|                   |  School email                         |                     |
|                   |  [ name@school.rw                   ] |                     |
|                   |                                       |                     |
|                   |  Password                             |                     |
|                   |  [ *******************              ] |                     |
|                   |                                       |                     |
|                   |  [ Sign in                           ] |                     |
|                   +---------------------------------------+                     |
|                                                                                 |
|                     (c) G.S Gacuba 2A - Rubavu District, Rwanda                 |
+---------------------------------------------------------------------------------+
```

---

### Screen 2: Headmaster Executive Overview Dashboard
```text
+------------------+--------------------------------------------------------------+
| G.S Gacuba 2A    | G.S Gacuba 2A  →  Overview                     [Bell] [B]   |
| ADMIN PORTAL     +--------------------------------------------------------------+
+------------------+                                                              |
| WORKSPACE        |  Welcome back, Headmaster Hirwa                              |
| [x] Overview     |  Executive summary of institutional performance              |
| [ ] Students     |                                                              |
| [ ] Mid-Term     |  SCHOOL AT A GLANCE                                         |
| [ ] Parent notices|  +--------------------------------------------------------+ |
|                  |  | What you can check            | Total | Next step    | |
|                  |  |-------------------------------|-------|--------------| |
|                  |  | Students in the school register|  ...  | View records | |
|                  |  | Parent notices sent           |  ...  | View notices | |
|                  |  | Notices being prepared        |  ...  | View notices | |
|                  |  +--------------------------------------------------------+ |
|                  |  QUICK LINKS                                                |
|                  |  Review mid-term reports    →    Send a parent notice        |
+------------------+--------------------------------------------------------------+
```

---

### Screen 3: Mid-Term Examination Engine (Assessment Matrix & Report Compilation)
```text
+------------------+--------------------------------------------------------------+
| G.S Gacuba 2A    | G.S Gacuba 2A  >  Mid-Term Engine               [Bell] [B]   |
+------------------+--------------------------------------------------------------+
| [ ] Overview     |  MID-TERM ASSESSMENT ENGINE                                  |
| [ ] Students     |  Academic grading, subject configuration, and report cards   |
| [x] Mid-Term     |                                                              |
| [ ] Users & Roles|  +---------------------------------------------------------+ |
| [ ] Notifications|  | Select Class: [ P2 A                v ]                     | |
| [ ] Contacts     |  | Period:       [ 2026 Mid-Term       v ]                     | |
| [ ] Website CMS  |  | Official Exam Date: [ 2026-11-16 ] [ Save Date ]        | |
| [ ] Inquiries    |  +---------------------------------------------------------+ |
|                  |                                                              |
|                  |  [ + Subject Configuration ] [ Batch Compile Reports ]       |
|                  |                                                              |
|                  |  STUDENT ASSESSMENT MATRIX (Class: P2 A)                     |
|                  |  +---------------------------------------------------------+ |
|                  |  | Pupil Name      | Math  | Eng   | Kiny  | Avg   | Status| |
|                  |  |-----------------+-------+-------+-------+-------+-------| |
|                  |  | Ineza Divine    | 85    | 78    | 90    | 84.3% | Ready | |
|                  |  | Habimana Eric   | 45    | 52    | 60    | 52.3% | Ready | |
|                  |  | Mutoni Sandra   | 92    | 88    | --    | --    | Pend. | |
|                  |  +---------------------------------------------------------+ |
|                  |                                                              |
|                  |  COMPILED REPORT CARDS                                       |
|                  |  [ Search learner... ] [ Filter: All v ]                     |
|                  |  - Ineza Divine (P2 A) - Avg: 84.3% (Grade A)                |
|                  |    [ View Report Details ] [ Download PDF ] [ Queue SMS ]    |
+------------------+--------------------------------------------------------------+
```

---

### Screen 4: Students Registry & Slide-Over Drawer
```text
+------------------+--------------------------------------------------------------+
| G.S Gacuba 2A    | G.S Gacuba 2A  >  Students Registry             [Bell] [B]   |
+------------------+--------------------------------------------------------------+
| [ ] Overview     |  DIRECTORY                                                   |
| [x] Students     |  Students Registry                      [ + Add New Student] |
| [ ] Mid-Term     |  Manage student profiles, parent details, fees and standing. |
| [ ] Users & Roles|                                                              |
| [ ] Notifications|  +---------------------------------------------------------+ |
| [ ] Contacts     |  | [Q Search by pupil, parent, phone...]                   | |
| [ ] Website CMS  |  | Filter Class: [ All Classes v ]  Fee: [ All Status v ]  | |
| [ ] Inquiries    |  +---------------------------------------------------------+ |
|                  |                                                              |
|                  |  +---------------------------------------------------------+ |
|                  |  | Full Name    | Parent Name  | Phone / Email  | Class|Fee| |
|                  |  |--------------+--------------+----------------+-----+---| |
|                  |  | (I) Ineza D. | Jean Claude  | +250 788 123.. | P2 A|(P)| |
|                  |  | (N) Patrick N| Marie Claire | +250 790 987.. | P4 A|(!)| |
|                  |  | (E) Eric H.  | Claudine N.  | +250 781 223.. | P5 A|(X)| |
|                  |  +---------------------------------------------------------+ |
|                  |                                                              |
|                  |  Showing 6 students - Click row to open details drawer       |
+------------------+--------------------------------------------------------------+
| SLIDE-OVER DRAWER (When row clicked):                                           |
| +-----------------------------------------------------------------------------+ |
| | [D] Ineza Divine - P2 A Registered Pupil                                [X] | |
| |-----------------------------------------------------------------------------| |
| | Full Name:      [ Ineza Divine                                            ] | |
| | Parent Name:    [ Jean Claude Uwase                                       ] | |
| | Email Address:  [ divine.ineza@gmail.com   ] Phone: [ +250 788 123 456    ] | |
| | Class:          [ P2 A                   v ] Status:[ Paid              v ] | |
| | Fees Paid:      [ 145,000 RWF                                             ] | |
| |                                                                             | |
| | Registry ID: STU-101   |   Last Updated: Today                              | |
| |                                                                             | |
| | [ Trash: Delete Student ]           [ Cancel ]  [ Save Student Changes ]    | |
| +-----------------------------------------------------------------------------+ |
```

---

### Screen 5: Multi-Channel Parent Notification Composer
```text
+---------------------------------------------------------------------------------+
|                       COMPOSE PARENT NOTIFICATION CAMPAIGN                  [X] |
+---------------------------------------------------------------------------------+
|  Campaign Title:                                                                |
|  [ Term 2 Tuition Fees & PTA Meeting Reminder                                 ] |
|                                                                                 |
|  Select Channels:  [*] SMS     [*] WhatsApp     [ ] Email                       |
|                                                                                 |
|  Category: [ Tuition Fee Reminder v ]                                           |
|                                                                                 |
|  Message Template (Use {FULLNAME} and {FEES} for dynamic merge):                |
|  +---------------------------------------------------------------------------+  |
|  | Dear Parent, this is a reminder from G.S Gacuba 2A. Remaining school fees |  |
|  | for {FULLNAME} is {FEES}. Please settle payments before 20 May.          |  |
|  +---------------------------------------------------------------------------+  |
|                                                                                 |
|  RECIPIENT PREVIEW & DEDUPLICATION LEDGER                                       |
|  +---------------------------------------------------------------------------+  |
|  | Pupil Name      | Parent Name       | Phone Number   | Status             |  |
|  |-----------------+-------------------+----------------+--------------------|  |
|  | Ineza Divine    | Jean Claude Uwase | +250788123456  | [v] Valid Mobile   |  |
|  | Patrick N.      | Marie Claire M.   | +250790987654  | [v] Valid Mobile   |  |
|  | Habimana Eric   | Claudine N.       | Missing        | [!] Skipped (No No)|  |
|  +---------------------------------------------------------------------------+  |
|  Total Targets: 140 parents | 139 valid | 1 skipped                             |
|                                                                                 |
|  Dispatch Fingerprint: FEES|Dear Parent...|UUID-1,UUID-2...                     |
|                                                                                 |
|  [ Save as Draft ]                                  [ Queue Campaign Broadcast ]|
+---------------------------------------------------------------------------------+
```

---

## 4. Key User Flow Diagrams

### Flow 1: Assessment Mark Input to Automated PDF Report Card
```text
  [Teacher logs in]
          |
          v
  Selects Assigned Class (e.g. "P2 A")
          |
          v
  Inputs Marks (0-100) for Subject
          |
          v
  Database Trigger Checks:
  Are all enabled class subjects marked for student?
          |
     +----+----+
     |         |
     v         v
   (No)      (Yes)
   Saves     Automatic Report Card Compilation
   Mark      - Calculates average
             - Excludes 0-mark subjects
             - Assigns REB grades (A-E)
             - Snapshots parent contact
             - Sets status: 'pending'
                     |
                     v
             [Dean of Studies Reviews Report]
                     |
                     v
             Approves & Clicks "Download PDF"
                     |
          +----------+----------+
          |                     |
     (Cache < 7d)         (Cache > 7d / None)
     Direct Storage       Client jsPDF compiles,
     Signed URL           uploads to bucket,
     download             and serves fresh PDF
```

---

### Flow 2: Student CSV Import & Delimiter-Sniffing Wizard
```text
  [Administrator selects CSV file]
                 |
                 v
  Engine analyzes first line & counts delimiters
                 |
  Detects delimiter: comma (,), semicolon (;), or tab (\t)
                 |
  Normalizes headers & matches alias synonyms
  (e.g., "Learner" -> "fullName", "Telephone" -> "phone")
                 |
  Validates each row:
  - Checks required names
  - Normalizes email format
  - Verifies phone >= 8 digits
  - Normalizes fee status ("Paid", "Partial", "Unpaid")
                 |
  Presents Interactive Staging Preview Grid:
  +--------------------------------------------------+
  | Row 1: Valid pupil -> [Ready to import]          |
  | Row 2: Incomplete phone -> [Error: Min 8 digits] |
  | Row 3: Existing pupil -> [Duplicate flagged]     |
  +--------------------------------------------------+
                 |
  User resolves or skips invalid rows
                 |
  Submits valid batch to 'public.school_students'
```
