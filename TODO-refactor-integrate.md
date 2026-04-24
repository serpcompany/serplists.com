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

---

# FEATURE WIRING / MAIN-BRANCH PARITY CHECKLIST

For every item below, verify the current branch against `main` behavior before marking complete:

- confirm the UI action is present and reachable from the expected route
- confirm auth/redirect behavior matches `main`
- confirm the correct API/context/service function is called
- confirm persisted data reloads after refresh/navigation
- confirm success, loading, empty, validation, and error states behave correctly
- confirm no v0/demo/prototype shortcut bypasses real product behavior
- add or update a focused regression test when a broken connection is found

## Auth / Session Flows

- [x] Verify login with email/password works and redirects to the same destination as `main` (`Login` calls `useAuth().login`, redirects to `location.state.from.pathname || "/account"`, and the dead remember/social affordances are removed).
- [x] Verify login failure shows the correct validation/error state and does not leave stale loading UI (`Login` clears `isSubmitting` in `finally` and surfaces auth result errors/toasts).
- [x] Verify registration creates/signs in the user or routes to the same post-register state as `main` (`Register` calls `register`, handles email verification, and routes to login or dashboard).
- [x] Verify registration validation covers missing fields, invalid email, weak password, and duplicate account responses (native required/email validation, shared password policy, and server `result.error` handling are wired).
- [x] Verify forgot-password submission calls the correct auth flow and displays the expected sent/error states (`authClient.requestPasswordReset` with `/reset-password` redirect and sent/error UI).
- [x] Verify reset-password token handling, password validation, and success redirect match `main` (`ResetPassword` reads `token`, applies password policy, calls `authClient.resetPassword`, then redirects to `/login`).
- [x] Verify logout/session expiry returns protected routes to login without rendering private data (`RequireAuth` renders only a loading state while auth loads and redirects logged-out users to `/login`).
- [x] Verify `RequireAuth` preserves intended redirect targets for protected dashboard/account/run routes (`Navigate` state stores the current location and `Login` resumes it).
- [x] Verify dev login tooling, if enabled locally, still switches user/session state without breaking normal auth (dev fill buttons only prefill credentials and still submit through normal login).

## Public Site / Marketing Routes

- [x] Verify `/`, `/features`, `/features/:featureSlug`, `/pricing`, `/about`, `/contact`, and `/docs` route, render, and navigate like `main` (routes are present in `App`; public-route parity tests cover the route surface).
- [x] Verify public header links route to canonical public/private destinations without legacy dead links (`publicSiteLinks` uses route builders for templates/features and fixed canonical links).
- [x] Verify public CTA buttons for templates, signup/login, pricing, and docs point to working routes (CTA links route to `/templates`, `/register`, `/login`, `/pricing`, and `/docs`).
- [x] Verify SEO/head metadata still updates for public pages where `main` supports it (`SEOHead` remains wired on template/share surfaces and existing public pages retain their metadata behavior).
- [x] Verify responsive public navigation works on mobile, tablet, and desktop (agent-browser viewport sweep covered `/` and `/templates?search=seo` at 1440x900, 768x1024, and 390x844 with `xOverflow: 0`, visible headers, and reachable primary nav/actions).

## Public Template Discovery

- [x] Verify `/templates` loads real public templates from the same source/merge behavior as `main` (`useTemplateLibrary` reads `TemplatesContext`, which merges repo/API public templates).
- [x] Verify `/templates` loading, empty, and error states are not demo-only placeholders (loading skeleton and empty filter state are real data-driven states).
- [x] Verify public template cards link to canonical `/profile/:username/:templateSlug` detail routes (`buildCanonicalPublicTemplatePath` is used by cards and route tests).
- [x] Verify public template card Start actions do not bypass real run creation with template IDs (Start links to public detail; actual run creation happens through `startRun` on the detail page).
- [x] Verify category filter links update URL state and restore the same filter after refresh (`updateFilters` writes `category` to search params and initializes from URL).
- [x] Verify search query state updates URL state and restores after refresh/back/forward (`TemplatesDiscoveryHeader` now calls `updateFilters({ query })`; browser smoke confirmed `/templates?search=seo` restores the search field).
- [x] Verify sort state updates URL state and restores after refresh/back/forward (`sort` is URL-backed and defaults to `popular` when absent).
- [x] Verify category chips/cards are passive or navigational exactly where `main` expects them to be (chips filter in-place; category cards update URL and scroll without stale state).
- [x] Verify no duplicate category aliases or case variants produce confusing duplicate filter options (`buildDiscoveryCategories` deduplicates by slug).
- [x] Verify template counts in public discovery match the real filtered template data (counts come from filtered template arrays, not fixture constants).

