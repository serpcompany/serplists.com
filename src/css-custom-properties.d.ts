import "react";

declare module "react" {
  interface CSSProperties {
    "--skeleton-width"?: string;
    "--sidebar-width"?: string;
    "--sidebar-width-icon"?: string;
    "--normal-bg"?: string;
    "--normal-text"?: string;
    "--normal-border"?: string;
    "--border-radius"?: string;
  }
}
