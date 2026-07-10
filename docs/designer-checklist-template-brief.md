# Designer Brief: Checklist and Template Experience

## Purpose and Boundaries

This document is a redesign brief for the checklist and template product experience only.

It is meant to help a designer start from fresh eyes without inheriting the current visual system. The goal is to preserve:

- the product model
- the information architecture
- the workflow logic
- the data nesting and constraints
- the important state changes and permissions

This document intentionally does not preserve or recommend the existing UI styling, page composition, spacing, card treatments, or navigation chrome.

## Frontend-Only Implementation Boundary

This brief is for the frontend experience only.

The designer and any frontend implementer using this brief should assume that:

- the backend already exists
- the API routes already exist
- auth, billing, template, run, import/export, and sharing services already exist
- the goal is to redesign and rebuild the UI layer, not to redesign backend architecture

### What should be designed and built

- page layouts
- component structure
- interaction models
- state presentation
- empty/loading/error states
- navigation between template and run experiences
- frontend composition of forms, lists, detail views, and execution views

### What should not be redesigned or rebuilt as part of this brief

- API route structure
- backend storage model
- auth/session implementation
- billing implementation
- server-side sharing implementation
- import/export backend processing
- database schema changes

### How to treat backend dependencies

- Treat backend functionality as an existing contract that the frontend plugs into.
- Design around domain objects and user actions, not around endpoint names.
- The frontend should be buildable against mocked or stubbed data using the schema/types in this brief.
- If a UI needs data or an action, the handoff should describe it in product terms such as:
  - "load template"
  - "save template"
  - "start run"
  - "copy template"
  - "share run"
  rather than requiring the designer to think about specific route handlers.

### Preferred implementation mindset

- Components should be designed as reusable frontend modules driven by typed data and state.
- Views should not be tightly coupled to specific API route details.
- The redesign should focus on what the user sees, edits, and understands, while assuming the current backend behavior remains in place.

### In scope

- public template discovery
- public template detail
- template saving and copying
- private template library management
- template detail inside the private workspace
- template building and editing
- checklist run creation
- private run execution
- shared run execution
- template import and export

### Out of scope

- marketing pages
- auth pages as standalone redesign targets
- general account, billing, and security pages
- any page not directly required to explain checklist and template flows

### Source of truth

This brief is based on the live canonical routed product surface and the checklist/template implementation in:

- `src/App.tsx`
- `src/lib/routes.ts`
- `src/pages/*`
- `src/components/template-*`, `src/components/checklist-*`, `src/components/templates/*`
- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`
- `docs/FEATURES.md`
- `docs/knowledge/ui-feature-audit-2026-04-09.md`

## User Goals and Core Stories

- As a user, I want to browse reusable public templates so I can start from an existing process instead of building from scratch.
- As a user, I want to evaluate a template before I commit to it so I can decide whether to run it immediately or save it into my workspace.
- As a user, I want to build a reusable template out of sections, tasks, and structured content so the process is repeatable.
- As a user, I want the editor to make the nested structure obvious so I do not lose track of where sections, tasks, and content blocks belong.
- As a user, I want to start a checklist run from a template so execution stays separate from the source template.
- As a user, I want a run view that clearly shows progress, current task context, and what is left to do.
- As a user, I want subtasks to behave predictably so I understand how they affect task completion.
- As a user, I want to share a run with someone else without exposing my private workspace.
- As a user, I want to copy a useful public template into my own workspace if my plan allows it.
- As a creator, I want to publish a template publicly so other people can discover, evaluate, and reuse it.
- As a creator, I want to manage my private template inventory, start runs from it, and update templates over time.
- As a creator, I want imported and exported template packs to preserve the structure of the workflow.

## Core Product Model

### Main entities

- A `template` is the reusable source definition.
- A template contains ordered `sections`.
- A section contains ordered `tasks` or `items`.
- A task can contain an ordered stack of `content blocks`.
- One content block type, `subItems`, contains nested checkbox-style sub-steps.
- A `run` is an execution copy of a template structure with completion state and progress.
- A `shared run` is a guest-accessible execution view for a run.
- A `public template` is a published template detail page that supports evaluation, copy/save, and run creation.
- A `creator profile` groups publicly visible templates under a username.

### Mental model

The product is not just “a checklist app.” It is a system with three connected layers:

1. `Authoring layer`
   Users create and maintain reusable templates.
2. `Execution layer`
   Users launch runs from templates and complete the work.
3. `Distribution layer`
   Users publish templates publicly or share individual runs.

### Primary workflow paths

1. `Public discovery -> public template detail -> save/copy to workspace`
2. `Public discovery -> public template detail -> start run`
3. `Private template library -> template detail -> edit template`
4. `Private template library -> template detail -> start run`
5. `Private run -> share run -> guest run execution`

### Key distinction: template vs run

- A `template` defines the reusable process.
- A `run` is a working instance of that process.
- Users should always be able to tell whether they are editing the source definition or completing a live execution copy.

This distinction is the single most important conceptual separation for the redesign.

## Schema and Type Reference

The designer should understand the actual nesting model because it directly affects the editing experience, page structure, and how detail views reveal information.

### Nesting model

```text
Template
  -> Sections[]
    -> Items[]
      -> Contents[]
        -> SubItems[] (only for one content type)