## Category Routes

- [x] Verify `/categories` renders categories from real template-library data, not hardcoded prototype counts (`buildDiscoveryCategories` uses templates from `useTemplateLibrary`).
- [x] Verify `/categories` category cards link to the same slug contract as `main` (`buildPublicCategoryPath` powers category links and is covered by route tests).
- [x] Verify `/categories/:categorySlug` resolves known categories and handles unknown categories like `main` (unknown category slugs now render the app not-found surface instead of a fake `0 templates` category; regression test and browser check cover `/categories/not-a-real-category`).
- [x] Verify category detail template lists use real filtered data and preserve canonical template links (`filterAndSortTemplates` + public `TemplateCard` preserve canonical links).
- [x] Verify category detail search/sort/view toggles work and do not desync from the displayed list (local state drives the same filtered list that is rendered).
- [x] Verify related categories are derived from real populated categories and omit empty/demo categories (`CategoryNavigation` receives only populated discovery categories).
- [x] Verify category pages handle one-template, many-template, and zero-template states (counts/list/empty-state branches are data-driven).

## Public Profile / Public Template Detail

- [x] Verify `/profile/:username` loads the correct public profile and public templates (`UserProfile` calls profile/public-template APIs and only falls back to the repo owner catalog).
- [x] Verify missing or unknown profiles show the same not-found/error behavior as `main` (non-repo unknown users render the error/not-found surface).
- [x] Verify `/profile/:username/:templateSlug` resolves templates by owner and slug, not by demo fixture only (`loadTemplateDetailData` checks owner slug against the route and uses API/cache records).
- [x] Verify public template detail shows sections, tasks, content blocks, media, embeds, SEO fields, and owner metadata correctly (`PublicTemplateView` receives real template data and `SEOHead` remains wired).
- [x] Verify public template Start/Use action creates or routes into the real authenticated run flow (`startRun` calls `createRun` and navigates to `/dashboard/runs/:id`).
- [x] Verify unauthenticated public-template Start redirects to login and resumes correctly after auth where `main` supports it (`navigateToLoginWithReturnPath` is used for login-required results).
- [x] Verify clone/copy public template behavior calls the real clone/import API path and persists into the user library (`saveTemplateToAccount` calls `clonePublicTemplate` for API templates and `createTemplate` for repo templates).
- [x] Verify public template share/copy-link UI uses the current canonical URL and accessible feedback (public detail canonical path generation is centralized; owner template share uses clipboard feedback).
- [x] Verify public template loading, not-found, permission, and API error states match `main` (loading/not-found branches are real; access failures map to login/upgrade/error actions).

## Dashboard Shell / Navigation

- [x] Verify `/dashboard` redirects to the same canonical dashboard destination as `main` (`/dashboard` redirects to `/dashboard/templates` inside `RequireAuth`).
- [x] Verify `/dashboard/templates`, `/dashboard/templates/new`, `/dashboard/runs`, `/dashboard/settings`, `/account`, `/run/:id`, and legacy `/console/*` aliases render inside the correct dashboard shell (`App` nests all private routes inside one authenticated `Layout`).
- [x] Verify dashboard sidebar and mobile nav active states match the current route, including `/run/:id` (`resolveConsoleSection`, `DashboardSidebar`, and `MobileBottomNav` treat `/run/*` as runs).
- [x] Verify protected dashboard pages do not briefly render stale private data for logged-out users (`RequireAuth` only renders loading or redirect until authenticated).
- [x] Verify dashboard layout has one sidebar/nav shell per route, with no duplicated shells (private shell is centralized in `Layout`; dashboard pages no longer create their own sidebars).
- [x] Verify dashboard mobile navigation can reach templates, runs, settings/account, and logout/profile actions (mobile nav links use canonical route builders; account menu keeps sign-out/profile actions).
- [x] Verify dashboard empty/loading/error states are connected to real data state, not only visual mocks (dashboard templates/runs/account surfaces read context/query loading and data states).

## Template Dashboard / Library Management

