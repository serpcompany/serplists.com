# File Inventory

## Project Structure Overview (Updated January 2025)

```
serp-checklists/
├── src/                    # Application source code (153 TypeScript files)
│   ├── api/               # Legacy API routes (replaced by functions/)
│   ├── components/        # React components (94 files)
│   ├── contexts/          # React contexts (2 files)
│   ├── hooks/            # Custom React hooks (12 files)
│   ├── lib/              # Utility libraries and schemas
│   ├── pages/            # Page components (15 files)
│   ├── types/            # TypeScript type definitions (2 files)
│   └── utils/            # Helper utilities (4 files)
├── functions/             # Cloudflare Workers functions (Active API)
├── d1/                   # Database schema (1 file)
├── migrations/           # Database migrations (5 files)
├── tests/               # Test files (10 test files)
├── public/             # Static assets
└── docs/               # Documentation
```

## Core Application Files

### Entry Points
- `src/main.tsx` - Application entry point, sets up providers and routing
- `src/App.tsx` - Main app component with routing configuration
- `index.html` - HTML template with Vite integration
- `functions/api/[[route]].ts` - Cloudflare Workers API entry point

### Configuration Files
- `package.json` - Dependencies and scripts (uses pnpm as package manager)
- `vite.config.ts` - Vite bundler configuration
- `vitest.config.ts` - Vitest testing configuration
- `tsconfig.json` - TypeScript project references configuration
- `tsconfig.app.json` - Application TypeScript configuration
- `tsconfig.node.json` - Node.js TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `wrangler.toml` - Cloudflare Workers configuration
- `eslint.config.js` - ESLint flat configuration
- `postcss.config.js` - PostCSS configuration
- `components.json` - shadcn/ui components configuration

## Source Code Organization

### `/src/api/` - Legacy API Layer (Replaced by functions/)
**Status**: Legacy, being replaced by `/functions/api/`
- `routes/`
  - `auth.ts` - Authentication endpoints
  - `checklists.ts` - Checklist CRUD operations
  - `templates.ts` - Template management
  - `users.ts` - User profile operations
- `utils/`
  - `crypto.ts` - Cryptographic utilities
  - `id.ts` - ID generation utilities
- `worker.ts` - Cloudflare Worker setup

### `/src/components/` - React Components (94 Files Total)

#### Authentication Components (`/auth/` - 1 file)
- `OAuthButtons.tsx` - OAuth provider buttons

#### Account Management (`/account/` - 3 files)
- `BillingSection.tsx` - Billing management interface
- `DeveloperSection.tsx` - Developer settings
- `ProfileSection.tsx` - User profile management

#### Affiliate System (`/affiliate/` - 1 file)
- `AffiliateStats.tsx` - Affiliate tracking dashboard

#### Checklist Components (`/checklist/` - 3 files)
- `ChecklistContent.tsx` - Main checklist content display
- `ChecklistItemCard.tsx` - Individual checklist item
- `ChecklistSidebar.tsx` - Checklist navigation sidebar

#### Checklist Library Components (`/checklist-library/` - 3 files)
- `CategoryNavigation.tsx` - Category browsing interface
- `SearchAndFilters.tsx` - Search and filtering controls
- `TemplateCard.tsx` - Template preview cards

#### Template Editor Components (`/template-editor/` - 8 files)
- `TemplateBasicInfo.tsx` - Basic template information form
- `TemplateHeader.tsx` - Template editor header
- `ContentEditor.tsx` - Content editing interface
- `ContentAddPanel.tsx` - Add content panel
- `ItemEditor.tsx` - Item editing component
- `SectionEditor.tsx` - Section management
- `SectionSidebar.tsx` - Section navigation
- `SEOMetaEditor.tsx` - SEO metadata editor

#### Content Type Editors (`/template-editor/content-types/` - 5 files)
- `TextContentEditor.tsx` - Text content editor with markdown
- `MediaContentEditor.tsx` - Media upload/embed
- `EmbedContentEditor.tsx` - Embed content editor
- `SubItemsEditor.tsx` - Sub-items checklist editor
- `PageContentEditor.tsx` - Page content editor

#### Template Display (`/template/` - 2 files)
- `PublicTemplateContent.tsx` - Public template viewer
- `TemplateActions.tsx` - Template action buttons

#### GitHub Integration (`/github/` - 1 file)
- `GitHubIntegration.tsx` - GitHub OAuth and integration

#### Markdown Editor (`/markdown-editor/` - 1 file)
- `MarkdownEditor.tsx` - Rich text markdown editor