```

```text
Run
  -> Sections[]
    -> Items[]
      -> Contents[]
        -> SubItems[]
  + status
  + progress
  + completion timestamps
```

### ChecklistSubItem

```ts
type ChecklistSubItem = {
  id: string
  title: string
  isCompleted?: boolean
}
```

What it means:

- The smallest nested executable step.
- Exists only inside a `subItems` content block.
- Can be checked off during run execution.

Design implication:

- The UI must support nested completion inside a task without losing the parent task context.

### ChecklistItemContent

```ts
type ChecklistItemContent = {
  id: string
  type: "text" | "image" | "video" | "file" | "embed" | "subItems"
  value: string
  uploadType?: "url" | "upload"
  fileName?: string
  fileSize?: number
  subItems?: ChecklistSubItem[]
}
```

What it means:

- Each task can include multiple content blocks.
- Content blocks are ordered.
- The block type determines how the task detail should render.

Supported block types:

- `text`
  Markdown-like instructional content.
- `image`
  A linked or uploaded image reference.
- `video`
  A linked or uploaded video reference.
- `file`
  A downloadable attachment.
- `embed`
  A URL or embedded external resource reference.
- `subItems`
  A nested list of checkbox-style sub-steps.

Design implication:

- The editor must make content blocks feel composable and reorderable in concept, even if current implementation is basic.
- The run view must handle mixed content gracefully in a single task detail surface.

### ChecklistItem

```ts
type ChecklistItem = {
  id: string
  title: string
  description?: string
  contents?: ChecklistItemContent[]
  isCompleted?: boolean
}
```

What it means:

- A task belongs to one section.
- It has a title, optional short description, and optional content blocks.
- During run execution it also carries completion state.

Design implication:

- The product needs a clear distinction between a task’s summary label and its expanded detail/instructions.

### ChecklistSection

```ts
type ChecklistSection = {
  id: string
  title: string
  items: ChecklistItem[]
}
```

What it means:

- A section is a grouping layer for tasks.
- Sections are ordered and visible in both template detail and run views.

Design implication:

- The editor and execution UI both need a strong sense of section-based navigation and hierarchy.

### ChecklistTemplate

```ts
type ChecklistTemplate = {
  id: string
  title: string
  description?: string
  type?: "checklist" | "recipe"
  sections: ChecklistSection[]
  userId: string
  createdAt: string
  updatedAt: string
  isPublic: boolean
  slug?: string
  seoTitle?: string
  seoDescription?: string
  seoUrl?: string
  rules?: TemplateRule[]
  categories?: string[]
  tags?: string[]
  version?: number
  ownerProfile?: {
    full_name?: string
    username?: string
  }
}
```

What it means:

- This is the reusable authored asset.
- It contains both internal authoring fields and public/discovery metadata.

Fields that matter most to design:

- `title`, `description`
  Core identity and summary.
- `sections`
  The real process structure.
- `isPublic`
  Whether the template can appear publicly.
- `slug`, `seoTitle`, `seoDescription`
  Public presentation and routing metadata.
- `categories`, `tags`
  Organization and discovery metadata.
- `ownerProfile`
  Used for public profile and public template URLs.

Design implication:

- The product needs to separate “process content” from “public/discovery metadata.”
- The current editor already treats those as different modes, and the redesign should likely preserve that separation conceptually.

### TemplateSavePayload

```ts
type TemplateSavePayload = {
  id: string
  title: string
  description?: string
  type?: "checklist" | "recipe"
  sections: ChecklistSection[]
  isPublic: boolean
  seoTitle?: string
  seoDescription?: string
  seoUrl?: string
  rules?: TemplateRule[]
  categories?: string[]
  tags?: string[]
  slug?: string
}
```

What it means:

- This is the save/update shape for an existing template.
- From a design perspective, it confirms which parts of the template are editable.

### ChecklistRun

```ts
type ChecklistRun = {
  id: string
  templateId: string
  title: string
  status: "in_progress" | "completed"
  progress: number
  sections: ChecklistSection[]
  startedAt: string
  completedAt?: string
  userId: string
  templateVersion?: number
}
```

What it means:

- A run reuses the template’s nested structure.
- It adds execution state and progress.

Design implication:

- The run experience should feel like operating on a live instance of a template, not editing the template itself.

### TemplateEditorFormValues

This is the authoring form shape that matters most for the redesign.

```ts
type TemplateEditorFormValues = {
  title: string
  description: string
  templateType: "checklist" | "recipe"
  categories: string[]
  tags: string[]
  isPublic: boolean
  seoTitle: string
  seoDescription: string
  seoUrl: string
  sections: ChecklistSection[]
}
```

Design implication:

- The editor must support two different classes of information:
  process structure and public/discovery metadata.

### Portable template pack

Portable export/import currently uses a versioned envelope.

```ts
type PortableTemplatePack = {
  kind: "serplists-template-pack"
  schemaVersion: "2.0.0"
  exportedAt: string
  exportedBy?: string
  templates: PortableChecklistTemplate[]
  manifest?: {
    totalTemplates: number
    format?: "portable"
    includesVisibility?: boolean
    includesRules?: boolean
    assetWarnings?: number
  }
}
```

Portable template constraints that matter to design:

- imports/exports are Pro-only
- import preview exists before final import
- current import limit is `5 templates` per file
- current file-size limit is `2MB`
- asset references over `5MB` are blocked
- supported import file extensions are `.json`, `.md`, `.markdown`, `.yaml`, `.yml`

### Important behavioral defaults and constraints

- If a template is saved without a title, the system defaults it to `Untitled Template`.
- If a template is saved with no sections, the system creates a default section and default first task.
- If a section is saved with no tasks, the system creates a default task.
- If a task title is blank on save, the system auto-generates `Task N`.
- The editor UI itself keeps at least one section present.
- Portable schema expects at least one section and at least one item per section.
- `subItems` content must contain at least one sub-item.

Design implication:

- The redesign should make “empty but saveable” authoring states understandable.
- Users need to understand what the system will auto-fill for them versus what they are expected to define.

## Feature Inventory

### 1. Public template discovery

User value:

- Find reusable templates without entering the private workspace.
- Browse by search, category, creator, and official/community status.

Capabilities:

- search template titles and descriptions
- filter by one or more categories
- switch between grid and list result views
- open creator profile pages
- open public template detail pages
- identify official vs community templates

### 2. Public template evaluation

User value:

- Inspect a template before deciding to save it or run it.

Capabilities:

- see title, description, counts, creator, categories, and sections
- inspect section-by-section task structure
- reveal task details and attached content
- jump within the page by section

### 3. Save/copy public template into workspace

User value:

- Take a public template and make it part of a private workspace.

Capabilities:

- unauthenticated users are pushed to log in first
- logged-in users with insufficient plan are routed to upgrade
- eligible users can copy the template into private templates
- same copy/save contract applies on public template detail and non-owner console detail

### 4. Private template library management

User value:

- Manage personal template inventory in one place.

Capabilities:

- see all owned templates
- view template summary counts
- create template
- open template detail
- start run from template
- delete/archive template
- import/export template packs

### 5. Template detail inside private workspace

User value:

- Inspect a template before editing it or launching a run.

Capabilities:

- owner actions: edit, share, start run, archive
- non-owner actions: copy, start run, log in if needed
- view categories and rendered content
- share public canonical URL if template is public or made public

### 6. Template builder/editor

User value:

- Build the reusable process definition clearly and structurally.

Capabilities:

- switch between template metadata, search/public metadata, section editing, and task editing
- add and remove sections
- add and remove tasks
- inline rename sections and tasks from the outline
- edit task title and description
- add multiple content blocks to a task
- support text, image, video, file, embed, and subtask block types
- save changes or cancel back to the template list

### 7. Run creation

User value:

- Start execution from a reusable template.

Capabilities:

- start run from public template detail
- start run from private template detail
- start run from private template list
- start run from dashboard template section

Notable difference:

- public template detail starts a run immediately with a default generated name
- private template surfaces use a run-naming dialog first

### 8. Private run execution

User value:

- Complete work in a structured, trackable execution view.

Capabilities:

- view title, progress, and status
- select tasks from an outline
- read task instructions and supporting content
- check off tasks and subtasks
- rename the run title inline
- share the run
- complete the run

### 9. Shared run execution

User value:

- Complete a run from a public share link without entering a private workspace.

Capabilities:

- open guest-accessible run by token
- complete tasks and subtasks
- view progress and status

Restrictions:

- no run title editing
- no private share action
- no destructive owner controls

### 10. Template import/export portability

User value:

- move template packs between environments or bootstrap a workspace from a file.

Capabilities:

- export owned templates
- optionally include public/community templates in export
- import compatible JSON, Markdown, or YAML template files
- preview imports before confirming
- override imported visibility or preserve it
- download a sample portable pack

### 11. Gating and permissions that affect this ecosystem

Relevant behaviors:

- public template start-run requires login
- public template copy/save requires login and Pro
- import/export requires Pro
- shared run is public by token
- sharing a template publicly requires a canonical public URL, which depends on the owner having a username

### 12. Template update propagation

This is an important product rule:

- when a logged-in user updates a template’s sections/items, those changes propagate to existing runs for that user with the same `templateId`

Design implication:

- the product should make it clear that editing a template is not purely isolated authoring; it affects future and already-related run content structure

## Focused Route Map

| Route | Experience | Audience | Primary role |
| --- | --- | --- | --- |
| `/templates` | Public template library | Visitor or logged-in user | Discovery |
| `/categories` | Public category index | Visitor or logged-in user | Discovery |
| `/categories/:categorySlug` | Category-filtered library | Visitor or logged-in user | Discovery |
| `/profile/:username` | Public creator profile | Visitor or logged-in user | Discovery |
| `/profile/:username/:templateSlug` | Public template detail | Visitor or logged-in user | Evaluation, save/copy, start run |
| `/dashboard` | Private run overview | Logged-in user | Run management |
| `/dashboard/runs` | Same run overview, runs-focused nav context | Logged-in user | Run management |
| `/dashboard/runs/:id` | Private run execution | Logged-in user | Execution |
| `/dashboard/templates` | Private template library | Logged-in user | Template management |
| `/dashboard/templates/:id` | Private template detail | Logged-in user | Evaluation, share, edit, run launch |
| `/dashboard/templates/new` | Template builder | Logged-in user | Authoring |
| `/dashboard/templates/:id/edit` | Template builder for existing template | Logged-in user | Authoring |
| `/share/:shareToken` | Shared run execution | Guest or logged-in user | Shared execution |

### Legacy aliases

Legacy aliases still exist but are not primary design targets:

- `/checklists`
- `/console`
- `/console/templates/*`
- `/console/runs/*`

## Detailed Page Specs

## 1. `/dashboard/templates/new` and `/dashboard/templates/:id/edit`

### Purpose

Create or edit the reusable source template.

### Relevant user story

As a user, I want to build a reusable process out of sections, tasks, and structured content so I can run the process repeatedly later.

### Primary user

- template creator
- operator documenting an SOP
- user maintaining an internal process asset

### Key information shown

- template metadata
- public/search metadata
- section outline
- task outline
- current editing target
- validation/save errors

### Main sections and modules

- sticky top editor header
- left outline rail for sections and tasks
- mode entry points for:
  - template form
  - search preview
- main editing panel
- error state panel

### Editor modes

#### Template form mode

Fields:

- template name
- goal/summary
- categories
- tags
- type
- public/private switch

What this mode is for:

- define what the template is
- define how it should be organized internally and publicly

#### Search preview mode

Fields:

- search title
- URL slug
- search description

What this mode is for:

- define public/discovery metadata
- separate public presentation from the core process definition

#### Section mode

Fields:

- section title

What this mode is for:

- keep the table of contents legible
- manage section-level grouping

#### Task mode

Fields:

- task title
- optional task description
- content block stack

What this mode is for:

- define the actual step the operator needs to perform
- attach supporting information and nested sub-steps

### Content block authoring

Supported block types:

- text
- image
- video
- file
- embed
- sub-items

Design requirement:

- users need to understand that each task can contain multiple different block types in an ordered stack
- the UI should make it obvious what content belongs to the task summary versus the task body

### Primary actions

- save template
- cancel back to template list
- add section
- remove section
- select section
- add task
- remove task
- select task
- inline rename section
- inline rename task
- add content block
- remove content block
- edit content block details

### Important states

- new blank template
- loading existing template
- load error
- editing template metadata
- editing search/public metadata
- editing section
- editing task
- save in progress
- save failure
- field-level and form-level error states
- empty task/body state

### Rules and constraints

- the editor keeps at least one section present
- sections may temporarily have no tasks while editing, but save fills defaults
- blank template title saves as `Untitled Template`
- empty sections get a default task on save
- blank task titles get generated labels on save
- public state and public metadata belong to the same template, but are conceptually separate from process content

### Underlying data shape involved

- `TemplateEditorFormValues`
- `ChecklistSection[]`
- `ChecklistItem[]`
- `ChecklistItemContent[]`
- `ChecklistSubItem[]`

### Relationship to template/run workflow

- this page creates and maintains the source asset
- runs derive from this structure
- changes to template structure propagate to related runs for that user

## 2. `/dashboard/runs/:id`

### Purpose

Execute a live checklist run inside the private workspace.

### Relevant user story

As a user, I want to work through a run step by step, see what is complete, and maintain context for the current task.

### Primary user

- authenticated user executing a process
- owner of the run

### Key information shown

- run title
- run status
- completed vs total count
- percentage progress
- section/task outline
- selected task detail

### Main sections and modules

- run header
- back navigation
- title display and inline title editing
- status badge
- progress summary
- share action
- left outline rail of sections and tasks
- right detail panel for the selected task
- completion dialog

### Primary actions

- select task
- toggle task completion
- toggle sub-item completion
- rename run title
- create share link
- complete run
- navigate back to run overview

### Important states

- loading
- run not found
- in progress
- completed
- title editing mode
- share-link creation in progress
- no selected item yet
- completion dialog open

### Progress and completion rules

- progress includes both top-level tasks and sub-items
- checking a task checks all of its sub-items
- unchecking a task unchecks all of its sub-items
- when all sub-items are completed, the parent task becomes completed
- when a completed parent task has an incomplete sub-item, the parent becomes incomplete again
- the first incomplete task is auto-selected on load
- if everything is complete, the UI can fall back to the first task

### Rules and constraints

- this is execution, not authoring
- task content can include mixed content types
- share link is available only here on private runs

### Underlying data shape involved

- `ChecklistRun`
- run `sections`
- run `items`
- task `contents`
- nested `subItems`

### Relationship to template/run workflow

- this is the primary execution surface
- it is downstream of template creation and template selection
- it can create a shareable guest execution path

## 3. `/share/:shareToken`

### Purpose

Let a guest execute a specific run without entering the private workspace.

### Relevant user story

As a user, I want to share a live run with someone else so they can complete the work without needing my private account context.

### Primary user

- guest collaborator
- external operator
- anyone with the share token URL

### Key information shown

- run title
- status
- progress
- section/task outline
- selected task detail

### Main sections and modules

- run header
- progress summary
- left outline rail
- task detail panel
- completion dialog

### Primary actions

- select task
- toggle task completion
- toggle sub-item completion
- finish run

### Important states

- loading
- invalid or missing share token
- in progress
- completed
- completion dialog

### Shared-run restrictions

- title cannot be edited
- share action is hidden
- owner-only private actions are hidden
- the user still can update progress and completion state

### Underlying data shape involved

- same run structure as private run execution
- persistence happens through the share-token-based shared-checklist flow

### Relationship to template/run workflow

- this is not a template page
- it is a public execution branch of a private run
- it should feel intentionally limited compared with the authenticated run view

## 4. `/profile/:username/:templateSlug`

### Purpose

Public template detail page for evaluation, copy/save, and start-run entry.

### Relevant user story

As a user, I want to inspect a public template in detail so I can decide whether to save it to my workspace or start a run from it.

### Primary user

- visitor browsing the public library
- logged-in user evaluating a public template

### Key information shown

- creator identity
- template slug label
- title
- description
- section count
- task count
- created date
- type
- version
- categories
- rendered section/task structure
- in-page section links

### Main sections and modules

- top action row
- back link
- start-checklist CTA
- copy/save CTA
- metadata header
- mobile “more details” disclosure
- main template content area
- desktop sidebar with:
  - section navigation
  - template details
  - creator link
  - categories
- mobile sticky action bar

### Primary actions

- start checklist run
- save/copy template to workspace
- open creator profile
- open category pages
- jump to sections

### Important states

- loading
- not found
- authenticated
- unauthenticated
- billing/plan check in progress
- saving/copying in progress
- starting run in progress

### Rules and constraints

- start run requires authentication
- save/copy requires authentication and Pro
- billing-unavailable and entitlement failures must have explicit states
- section navigation matters because long templates need internal orientation

### Underlying data shape involved

- `ChecklistTemplate`
- `ownerProfile`
- `sections`
- `items`
- `contents`
- counts derived from the structure

### Relationship to template/run workflow

- this is the main bridge from discovery into adoption
- users can either save the template as a private asset or directly begin execution

## 5. `/dashboard/templates/:id`

### Purpose

Read-only template detail inside the private workspace.

### Relevant user story

As a creator, I want to inspect my template before editing, sharing, or launching a run from it.

### Primary user

- authenticated template owner
- occasionally a non-owner who reached the page through shared/internal navigation

### Key information shown

- title
- description
- created date
- categories
- rendered template content

### Main sections and modules

- back link to template list
- title and metadata header
- owner/non-owner action row
- category pills
- rendered template body
- run-name dialog
- archive confirmation dialog

### Primary actions

- owner:
  - edit
  - share public URL
  - start run
  - archive
- non-owner:
  - copy to my templates
  - start run
  - log in to copy

### Important states

- loading
- not found
- billing check in progress
- copying
- creating share link
- deleting
- run-name dialog open

### Rules and constraints

- share may make the template public first
- share requires a username to build the canonical public URL
- non-owner copy uses the same auth/Pro gating as public template detail

### Underlying data shape involved

- `ChecklistTemplate`
- `ownerProfile`
- `categories`
- `sections`

### Relationship to template/run workflow

- this is the private evaluation and launch surface
- it separates “view template” from “edit template,” which is important conceptually

## 6. `/dashboard/templates`

### Purpose

Manage the private template inventory and launch template-based workflows.

### Relevant user story

As a creator, I want one place to manage all my templates, start new runs, and import or export template packs.

### Primary user

- authenticated template owner

### Key information shown

- template inventory count
- total documented item count
- list of owned templates
- per-template sections/items/category counts
- import/export area

### Main sections and modules

- page intro/header
- metrics summary
- `My Templates` list
- empty state
- run-name dialog
- portable import/export module

### Primary actions

- create template
- browse public templates
- view template
- run template
- delete template
- export templates
- import template pack
- download sample template pack

### Important states

- loading templates
- empty template inventory
- dialog open for naming new run
- import preview
- import result summary
- Pro gating for import/export

### Rules and constraints

- template list is private inventory only
- import/export is Pro-only
- import supports preview before confirm
- exports can include public/community templates optionally

### Underlying data shape involved

- owned `ChecklistTemplate[]`
- portable template pack schema
- import summary:
  - total
  - imported
  - failures
  - successes

### Relationship to template/run workflow

- this is the management hub for authored assets
- it is the main launch point into template detail, editor, and named run creation

## 7. `/dashboard` and `/dashboard/runs`

### Purpose

Overview and management surface for active and completed runs, with supporting visibility into templates.

### Relevant user story

As a user, I want to see what runs are in progress, resume them quickly, and manage completed work without hunting through templates first.

### Primary user

- authenticated operator
- authenticated template owner executing workflows

### Key information shown

- active run count and average progress
- completed run list
- per-run title, source template, and progress
- preview of user templates

### Main sections and modules

- top summary area
- active runs list
- completed runs list
- inline title editing state
- delete-run dialog
- supporting template section

### Primary actions

- continue run
- view completed run
- rename run inline
- delete run
- create template
- open template detail

### Important states

- loading
- no active runs
- no completed runs
- inline title editing
- delete confirmation

### Rules and constraints

- `/dashboard/runs` is effectively the same screen, just entered from the runs navigation context
- template links inside this screen send users into template detail, not straight into editing

### Underlying data shape involved

- `ChecklistRun[]`
- template lookup by `templateId`

### Relationship to template/run workflow

- this is the management hub for execution rather than authoring
- it is downstream of template creation and run creation

## 8. `/templates`

### Purpose

Browse the public template library.

### Relevant user story

As a user, I want to scan reusable templates quickly so I can find one worth evaluating in detail.

### Primary user

- visitor
- logged-in user looking for a template to adopt

### Key information shown

- introductory context
- search input
- result count
- category filters
- grid/list mode
- template cards with summary metadata

### Main sections and modules

- page intro
- search/filter toolbar
- result collection
- empty state
- library summary footer

### Primary actions

- search templates
- filter by categories
- clear filters
- switch grid/list view
- open template detail
- open category page
- open creator profile from card

### Important states

- loading
- empty library
- empty search result
- category-filtered result set

### Rules and constraints

- cards expose sections/items counts and creator info
- category pills on cards navigate to category pages
- official templates are visually distinguishable from community templates

### Underlying data shape involved

- public `ChecklistTemplate[]`
- categories derived from template metadata
- owner profile metadata for creator links

### Relationship to template/run workflow

- this is the main discovery entry point into public template detail

## 9. `/categories`

### Purpose

Let users browse public templates by category rather than by search.

### Relevant user story

As a user, I want to browse broad buckets of workflow types so I can narrow the library quickly.

### Primary user

- visitor
- logged-in user discovering public templates

### Key information shown

- category list
- template counts per category
- category descriptions

### Main sections and modules

- category intro
- category card grid
- empty state

### Primary actions

- open a category-specific template listing

### Important states

- loading
- no categories found

### Rules and constraints

- category counts are derived from public templates
- categories only matter as an entry point into the template library

### Underlying data shape involved

- `categories` arrays from public templates

### Relationship to template/run workflow

- supporting discovery surface only

## 10. `/categories/:categorySlug`

### Purpose

Show the public template library filtered to a specific category.

### Relevant user story

As a user, I want a category-specific view of the library so I can stay focused on one kind of workflow.

### Primary user

- visitor
- logged-in user discovering templates

### Key information shown

- same as `/templates`, but scoped to one active category

### Main sections and modules

- category-specific intro
- back-to-all-templates affordance
- search/filter toolbar
- result collection
- empty state

### Primary actions

- search within the category view
- add/remove filters
- go back to full library
- open template detail

### Important states

- loading
- unknown category slug fallback
- category with zero matching templates

### Rules and constraints

- should feel like a filtered library, not a separate product area

### Underlying data shape involved

- same public template collection filtered by category slug mapping

### Relationship to template/run workflow

- supporting discovery surface only

## 11. `/profile/:username`

### Purpose

Show a creator’s public profile and public templates.

### Relevant user story

As a user, I want to inspect a creator’s published work so I can browse all of their public templates from one place.

### Primary user

- visitor
- logged-in user exploring public creators

### Key information shown

- creator name and username
- creator avatar
- joined date
- total public templates
- total items
- categories used
- list of public templates

### Main sections and modules

- back link
- profile summary/header
- template collection
- sidebar stats and metadata
- copy profile link action

### Primary actions

- open public template detail
- open category page
- copy profile link
- return to main library

### Important states

- loading
- profile not found
- empty public template inventory
- official profile fallback behavior for `serp`

### Rules and constraints

- some official templates are repo-backed and merged with user-backed public templates for the official profile

### Underlying data shape involved

- creator profile record
- merged `ChecklistTemplate[]`
- derived stats across public templates

### Relationship to template/run workflow

- supporting discovery surface only
- feeds users into public template detail

## Shared Rules and Workflow Connections

### Auth and return-path behavior

- protected template and run surfaces require authentication
- when a logged-out user hits a protected template/run action, the app preserves the requested destination and returns them there after login

### Copy/save entitlement behavior

- public template copy/save and non-owner console copy use the same contract
- unauthenticated user -> login
- logged-in free user -> upgrade flow
- logged-in Pro user -> copy/save allowed
- billing unavailable -> explicit failure state

### Start-run behavior

- public template detail can start a run directly after login
- private template surfaces open a run naming flow before creating the run
- all successful run creation ends in `/dashboard/runs/:id`

### Shared-run restrictions

- shared run is guest accessible by token
- shared run allows progress updates
- shared run hides title editing
- shared run hides private share action
- shared run hides owner-only destructive controls

### Template sharing behavior

- sharing a template from private template detail copies the canonical public URL
- if the template is private, the share action first makes it public
- canonical public sharing requires the owner to have a username

### Template update propagation

- editing a template’s sections/items updates related runs for that user
- the design should not imply that template editing is completely isolated from existing runs

### Progress logic

- run progress counts tasks and sub-items
- parent task and sub-item completion affect each other
- completion logic is central to the run experience and must be legible

### Discovery relationships

- categories derive from template metadata
- creator profile pages derive from public template ownership and username
- official templates can appear in discovery alongside user-created templates

### Public vs private distinction

- public template detail is for discovery and evaluation
- private template detail is for ownership, management, and launch
- private run is for authenticated execution
- shared run is for limited public execution
- template editor is for source authoring only

## Primary Redesign Priorities

### 1. Make the template builder intuitive around nesting

The editor needs to make this hierarchy effortless to understand:

- template
- section
- task
- content blocks
- sub-items

The current product is structurally powerful but conceptually dense. The redesign should reduce cognitive overhead without flattening the model.

### 2. Make run execution feel operationally clear

The run view is the most interaction-heavy page in the product. The redesign should make the following instantly understandable:

- where I am
- what I’m working on now
- what is complete
- how subtasks affect progress
- what remains

### 3. Clarify the difference between evaluating a template and editing a template

The product already separates:

- public detail
- private detail
- editor

The redesign should reinforce these distinctions so users never confuse:

- viewing the reusable source
- editing the reusable source
- executing a run instance

### 4. Improve the bridge from discovery into action

The supporting discovery surfaces should feed users naturally into:

- public template detail
- save/copy
- start run

without relying on the current card/list patterns.

### 5. Preserve the data model without exposing implementation complexity

The final design should make the system feel simple, even though the underlying structure is nested and stateful.

That means the redesign must support:

- nested authored content
- run execution state
- public/private distinctions
- plan gating
- import/export packaging

without forcing users to think in raw schema terms.