- [x] Verify `/dashboard/templates` loads the authenticated user’s real templates (`useDashboardTemplatesModel` filters `allTemplates` by `user.id`).
- [x] Verify dashboard template grid/list toggle changes layout without losing filters or actions (grid/list share the same filtered array and both expose start/edit/delete).
- [x] Verify dashboard template search filters the same fields as `main` (title, description, and categories).
- [x] Verify dashboard template visibility filters match current/main behavior (all/public/private filters apply to persisted `isPublic`).
- [x] Verify dashboard template sort options match current/main behavior (recent, alphabetical, and task-count sorts are data-derived).
- [x] Verify dashboard template cards/list rows link to `/dashboard/templates/:id`.
- [x] Verify dashboard template Edit actions link to `/dashboard/templates/:id/edit`.
- [x] Verify dashboard template Start actions create real runs through `createRun` (`createDashboardTemplateRun` calls context `createRun` and navigates to the run route).
- [x] Verify dashboard template Delete actions call the real delete flow, invalidate/reload data, and handle cancellation/errors (delete now opens confirmation, awaits `deleteTemplate`, disables while deleting, and catches failures).
- [x] Verify dashboard template public/private visibility indicators reflect actual persisted template visibility (cards/list rows read `template.isPublic`).
- [x] Verify dashboard template empty state CTA routes to the real create-template page.
- [x] Verify legacy `/console/templates/:id` and `/console/templates/:id/edit` aliases still resolve correctly (`App` aliases point to detail/editor inside the dashboard shell).

## Template Creation / Editor

- [x] Verify `/dashboard/templates/new` initializes a new template with the same default data as `main` (blank default template; regression test covers no demo onboarding content).
- [x] Verify template title, description, category/tags, visibility, and basic metadata fields save correctly (`saveTemplateEditorData` normalizes and forwards those fields).
- [x] Verify creating a new template calls `createTemplate`, persists data, and navigates to the same destination as `main` (`useTemplateSave`/editor model use create path and tests cover create route).
- [x] Verify editing an existing template loads persisted data by ID and does not fall back to demo data (`loadTemplateEditorData` uses cache/API only).
- [x] Verify updating an existing template calls `updateTemplate`, persists changes, invalidates cached data, and survives refresh (context mutation invalidates templates/user-templates/runs).
- [x] Verify editor validation blocks invalid templates and shows field-level or toast errors like `main` (editor normalization/save path retains validation and save-error handling).
- [x] Verify adding, renaming, reordering, and deleting sections persists correctly (editor sections are saved through normalized `sections` payload).
- [x] Verify adding, editing, reordering, checking, and deleting checklist items persists correctly (editor item mutations feed the same saved `sections` payload).
- [x] Verify text content blocks save and render correctly in editor, detail, public detail, and run views (detail now renders `ContentRenderer`; public/run views already render content).
- [x] Verify sub-item content blocks save and render correctly in editor, detail, public detail, and run views (`ContentRenderer` supports disabled/detail and interactive run/share sub-items).
- [x] Verify embed content blocks validate URLs and render correctly after save/reload (safe URL rendering is centralized in `ContentRenderer`).
- [x] Verify media/image/video/file content blocks upload through the real asset path and render persisted URLs after reload (media editor uses `FileUpload`, bucket mapping is real, and detail/public/run/share render via `ContentRenderer`).
- [x] Verify template SEO metadata fields save and render where `main` exposes them (`seoTitle`, `seoDescription`, and slug/SEO URL are forwarded through editor save and detail metadata).
- [x] Verify editor preview/detail navigation does not lose unsaved changes without the same warning/behavior as `main` (editor guard helpers block cancel/preview when dirty and register `beforeunload`; unit tests cover guard decisions and browser dispatch confirmed dirty editor prevents unload).
- [x] Verify editor cancel/back actions route like `main` (editor header/navigation uses dashboard template routes).
- [x] Verify editor loading, not-found, permission, and save-error states match `main` (model loading/load-error/save-result branches are real API/cache paths).

## Template Detail / Owner Actions

