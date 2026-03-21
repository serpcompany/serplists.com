
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
