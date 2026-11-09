const sourceUrl = 'https://clipy.online/video/8fptqlnappr6';

export function completeClipyContext() {
  return {
    readiness: {
      state: 'complete',
      video: 'ready',
      transcript: 'ready',
      summary: 'ready',
      keyMoments: 'ready',
    },
    clip: {
      accessMode: 'public',
      publicId: '8fptqlnappr6',
      title: 'Creating Issues In GitHub Repositories',
    },
    summary: {
      tldr: 'Create a clear GitHub issue that a developer can act on.',
      keyPoints: [
        'Navigate to the repository issues tab.',
        'Click the new issue button.',
        'Provide a concise descriptive title.',
        'Include detailed information and screenshots.',
        'Submit the issue and share its URL.',
      ],
    },
    transcript: {
      plaintext: '[0:01] Open the repository.\n[0:05] Select Issues and create a new issue.',
    },
    keyMoments: {
      moments: [
        {
          tMs: 11_500,
          caption: 'Clicks the Issues tab in the GitHub repository',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
        },
        {
          tMs: 15_600,
          caption: 'Clicks the New issue button',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/new-issue.jpg',
        },
        {
          tMs: 22_700,
          caption: 'Enters a title for the new issue',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/title.jpg',
        },
        {
          tMs: 48_800,
          caption: 'Attaches a screenshot file to the issue',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/screenshot.jpg',
        },
      ],
    },
  };
}

export function clipyRequest(url = sourceUrl) {
  return new Request('http://localhost/api/templates/generate-from-clipy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
