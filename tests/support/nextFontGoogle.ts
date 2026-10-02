type FontOptions = { variable?: string };

const font = (family: string) => (options: FontOptions = {}) => ({
  className: `font-${family}`,
  style: { fontFamily: family },
  variable: options.variable ?? `--font-${family}`,
});

export const Geist = font('geist');
export const Geist_Mono = font('geist-mono');