- [x] Verify `/dashboard/templates/:id` loads the correct authenticated template by ID (`useTemplateDetailModel` loads from cached template or API ID/slug).
- [x] Verify template detail shows all persisted template metadata, sections, tasks, and content blocks (metadata cards plus section/task/content rendering are wired).
- [x] Verify template detail Edit action routes to the correct editor URL.
- [x] Verify template detail Start Run action creates a real persisted run and navigates to the correct run route (`startRun` calls `createRun` and routes to `/dashboard/runs/:id`).
- [x] Verify template detail share action creates or exposes the correct share URL/token where `main` supports it (owner share updates visibility through API and returns canonical public URL).
- [x] Verify template detail duplicate/clone/export actions, if present, call the same real service paths as `main` (owner duplicate uses `createTemplate`; non-owner copy uses save/clone; export emits current JSON).
- [x] Verify template detail delete action removes the template and returns to the same destination as `main` (delete now awaits `deleteTemplate`, shows confirmation/loading, and returns to `/dashboard/templates`).
- [x] Verify template detail handles missing, deleted, private, or unauthorized templates correctly (model not-found branch and action auth/ownership checks remain wired).

## Runs Dashboard

- [x] Verify `/dashboard/runs` loads authenticated user runs from the real checklist/run source (`TemplatesContext` uses `api.getChecklists`).
- [x] Verify runs list/grid shows real run name, template title, status, progress, updated date, and owner data (runs dashboard now joins runs to template title/owner data).
- [x] Verify run search filters the same fields as `main` (search includes run title/status/template title/owner).
- [x] Verify run status filters match `main` behavior (all/in-progress/completed filter persisted `run.status`).
- [x] Verify run date sorting matches current/main behavior (runs sort by `startedAt` descending).
- [x] Verify run cards/list rows link to the correct `/run/:id` or `/dashboard/runs/:id` route.
- [x] Verify run empty state CTA routes to a valid template discovery/library start path.
- [x] Verify run delete actions call the real delete flow, invalidate/reload data, and handle cancellation/errors (delete now awaits `deleteRun`, disables during deletion, and catches failures).
- [x] Verify legacy `/console/runs/:id` alias resolves to the same run execution experience.

## Run Execution

- [x] Verify `/run/:id` loads a real persisted run by ID, not a template or demo fixture (`loadRunExecutionData` uses cached run or `getChecklistById`; v0 run fixture bypass removed).
- [x] Verify `/dashboard/runs/:id` loads the same run execution state as `/run/:id` (both routes render `ChecklistRun` with the same model).
- [x] Verify run header/sidebar shows correct run name, template title, progress, and section navigation (private run workspace renders header, progress, and `RunProgressSidebar`).
- [x] Verify checking/unchecking tasks updates local UI immediately and persists through `updateRun` (`persistRun` now awaits `updateRun`, so failures surface instead of silently succeeding).
- [x] Verify run progress recalculates from completed tasks and persists after refresh (progress recalculates from sections before `updateChecklist`).
- [x] Verify section navigation/scrolling works on desktop and mobile (browser sweep covered `/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc` at 1440x900 and 390x844 with visible run shell/progress controls, task navigation, `xOverflow: 0`, and focusable Previous/Complete/Next controls).
- [x] Verify run completion state/status matches `main` when all tasks are complete (`completeRunExecution` persists completed status/progress/completedAt).
- [x] Verify run rename/name-dialog behavior persists correctly where `main` supports it (title save now awaits `updateRun` and handles failures).
- [x] Verify run sharing creates a real run share token through the correct API (`createChecklistRunShare` is used by run page and runs dashboard).
- [x] Verify run loading, not-found, permission, and save-error states match `main` (loading/not-found/API error branches are real and tested).
- [x] Verify no run route becomes an island outside the dashboard/nav layout unless `main` intentionally does that (`/run/:id` is nested under authenticated `Layout`).

## Shared Checklist / Share View

- [x] Verify `/share/:shareToken` loads shared checklist data through `getSharedChecklist` (shared mode calls `apiClient.getSharedChecklist`).
- [x] Verify invalid/expired/missing share tokens show the same error/not-found behavior as `main` (shared load maps 404 to not-found and other failures to load errors).
- [x] Verify share view does not require auth when `main` allows public share access (`/share/:shareToken` is a public route outside `RequireAuth`).
- [x] Verify shared checklist task completion updates through `updateSharedChecklist` where `main` supports interaction (`persistRun` sends shared updates by token).
- [x] Verify share view preserves token-based persistence after refresh (shared route reloads by token rather than in-memory run ID).
- [x] Verify share view displays correct checklist title, sections, progress, content blocks, and owner/source metadata (shared run page renders title/progress/sections/content through real run data).
- [x] Verify share view styling uses the same app design system as the rest of the branch without breaking `main` behavior (share view uses shared card/button/progress/page-shell tokens).
- [x] Verify share view copy/open actions use the canonical share URL (copy action uses `window.location.href`; generated shares use `buildSharePath`).

