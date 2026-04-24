Original instructions were:

  - Replace the current frontend UI wholesale with the new UI from
    tmp/v0-serplists-com-v0-design.
  - Do not preserve the old UI system:
      - old global styles
      - old inline/custom CSS
      - old custom presentation components
  - It was acceptable to keep the existing route semantics and product IA
    instead of copying the v0 app/router structure exactly, as long as
    the styling/design system was fully replaced.
  - The frontend should be decoupled from the backend:
      - pages/components should depend on frontend-facing services/
        adapters
      - direct backend/API/auth client coupling should be removed where
        practical
      - backend/services should remain swappable later
  - Current product behavior was supposed to remain the contract:
      - public/private/share route behavior
      - template/run/editor/account flows
      - no prototype shortcuts that change product reality
  - Use $subagent-driven-development to delegate implementation and QA.
  - Use $agent-browser and $puppeteer-automation to visually confirm the
    results.
  - The outcome should be a real replacement, not a partial theme pass or
    compatibility layer.

  The concrete goal was basically:

  1. Keep Serplists’ real behavior and route contracts.
  2. Replace the visual/design system completely with the new UI.
  3. Move the frontend behind a service boundary so it is less backend-
     coupled.
  4. QA it with delegated review plus browser-based visual checks.

  If you want, I can also condense that into a handoff brief you can
  paste directly to someone else.




  ---

  # PARITY COMPARISON
  
  All of these designs should be implemented to our live site and MATCH EXACTYL in structure, design tokens, theme, etc.

  - [x] https://v0-serplists-com-v0-design.vercel.app/dashboard/templates/new
  - [x] https://v0-serplists-com-v0-design.vercel.app/dashboard/runs
  - [x] https://v0-serplists-com-v0-design.vercel.app/templates
  - [x] https://v0-serplists-com-v0-design.vercel.app/profile/marketingpro/product-launch-campaign
  - [x] https://v0-serplists-com-v0-design.vercel.app/run/template-3
  - [x] https://v0-serplists-com-v0-design.vercel.app/dashboard/templates
  - [x] https://v0-serplists-com-v0-design.vercel.app/run/run-5
  - [x] https://v0-serplists-com-v0-design.vercel.app/dashboard/settings
  - [x] https://v0-serplists-com-v0-design.vercel.app/templates
  - [x] https://v0-serplists-com-v0-design.vercel.app/dashboard/templates/new

---

# REACT COMPONENTIZATION / REUSE OPTIMIZATION CHECKLIST

For every item below, apply the Vercel React best-practice pass:

- keep route/page files as orchestration only
- move repeated JSX, styling, and layout shells into shared components
- keep state as low as practical and derive render values instead of effect-syncing
- avoid nested inline component definitions
- keep prop APIs small, explicit, and reusable
- use direct imports for heavy or shared primitives instead of broad barrel imports
- ensure keyboard/touch accessibility, responsive behavior, and loading/error states
- add or update focused tests when behavior, structure, or layout responsibility changes

## Component Files

- [x] `src/components/DevLoginBar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ErrorBoundary.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/Layout.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/MobileNav.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/RequireAuth.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/TemplateBackup.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/account/BillingSection.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/account/ProfileSection.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/account/SecuritySection.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/auth/AuthPageShell.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist-library/CategoryNavigation.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist-library/SearchAndFilters.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist-library/TemplateCard.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist-library/TemplatesDiscoveryHeader.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist/ChecklistContent.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist/ChecklistItemCard.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/checklist/ChecklistSidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/dashboard/DashboardContentShell.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/dashboard/DashboardSidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/dashboard/RunsDashboardView.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/dashboard/TemplateCard.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/dashboard/TemplateListItem.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/github/GitHubIntegration.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/layout/PublicPageLayout.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/layout/page-shell.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/run-execution/RunProgressSidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/run-execution/TaskExecutionPanel.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/AvatarUpload.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/ContentRenderer.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/EmptyState.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/LoadingSkeleton.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/LoadingSpinner.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/PublicPill.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/SEOHead.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/UserInfo.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/shared/VideoEmbed.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/ContentAddPanel.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/ContentEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/EditorPanels.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/ItemEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/OutlineSidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/SEOMetaEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/SectionEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/SectionSidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/TemplateBasicInfo.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/TemplateHeader.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/content-types/EmbedContentEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/content-types/MediaContentEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/content-types/SubItemsEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template-editor/content-types/TextContentEditor.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template/PublicTemplateContent.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template/PublicTemplateView.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/template/TemplateActions.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/templates/UserTemplatesSection.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/accordion.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/alert-dialog.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/alert.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/aspect-ratio.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/avatar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/badge.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/breadcrumb.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/button.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/calendar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/card.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/carousel.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/chart.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/checkbox.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/collapsible.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/command.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/context-menu.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/dialog.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/drawer.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/dropdown-menu.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/embed-field.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/field.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/file-upload.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/form.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/hover-card.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/input-otp.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/input.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/label.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/menubar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/multi-select.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/navigation-menu.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/pagination.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/popover.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/progress.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/radio-group.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/resizable.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/run-name-dialog.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/scroll-area.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/select.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/separator.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/sheet.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/sidebar.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/skeleton.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/slider.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/sonner.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/switch.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/table.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/tabs.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/tags.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/textarea.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/toast.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/toaster.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/toggle-group.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/toggle.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.
- [x] `src/components/ui/tooltip.tsx` - Audit and refactor for React best practices: component boundaries, prop shape, state ownership, derived state, stable keys, reusable primitives, accessibility, responsive behavior, and test coverage.

## Page / Template Files

- [x] `src/pages/About.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Account.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Categories.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/CategoryDetail.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/ChecklistLibrary.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/ChecklistRun.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Contact.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Dashboard.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/DashboardSettings.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Docs.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Features.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/ForgotPassword.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Index.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Login.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/NotFound.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Pricing.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/PublicTemplate.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Recipes.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Register.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/ResetPassword.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/TemplateDetail.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/TemplateEditor.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/Templates.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
- [x] `src/pages/UserProfile.tsx` - Audit and refactor for page/template best practices: route-level orchestration only, shared layout primitives, model/service boundaries, no duplicated shell markup, loading/error states, accessibility, and visual parity.