#### Shared Components (`/shared/` - 8 files)
- `LoadingSpinner.tsx` - Loading indicator
- `LoadingSkeleton.tsx` - Skeleton loading states
- `EmptyState.tsx` - Empty state display
- `ContentRenderer.tsx` - Renders different content types ⚠️ (XSS vulnerability)
- `VideoEmbed.tsx` - Video embedding component
- `SEOHead.tsx` - SEO meta tags component
- `UserInfo.tsx` - User information display
- `AvatarUpload.tsx` - Avatar upload component

#### UI Components (`/ui/` - 58 files)
Comprehensive shadcn/ui component library including:
- `accordion.tsx`, `alert-dialog.tsx`, `alert.tsx`
- `aspect-ratio.tsx`, `avatar.tsx`, `badge.tsx`
- `breadcrumb.tsx`, `button.tsx`, `calendar.tsx`
- `card.tsx`, `carousel.tsx`, `chart.tsx` ⚠️ (XSS vulnerability)
- `checkbox.tsx`, `collapsible.tsx`, `command.tsx`
- `context-menu.tsx`, `dialog.tsx`, `drawer.tsx`
- `dropdown-menu.tsx`, `form.tsx`, `hover-card.tsx`
- `input.tsx`, `label.tsx`, `menubar.tsx`
- `navigation-menu.tsx`, `pagination.tsx`, `popover.tsx`
- `progress.tsx`, `radio-group.tsx`, `resizable.tsx`
- `scroll-area.tsx`, `select.tsx`, `separator.tsx`
- `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`
- `slider.tsx`, `switch.tsx`, `table.tsx`
- `tabs.tsx`, `textarea.tsx`, `toast.tsx`
- `toaster.tsx`, `toggle.tsx`, `tooltip.tsx`
- Custom components: `embed-field.tsx`, `file-upload.tsx`, `input-otp.tsx`, `multi-select.tsx`, `page-selector.tsx`, `run-name-dialog.tsx`
- Variant files: `button-variants.ts`, `toggle-variants.ts`
- Hook: `use-toast.ts`

#### Root Level Components (6 files)
- `Layout.tsx` - Main layout wrapper
- `RequireAuth.tsx` - Authentication guard
- `ErrorBoundary.tsx` - Error boundary component
- `DevLoginBar.tsx` - Development login helper
- `TemplateBackup.tsx` - Template backup/restore functionality

### `/src/contexts/` - State Management (2 Files)
- `CloudflareAuthContext.tsx` - Authentication state and methods ⚠️ (localStorage token vulnerability)
- `TemplatesContext.tsx` - Template and checklist state management ⚠️ (data structure bug)

### `/src/hooks/` - Custom Hooks (12 Files)
- `useTemplateEditorState.ts` - Template editor form state
- `useTemplateEditor.ts` - Template editing logic
- `useTemplateSave.ts` - Template save operations
- `useTemplateValidation.ts` - Template validation
- `useTemplateActions.ts` - Template CRUD actions
- `useTemplateLibrary.ts` - Template library operations
- `useChecklistState.ts` - Checklist run state
- `useAffiliateTracking.ts` - Affiliate tracking
- `useDevMode.ts` - Development mode utilities
- `usePages.ts` - Page management
- `use-mobile.tsx` - Mobile detection
- `use-toast.ts` - Toast notifications (duplicate of ui/use-toast.ts)

### `/src/lib/` - Libraries and Utilities
#### Core Files
- `api.ts` - API client singleton ⚠️ (localStorage token storage)
- `utils.ts` - General utilities (cn function for class names)
- `analytics.ts` - Analytics integration
- `imageOptimization.ts` - Image optimization utilities
- `stripe-setup.ts` - Stripe configuration
- `validation.ts` - Validation utilities

#### API Client (`/lib/api/`)
- `client.ts` - API client class implementation

#### Schemas (`/lib/schemas/`)
- `checklistSchema.ts` - Comprehensive Zod schemas for validation

#### Utilities (`/lib/utils/`)
- `fileUpload.ts` - File upload utilities
- `pageBackup.ts` - Page backup/restore functionality
- `templateBackup.ts` - Template backup/restore functionality

### `/src/pages/` - Page Components (15 Files)
- `Index.tsx` - Homepage
- `Login.tsx` - Login page
- `Register.tsx` - Registration page
- `Dashboard.tsx` - User dashboard
- `Templates.tsx` - Templates management page
- `TemplateEditor.tsx` - Template editor page ⚠️ (Large component - 500+ lines)
- `ChecklistLibrary.tsx` - Public checklist library
- `ChecklistRun.tsx` - Checklist execution page ⚠️ (XSS vulnerability, large component)
- `PublicTemplate.tsx` - Public template view
- `PublicPost.tsx` - Public post view
- `Categories.tsx` - Category browsing
- `UserProfile.tsx` - User profile page
- `Account.tsx` - Account settings
- `Pages.tsx` - Pages management
- `NotFound.tsx` - 404 page

