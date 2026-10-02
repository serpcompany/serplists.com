export const formatBytes = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
};

export const inferEmbedProvider = (url: string) => {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YouTube";
  if (value.includes("vimeo.com")) return "Vimeo";
  if (value.includes("loom.com")) return "Loom";
  if (value.includes("figma.com")) return "Figma";
  if (value.includes("maps.google")) return "Google Maps";
  return "Embedded Content";
};
