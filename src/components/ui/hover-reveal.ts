// A control that appears on hover must also appear when the keyboard reaches it or its
// group, and on touch screens, which cannot hover (docs/DESIGN.md). An invisible focused
// button hides its focus ring too, so Enter would act unseen.
export const HOVER_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";