### `/src/types/` - TypeScript Definitions (2 Files)
- `checklist.ts` - Checklist-related types and interfaces
- `page.ts` - Page-related types

### `/src/utils/` - Utility Functions (4 Files)
- `categories.ts` - Category management utilities
- `seoTemplates.ts` - SEO template generation
- `templateHelpers.ts` - Template helper functions
- `urlHelpers.ts` - URL manipulation utilities

## Database and Migrations

### `/d1/` (1 File)
- `schema.sql` - Main database schema with comprehensive table structure

### `/migrations/` (5 Files)
- `0001_initial_schema.sql` - Initial database setup
- `0002_add_slug_to_templates.sql` - Add slug field to templates
- `0002_add_username_and_profiles.sql` - User profiles enhancement
- `add-slugs-to-templates.sql` - Slug migration utility
- `seed-test-data.sql` - Test data seeding

## Cloudflare Workers (Active API)

### `/functions/api/` (4 Files)
- `[[route]].ts` - Catch-all API route handler (main entry point)
- `types.ts` - API type definitions

#### API Handlers (`/functions/api/handlers/` - 3 Files)
- `auth.ts` - Authentication endpoints
- `checklists.ts` - Checklist CRUD operations
- `templates.ts` - Template management endpoints

#### API Utilities (`/functions/api/utils/` - 2 Files)
- `jwt.ts` - JWT token utilities
- `slug.ts` - Slug generation utilities

## Test Files

### `/tests/` (10 Test Files Total)
- `setup.ts` - Test setup configuration

#### Integration Tests (`/tests/integration/` - 1 File)
- `api.test.ts` - API integration tests

#### Unit Tests (`/tests/unit/` - 9 Files)

**API Route Tests (`/tests/unit/api/routes/` - 1 File)**
- `auth.test.ts` - Authentication API tests

**Context Tests (`/tests/unit/contexts/` - 1 File)**
- `TemplatesContext.test.ts` - Templates context tests

**Functions Tests (`/tests/unit/functions/api/` - 2 Files)**
- `auth.test.ts` - Functions auth tests
- `templates.test.ts` - Functions template tests

**Library Tests (`/tests/unit/lib/` - 2 Files)**
- `schemas/checklistSchema.test.ts` - Schema validation tests
- `utils/templateBackup.test.ts` - Template backup tests

**Page Tests (`/tests/unit/pages/` - 2 Files)**
- `ChecklistLibrary.test.tsx` - Checklist library page tests
- `PublicTemplate.test.tsx` - Public template page tests

**Utility Tests (`/tests/unit/utils/` - 1 File)**
- `urlHelpers.test.ts` - URL helper utility tests

## Documentation

### `/docs/` (Current Documentation Structure)
- `index.md` - Main documentation index
- `code-standards.md` - Code standards and conventions ✅ (Updated)
- `enhancements.md` - Bugs and improvement opportunities ✅ (Updated)
- `file-inventory.md` - This file ⚠️ (Currently updating)
- `quick-reference.md` - Developer quick reference
- `schema/README.md` - Schema documentation

#### Module Documentation (`/docs/modules/` - 3 Files)
- `data-persistence.md` - Data persistence patterns
- `frontend-admin.md` - Frontend administration
- `logging-system.md` - Logging system documentation

#### Pattern Documentation (`/docs/patterns/` - 4 Files)
- `component-pattern.md` - Component patterns
- `data-service-pattern.md` - Data service patterns
- `message-handler-pattern.md` - Message handling patterns
- `tab-creation-pattern.md` - Tab creation patterns

#### Recipe Documentation (`/docs/recipes/` - 4 Files)
- `add-data-type.md` - Adding new data types
- `add-dropdown.md` - Adding dropdown components
- `add-message-handler.md` - Adding message handlers
- `add-new-tab.md` - Adding new tabs

### Schema Documentation (`/docs/schema/` - 4 Files)
- `README.md` - Schema format documentation
- `camping-checklist.json` - Example camping template
- `comprehensive-template-demo.json` - Comprehensive demo template
- `wedding-checklist.json` - Example wedding template

## Build and Config Files

### Root Configuration (13 Files)
- `vite.config.ts` - Vite bundler configuration
- `vitest.config.ts` - Vitest testing configuration  
- `postcss.config.js` - PostCSS configuration
- `components.json` - shadcn/ui components configuration
- `wrangler.toml` - Cloudflare Workers configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `eslint.config.js` - ESLint flat configuration

### TypeScript Configurations (3 Files)
- `tsconfig.json` - Project references configuration
- `tsconfig.app.json` - Application TypeScript configuration
- `tsconfig.node.json` - Node.js TypeScript configuration

