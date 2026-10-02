import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JsonLd } from '@/components/seo/JsonLd';

describe('JsonLd', () => {
  it('escapes every < in the data, so text a user wrote, such as a template title, can never close the script tag', () => {
    const data = { name: '</script><script>alert(1)</script>' };

    const html = renderToStaticMarkup(<JsonLd data={data} />);

    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(JSON.parse(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))).toEqual(data);
  });
});
