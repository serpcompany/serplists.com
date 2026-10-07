import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JsonLd } from '@/components/seo/JsonLd';

import { onlyElement } from '../../support/elements';

describe('JsonLd', () => {
  it('escapes every < in the data, so text a user wrote, such as a template title, can never close the script tag', () => {
    const data = { name: '</script><script>alert(1)</script>' };

    const html = renderToStaticMarkup(<JsonLd data={data} />);
    const scripts = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script')];

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(onlyElement(scripts).textContent)).toEqual(data);
  });
});
