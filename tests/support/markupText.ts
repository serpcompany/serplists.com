export const markupText = (markup: string): string => {
  let text = markup;
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text;
};
