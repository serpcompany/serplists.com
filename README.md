# README 

SERP Checklists is a powerful web application for creating, managing, and sharing process checklists. It helps teams standardize procedures, ensure consistency, and track completion across an organization.


## Features

- [x] **User Authentication**
  - [x] Register new accounts
  - [x] Login with email and password
  - [x] Demo login for quick testing

- [x] **Checklist Template Management**
  - [x] Create detailed checklist templates
  - [x] Organize templates with sections and items
  - [x] Edit and delete templates
  - [x] All templates are public by default with shareable URLs

- [x] **Rich Checklist Content**
  - [x] Support for text content (markdown)
  - [x] Support for images
  - [x] Support for video links
  - [x] Support for sub-tasks/sub-items

- [x] **Checklist Runs**
  - [x] Create runs from templates
  - [x] Track progress through checklist items
  - [x] Mark items as completed
  - [x] View completion percentage

- [x] **Public Sharing**
  - [x] Public URLs for each checklist (e.g., /checklists/my-checklist)
  - [x] Share checklists with anyone, even without an account
  - [x] Public checklist discovery on the homepage


## Tech Stack

- React (with TypeScript)
- Tailwind CSS for styling
- shadcn/ui component library
- React Router for navigation
- Supabase for backend (database, authentication)
- React Query for data fetching and caching
- Zod for schema validation

## Checklist Template Field Types

### Content Types (`ChecklistItemContent`)

**Text Field** (`type: "text"`)
- `value`: Markdown text content

**Image Embed** (`type: "image"`)
- `value`: Image URL

**Video Embed** (`type: "video"`)
- `value`: Video URL (YouTube, etc.)

**Sub-Items Checklist** (`type: "subItems"`)
- `value`: Empty string
- `subItems`: Array of sub-tasks with:
  - `id`: Unique identifier
  - `title`: Sub-task title
  - `isCompleted`: Boolean completion state

### Template Structure

**Item Structure:**
- `id`: Unique identifier
- `title`: Item title
- `description`: Optional description text
- `contents`: Array of content types above
- `isCompleted`: Boolean completion state

**Template Structure:**
- `id`, `title`, `description`
- `sections`: Array of sections containing items
- `userId`, `createdAt`, `updatedAt`
- `isPublic`: Boolean visibility
- `slug`: URL-friendly identifier

### Missing Field Types (Future Enhancements)
- Rich text editor
- File upload
- Date/time picker
- Number input
- Dropdown/select
- Radio buttons
- Advanced checkboxes

## Project Structure

- `/src/components` - UI components
- `/src/contexts` - React contexts for state management
- `/src/pages` - Application pages/routes
- `/src/hooks` - Custom React hooks
- `/src/lib/schemas` - Zod validation schemas
- `/src/lib/utils` - Utility functions including backup/restore
- `/src/integrations` - Third-party integrations (Supabase)
