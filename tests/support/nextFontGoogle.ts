type FontOptions = { variable?: string };

const font = (family: string) => (options: FontOptions = {}) => ({
  className: `font-${family}`,
  style: { fontFamily: family },
  variable: options.variable ?? `--font-${family}`,
});

const geist = font('geist');
const geistMono = font('geist-mono');

export { geist as Geist, geistMono as Geist_Mono };
