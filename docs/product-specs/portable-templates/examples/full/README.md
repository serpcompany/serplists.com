# Launch Checklist

Checklist for preparing and shipping a release.

Categories: ops, release
Tags: launch, qa

## Required tools

- Time tracker (required): <https://example.com/tools/time-tracker>
- Slideshow app (optional): <https://example.com/tools/slides>

## Preparation

- [ ] **Review release notes**

Confirm the final copy is approved.

Publish the final **release notes** and confirm all links work.

- [ ] **Final asset check**

Make sure the hero image is production-ready.

**Image**

![launch-hero.png](https://example.com/assets/launch-hero.png)

Source: https://example.com/assets/launch-hero.png

- [ ] **Record launch walkthrough**

Share a short internal video before the release window.

**Video**

File: launch-walkthrough.mp4

Watch: https://example.com/assets/launch-walkthrough.mp4

- [ ] **QA pass**

Sub-items:
- [ ] Smoke test homepage
- [ ] Smoke test signup flow
- [ ] Verify analytics events

## Launch Day

- [ ] **Publish release**

Deploy production and monitor logs for the first 15 minutes.

**File**

[release-runbook.pdf](https://example.com/assets/release-runbook.pdf)

Size: 240 KB

**Embedded Content**

https://status.example.com

- [ ] **Record the launch sign-off**

Every run records who approved the launch and how it went.

**Form**

- Approved by (Short text, required)
- Approver email (Email, required)
- Release channel (Dropdown, required)
  - Options: Stable, Beta
- Error rate after one hour (%) (Number, optional, 0 to 100): Read it from the status dashboard.
- Rollback plan reviewed (Checkbox, required)
