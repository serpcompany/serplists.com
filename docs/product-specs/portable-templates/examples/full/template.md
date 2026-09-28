---
title: Launch Checklist
type: checklist
slug: launch-checklist
visibility: public
seoTitle: Launch Checklist
seoDescription: Checklist for preparing and shipping a release.
categories:
  - ops
  - release
tags:
  - launch
  - qa
rules:
  - id: rule-1
    type: required-field
    path: sections[].items[].title
    severity: error
---

# Launch Checklist

Checklist for preparing and shipping a release.

## Preparation

### Review release notes

Confirm the final copy is approved.

```serplists:text
Publish the final **release notes** and confirm all links work.
```

### Final asset check

Make sure the hero image is production-ready.

```serplists:image
value: https://example.com/assets/launch-hero.png
uploadType: url
fileName: launch-hero.png
```

### Record launch walkthrough

Share a short internal video before the release window.

```serplists:video
value: https://example.com/assets/launch-walkthrough.mp4
uploadType: url
fileName: launch-walkthrough.mp4
```

### QA pass

```serplists:subItems
- Smoke test homepage
- Smoke test signup flow
- Verify analytics events
```

## Launch Day

### Publish release

```serplists:text
Deploy production and monitor logs for the first 15 minutes.
```

```serplists:file
value: https://example.com/assets/release-runbook.pdf
uploadType: url
fileName: release-runbook.pdf
fileSize: 245760
```

```serplists:embed
https://status.example.com
```
