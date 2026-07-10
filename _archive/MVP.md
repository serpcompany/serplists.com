
- fix: public IA alignment

- [x] make `/templates` and `/dashboard` the canonical user-facing routes while preserving legacy redirects from `/checklists` and `/console`
- [x] render public header, mobile nav, and footer from one shared route config and trim duplicate footer navigation
- [x] tighten auth, public library, and public template detail layouts so content starts higher and repeated summary chrome is removed
- [x] add regression coverage for route canonicals and public layout density cleanup
- [x] document the public IA cleanup in `docs/knowledge`

---

- feat: centralized style system

- [x] add shared page shell and surface tokens so pages stop defining their own containers and card treatments
- [x] migrate the most divergent public, auth, error, and console pages onto shared layout primitives
- [x] add regression coverage for shared layout and surface variants
- [x] document the style-system cleanup in `docs/knowledge`

---

- chore: adaptive local dev launcher

- [x] add `pnpm dev:auto` to find an open frontend/API port pair when the default local ports are occupied
- [x] make `pnpm dev`, `pnpm dev:api`, and `pnpm dev:all` share the same adaptive port-pair logic
- [x] persist the chosen pair under `tmp/` so standalone frontend/API runs stay aligned
- [x] add unit coverage for the adaptive port-pair and env override logic
- [x] document how the normal local dev scripts adapt while Playwright keeps its own isolated harness

---

- bug: template update bug

logged in with `john`
created a run
edited template http://localhost:8080/templates/template-2/edit
added video section
saved
went back to the run

bug: editing templates do not update the existing 'runs' despite the toast message saying it does.
working: they do update FUTURE runs of the templates
working: they do update public templates

---

- feat: UX convenience (nav)
  
when logged in, i want to make it easier for the user to navigate to their 'templates' and 'runs'.

currently, to get to run: have to click profile icon -> dashboard -> runs
to get to templates: have to click profile icon -> templates

- [ ] logged in state should have sub nav, or replace the main nav (since main nav is for pre-user consumer facing stuff like pricing, etc.), or just have a sidebar nav
- [ ] /dashboard/ has a `+ new template` button, but needs also a `+ new run` button 

---

- feat: guest checklist runs

`http://localhost:8080/templates` page has templates with buttons 'edit', 'trash', 'start'

as a user i want another button for 'share' that creates a one time public run in my account, that i can share with anyone (guest / no login required) and that person can do the run via my account (no edit permissions)