### Package Management
- `package.json` - Project dependencies and scripts
- `pnpm-lock.yaml` - pnpm lockfile (using pnpm as package manager)

### Other Config Files
- `.gitignore` - Git ignore patterns
- `README.md` - Project README

## Scripts and Automation
- `setup-cloudflare.sh` - Cloudflare setup script

## Static Assets (`/public/` - 3 Files)
- `favicon.ico` - Website favicon
- `placeholder.svg` - Placeholder image
- `robots.txt` - Search engine robots file

## Key File Relationships

### Authentication Flow
1. `src/contexts/CloudflareAuthContext.tsx` - Auth state management
2. `functions/api/handlers/auth.ts` - Auth API endpoints
3. `src/pages/Login.tsx` - Login user interface
4. `src/components/RequireAuth.tsx` - Route protection

### Template Management Flow
1. `src/contexts/TemplatesContext.tsx` - Template state management
2. `functions/api/handlers/templates.ts` - Template API endpoints
3. `src/pages/TemplateEditor.tsx` - Editor page interface
4. `src/hooks/useTemplateEditor.ts` - Editor business logic
5. `src/components/template-editor/*` - Editor UI components

### Checklist Execution Flow
1. `src/pages/ChecklistRun.tsx` - Checklist execution page
2. `src/hooks/useChecklistState.ts` - Run state management
3. `src/components/checklist/*` - Checklist UI components
4. `functions/api/handlers/checklists.ts` - Checklist API endpoints

### Data Flow Architecture
1. Database (Cloudflare D1) → 
2. API Handlers (`/functions/api/handlers/*`) → 
3. API Client (`/src/lib/api.ts`) → 
4. React Contexts → 
5. Custom Hooks → 
6. Components → 
7. User Interface

## File Statistics (Actual Counts)

### Source Code
- **Total TypeScript Files**: 153 files
- **React Components**: 94 files
- **Custom Hooks**: 12 files
- **Page Components**: 15 files
- **Context Providers**: 2 files
- **Type Definition Files**: 2 files
- **Utility Files**: Various across lib/, utils/, and api/

### API & Functions
- **API Handler Files**: 3 files (auth, checklists, templates)
- **API Utility Files**: 2 files (jwt, slug)
- **Legacy API Routes**: 4 files (being replaced)

### Testing
- **Total Test Files**: 10 files
- **Test Coverage**: API routes, contexts, utilities, pages, schemas

### Configuration & Build
- **Config Files**: 13+ configuration files
- **TypeScript Configs**: 3 files
- **Migration Files**: 5 files

### Documentation
- **Documentation Files**: 15+ files across multiple categories
- **Example Templates**: 3 JSON files
- **Schema Documentation**: Comprehensive format guide

## Important Entry Points for Development

### Development Commands
1. **Frontend Development**: `pnpm run dev` (Vite dev server)
2. **API Development**: `pnpm run dev:api` (Cloudflare Workers)
3. **Full Development**: `pnpm run dev:all` (Both frontend and API)
4. **Testing**: `pnpm run test` (Vitest)
5. **Type Checking**: `pnpm run typecheck`
6. **Linting**: `pnpm run lint`

### Key Entry Points
1. **Application Entry**: `src/main.tsx`
2. **Routing Configuration**: `src/App.tsx`
3. **API Entry**: `functions/api/[[route]].ts`
4. **Database Schema**: `d1/schema.sql`
5. **Type Definitions**: `src/types/checklist.ts`
6. **API Client**: `src/lib/api.ts`

### Database Operations
- **Seed Data**: `pnpm run db:seed`
- **Reset Database**: `pnpm run db:reset`
- **Query Database**: `pnpm run db:query "SQL_COMMAND"`

## Critical Issues Identified in File Analysis

### Security Vulnerabilities
1. **XSS Risk**: `src/components/shared/ContentRenderer.tsx` - Unsanitized HTML rendering
2. **XSS Risk**: `src/pages/ChecklistRun.tsx` - Unsanitized HTML rendering  
3. **XSS Risk**: `src/components/ui/chart.tsx` - Unsanitized HTML rendering
4. **Auth Risk**: `src/contexts/CloudflareAuthContext.tsx` - localStorage token storage

### Architecture Issues
1. **Data Bug**: `src/contexts/TemplatesContext.tsx` - Template structure flattening
2. **Performance**: Context providers lack memoization
3. **Large Components**: Some page components exceed 500 lines

### Development Opportunities
1. **React Query**: Installed but underutilized
2. **TypeScript**: Relaxed configuration reduces type safety
3. **Testing**: 10 test files provide good coverage but could be expanded

This comprehensive file inventory reflects the current state of the codebase as of January 2025, highlighting both the robust architecture and areas requiring attention.