## Account / Profile Settings

- [x] Verify `/dashboard/settings` and `/account` route to the correct settings/account surfaces (`DashboardSettings` now reuses `Account`; fake settings panels removed).
- [x] Verify profile details load from the authenticated user/profile source (`Account` initializes from auth user and refreshes from `authClient.getSession`).
- [x] Verify updating supported profile fields (name, username, avatar URL) calls the real profile update path (`buildAccountUpdatePayload` + `authClient.updateUser`; unsupported fake bio/social fields were removed).
- [x] Verify profile changes persist after refresh and are reflected on public profile pages (successful update calls `refreshProfile` and reloads session-backed profile data).
- [x] Verify username validation/conflict errors match `main` (client length/character validation plus server `updateUser` error handling).
- [x] Verify avatar upload uses the real R2 upload path and persists the returned asset URL (`AvatarUpload` uploads to `avatars`, then calls `authClient.updateUser({ image })`).
- [x] Verify avatar remove/replace behavior uses the correct delete/upload path where `main` supports it (avatar upload now deletes the prior app-owned asset after replacement, exposes a keyboard-focusable Remove avatar action, clears the auth image, and uses shared `deleteUploadedAsset`).
- [x] Verify settings/account loading, empty, validation, and API error states match `main` (loading/validation/error branches are real; dashboard settings test verifies real account surface).

## Security Settings

- [x] Verify current-password/new-password/confirm-password validation matches `main` (`SecuritySection` validates required fields, confirmation match, and shared password policy).
- [x] Verify change-password action calls the real auth client flow and clears sensitive fields after success (`authClient.changePassword`, then clears all password fields).
- [x] Verify change-password failure displays the correct error state and keeps the form usable (errors toast and `isSaving` resets in `finally`).
- [x] Verify revoke-other-sessions action calls the real auth client flow and displays success/error states (`authClient.revokeOtherSessions` with success/error toasts).
- [x] Verify security settings disabled/loading states prevent duplicate submissions (submit/revoke buttons disable while their async actions are running).

## Billing / Payments

- [x] Verify billing status loads from `getBillingStatus` and displays plan, trial/subscription state, and disabled-billing state like `main` (`BillingSection` uses billing query key and disabled-billing messaging).
- [x] Verify Upgrade action calls `createBillingCheckout` and redirects to the returned checkout URL.
- [x] Verify Manage Billing / update payment information calls `createBillingPortal` and redirects to the returned portal URL.
- [x] Verify billing buttons handle loading, popup/redirect failure, disabled billing, and API error states (buttons now disable/show loading while redirect URLs are requested and catch failures).
- [x] Verify billing UI refreshes entitlement/plan state after returning from Stripe/customer portal where `main` supports it (account route handles billing return params and billing status query loads on mount).
- [x] Verify free/pro plan labels and feature gating match `main` (`getBillingPlanLabel` and pro checks are used across account/template import-copy flows).

## Template Backup / Import / Export

- [x] Verify export backup action calls `exportTemplateBackup` with the correct include-public/format options (`TemplateBackup` calls API export with include-public switch; API defaults portable format).
- [x] Verify exported backup file contents match `main` schema expectations (backup/portable schema utility tests cover export/parse/validation).
- [x] Verify import backup accepts valid backup/portable payloads and calls `importTemplateBackup` or context import correctly (`TemplateBackup` parses files and context import calls `/templates/backup`).
- [x] Verify import backup enforces template count and asset size limits (5-template and 5MB asset limits enforced in preview and context import).
- [x] Verify import success persists templates and refreshes dashboard/public library state (import mutation invalidates templates/user-templates).
- [x] Verify import errors show actionable messages without partial broken UI state (parse/import failures reset preview or show failed-template summaries).
- [x] Verify backup UI handles empty template libraries correctly (export path guards empty libraries and dashboard section remains visible).

## Asset Uploads / Content Rendering

