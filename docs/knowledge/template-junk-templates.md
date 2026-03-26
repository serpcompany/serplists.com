# Junk public templates cleanup

## Symptoms
- Public templates titled "Test Template" and "Updated Template Title" show up on the homepage and `/templates`.

## Likely cause
- The integration API tests create public templates with these titles and do not delete them.
- If those tests are ever run against a persistent database (remote D1 or a local DB with `persist: true`), the records accumulate and appear in the public library.

## Fixes
- Add a cleanup migration to delete templates with those titles.
- Add integration-test cleanup that deletes any templates created during tests.
- Log a warning on the API when a template is created/updated with those titles so it is easy to identify the source user.

## Prevention
- Keep test-created templates short-lived (delete in teardown) and avoid running test suites against production data.
