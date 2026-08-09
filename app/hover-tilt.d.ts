import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * `<hover-tilt>` as a JSX element.
 *
 * The package ships this declaration itself (hover-tilt/web-component), but it
 * writes it into the global `JSX` namespace, and React 19 moved its own to
 * `React.JSX`. So a global one is never consulted and `<hover-tilt>` is an
 * unknown intrinsic element. This is the same declaration, in the namespace
 * this project's React actually reads.
 *
 * Attributes only, in kebab case, which is what the custom element observes and
 * what React 19 passes straight through for a tag it does not know.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hover-tilt": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "tilt-factor"?: number | string;
        "tilt-factor-y"?: number | string;
        "scale-factor"?: number | string;
        "enter-delay"?: number | string;
        "exit-delay"?: number | string;
        shadow?: boolean | string;
        "shadow-blur"?: number | string;
        "blend-mode"?: string;
        "glare-intensity"?: number | string;
        "glare-hue"?: number | string;
        "glare-mask"?: string;
      };
    }
  }
}