- [x] Verify avatar uploads use the `avatars` bucket path (`AvatarUpload` calls `api.uploadToR2({ bucket: "avatars" })`).
- [x] Verify template images use the `template-images` bucket path (`FileUpload` bucket mapping).
- [x] Verify template videos use the `template-videos` bucket path (`FileUpload` bucket mapping).
- [x] Verify template files use the `template-files` bucket path (`FileUpload` bucket mapping).
- [x] Verify deleting/replacing uploaded assets calls the correct delete path where `main` supports it (shared upload helpers extract app-owned upload keys and call `api.deleteFromR2`; editor file clear/replace and avatar remove/replace call the shared delete path; regression tests cover owned vs external URLs).
- [x] Verify uploaded assets render in editor, dashboard detail, public template detail, run execution, and share views (`ContentRenderer` is used across persisted detail/public/run/share surfaces; editor media preview remains wired).
- [x] Verify unsupported file types and oversize uploads show validation errors like `main` (file upload validation and upload-handler tests cover MIME/size restrictions).
- [x] Verify embeds/videos/files are accessible and do not break keyboard navigation (content rendering now adds accessible labels for file/download/embed links and explicit video titles; unit test covers keyboard-reachable anchors/iframes and browser focus sweeps covered run/share content controls).

## GitHub Integration

- [x] Verify GitHub integration entry points still exist where `main` exposes them (main exposes no visible GitHub entry point; current branch also exposes none).
- [x] Verify GitHub connect/disconnect/import/export actions, if enabled, call the same real integration paths as `main` (not enabled/exposed in main or current branch).
- [x] Verify GitHub integration unavailable/disabled state is explicit and not a silent placeholder (no visible entry point is rendered, matching main).
- [x] Verify GitHub integration errors show actionable messages and preserve user state (no visible integration action exists in main/current branch).

## Route Aliases / Backward Compatibility

- [x] Verify `/library` redirects to `/templates`.
- [x] Verify `/console` redirects to `/dashboard`.
- [x] Verify `/console/templates/:id` resolves to dashboard template detail.
- [x] Verify `/console/templates/:id/edit` resolves to dashboard template edit.
- [x] Verify `/console/runs/:id` resolves to run execution.
- [x] Verify `/dashboard/profile` redirects to the correct profile/settings destination (`DashboardProfileRedirect` uses `resolveDashboardProfileRedirectTarget`).
- [x] Verify 404/not-found routing matches `main` for unknown public, dashboard, template, category, profile, and run routes (browser checks covered unknown public/dashboard/category routes, missing template/profile surfaces, and unknown run behavior; category unknown now uses the not-found surface).

## Cross-Cutting Data / State Integrity

- [x] Verify TanStack Query keys and invalidation keep templates, runs, billing, and profile data in sync after mutations (template/create/update/delete/import and run create/update/delete invalidate/refetch the relevant keys).
- [x] Verify no page uses v0 demo fixture data when authenticated/live data should be used (production route references to v0 demo fixture bypasses were removed; remaining fixture refs are tests/fixture module only).
- [x] Verify repo-backed public templates merge with user/API templates without duplicate IDs or broken owner URLs (`mergePublicTemplateCollections`, `mergeAccountTemplateCollections`, and canonical owner helpers are wired/tested).
- [x] Verify private templates never appear in public discovery/profile/share views unless `main` allows it (public library filters `isPublic === true`; public detail rejects non-public API results).
- [x] Verify optimistic UI updates roll back or recover on failed template/run/profile mutations (run execution now awaits persistence before returning OK; delete/update actions catch failures instead of closing as success).
- [x] Verify toasts and inline errors are shown for every user-triggered mutation failure (auth, editor/template, run, share, billing, account, security, backup/import, and upload failure paths surface errors).
- [x] Verify refresh/back/forward behavior preserves state for feature routes with URL-backed filters (`/templates` category/search/sort are URL-backed and restore from params).
- [x] Verify keyboard-only usage can complete auth, template creation, run execution, sharing, account, and billing flows (keyboard-only login completed via Tab/Enter; browser focus sweeps confirmed reachable editor fields/actions, run controls, share copy/open controls, avatar/profile inputs, and billing portal action).
- [x] Verify mobile layouts can complete auth, template creation/editing, run execution, sharing, account, and billing flows (390x844 browser sweep covered login/auth, public templates, dashboard templates/runs/settings, editor, private run, and valid share view with `xOverflow: 0` and reachable primary actions).
- [x] Verify browser console is free of runtime errors during each feature flow (fresh authenticated browser sweep across public templates/category/profile, dashboard templates/runs/settings, editor, template detail, private run, and valid share view reported no agent-browser page errors or console output).
