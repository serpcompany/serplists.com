// next/font/google is compiled by the Next.js build (it downloads the font and writes its
// CSS), so tests, which run the source directly, load this stand-in instead
// (vitest.config.ts). Each font returns the shape the root layout reads.
type FontOptions = { variable?: string };

const font = (family: string) => (options: FontOptions = {}) => ({
  className: `font-${family}`,
  style: { fontFamily: family },
  variable: options.variable ?? `--font-${family}`,
});

export const Geist = font('geist');
export const Geist_Mono = font('geist-mono');
