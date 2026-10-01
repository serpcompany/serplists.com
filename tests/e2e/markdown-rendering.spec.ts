import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

const MARKDOWN = [
  '# Launch steps',
  '',
  '- first bullet',
  '- second bullet',
  '',
  '1. open settings',
  '2. click save',
  '',
  'See [the docs](https://example.com/docs)',
  'line two of the paragraph',
].join('\n');

async function openEditorPreview(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard/templates/new/');
  await page.getByRole('button', { name: /add task to section 1/i }).click();
  await page.getByLabel('Task Title').fill('Markdown task');
  await page.getByRole('button', { name: 'Add Block' }).last().click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByPlaceholder('Enter text or markdown content').fill(MARKDOWN);
  await page.getByRole('tab', { name: 'Preview' }).click();

  const preview = page.locator('.prose').filter({ hasText: 'first bullet' });
  await expect(preview).toBeVisible();
  return preview;
}

test('markdown preview shows list markers, heading sizes, link styling and single-newline line breaks', async ({ page }) => {
  const preview = await openEditorPreview(page);

  const styles = await preview.evaluate((root) => {
    const style = (selector: string) => getComputedStyle(root.querySelector(selector)!);
    const paragraph = root.querySelector('p')!;
    const items = root.querySelectorAll('ul > li');
    return {
      ulMarker: style('ul').listStyleType,
      ulPadding: parseFloat(style('ul').paddingInlineStart),
      olMarker: style('ol').listStyleType,
      headingSize: parseFloat(style('h1').fontSize),
      paragraphSize: parseFloat(getComputedStyle(paragraph).fontSize),
      linkDecoration: style('a').textDecorationLine,
      gapBetweenItems: items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom,
      lineHeight: parseFloat(getComputedStyle(items[0]).lineHeight),
    };
  });

  expect(styles.ulMarker).toBe('disc');
  expect(styles.ulPadding).toBeGreaterThan(0);
  expect(styles.olMarker).toBe('decimal');
  expect(styles.headingSize).toBeGreaterThan(styles.paragraphSize);
  expect(styles.linkDecoration).toContain('underline');
  expect(styles.gapBetweenItems).toBeLessThan(styles.lineHeight);

  const paragraphLines = await preview.locator('p', { hasText: 'line two' }).evaluate((node) => {
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
    return Math.round(node.getBoundingClientRect().height / lineHeight);
  });
  expect(paragraphLines).toBe(2);
});

test('markdown text stays readable in dark mode', async ({ page }) => {
  const preview = await openEditorPreview(page);

  const colors = await preview.evaluate((root) => {
    document.documentElement.classList.add('dark');
    return {
      text: getComputedStyle(root.querySelector('p')!).color,
      background: getComputedStyle(document.body).backgroundColor,
      foreground: getComputedStyle(document.body).color,
    };
  });

  expect(colors.text).not.toBe(colors.background);
  expect(colors.text).toBe(colors.foreground);
});
