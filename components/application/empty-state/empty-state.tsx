//
// TRIMMED, and the reason is measured. Upstream this file also exports
// Illustration, FileTypeIcon, AvatarRadius, AvatarRow and AvatarGrid, and
// imports `@untitledui/file-icons` (2.5 MB on disk) and the four illustration
// sets to do it — at the module's top level, so they ship whether or not
// anything renders them. Adopting the component for five "no cards yet"
// sentences put a new 460 kB chunk on the client, 62 kB gzipped, holding 1,843
// SVG paths. Total client JS went 562.7 kB gzipped to 655.3 kB.
//
// Card Orb uses Root, Header, FeaturedIcon, Description and Footer. The five
// asset-heavy parts are cut, with their imports. Re-add them from
// `scripts/untitled-add.mjs` if something ever needs one, and re-measure.
//
// This is a deliberate divergence from upstream on top of ADR-0062's
// leave-vendored-code-alone rule, on the same footing as the crash fixes in
// `base/file-upload-trigger` (ADR-0066): the component as vendored is not
// usable here at an acceptable cost.
"use client";

import type { ComponentPropsWithRef } from "react";
import { createContext, useContext } from "react";
import { SearchLg } from "@untitledui/icons";
import { FeaturedIcon as FeaturedIconbase } from "@/components/foundations/featured-icon/featured-icon";
// `./circle` directly, not the `background-patterns` barrel. That barrel is a
// lookup table over all four patterns, so importing it to draw one of them
// shipped the other three: 1,082 SVG paths, 124 kB raw / 20.8 kB gzipped,
// almost all of it `grid-check`. `Header` only ever defaults to "circle" and
// nothing in this app passes another, so the `pattern` prop is narrowed to
// "circle" | "none" below. Widening it again means importing the barrel again
// — and re-measuring.
import { Circle as BackgroundPattern } from "@/components/shared-assets/background-patterns/circle";
import { cx } from "@/utils/cx";

interface RootContextProps {
    size?: "sm" | "md" | "lg";
}

const RootContext = createContext<RootContextProps>({ size: "lg" });

interface RootProps extends ComponentPropsWithRef<"div">, RootContextProps {}

const Root = ({ size = "lg", ...props }: RootProps) => {
    return (
        <RootContext.Provider value={{ size }}>
            <div {...props} className={cx("mx-auto flex w-full max-w-lg flex-col items-center justify-center", props.className)} />
        </RootContext.Provider>
    );
};

const FeaturedIcon = ({ color = "gray", theme = "modern", icon = SearchLg, size, ...props }: ComponentPropsWithRef<typeof FeaturedIconbase>) => {
    const { size: rootSize } = useContext(RootContext);

    return <FeaturedIconbase {...props} {...{ color, theme, icon }} size={!size && rootSize === "lg" ? "xl" : size || "lg"} />;
};




interface HeaderProps extends ComponentPropsWithRef<"div"> {
    pattern?: "none" | "circle";
    patternSize?: "sm" | "md" | "lg";
}

const Header = ({ pattern = "circle", patternSize = "md", ...props }: HeaderProps) => {
    const { size } = useContext(RootContext);
    // Upstream also widened this margin when an `Illustration` was the child.
    // That part is cut (see the note at the top), so there is nothing to check.
    const hasIllustration = false;

    return (
        <header
            {...props}
            className={cx("relative mb-4", (size === "md" || size === "lg") && "mb-5", hasIllustration && size === "lg" && "mb-6!", props.className)}
        >
            {pattern !== "none" && (
                <BackgroundPattern size={patternSize as "sm" | "md"} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            )}
            {props.children}
        </header>
    );
};

const Content = (props: ComponentPropsWithRef<"div">) => {
    const { size } = useContext(RootContext);

    return (
        <main
            {...props}
            className={cx(
                "z-10 mb-6 flex w-full max-w-88 flex-col items-center justify-center gap-1",
                (size === "md" || size === "lg") && "mb-8 gap-2",
                props.className,
            )}
        />
    );
};

const Footer = (props: ComponentPropsWithRef<"div">) => {
    return <footer {...props} className={cx("z-10 flex gap-3", props.className)} />;
};

const Title = (props: ComponentPropsWithRef<"h1">) => {
    const { size } = useContext(RootContext);

    return (
        <h1
            {...props}
            className={cx(
                "text-md font-semibold text-primary",
                size === "md" && "text-lg font-semibold",
                size === "lg" && "text-xl font-semibold",
                props.className,
            )}
        />
    );
};

const Description = (props: ComponentPropsWithRef<"p">) => {
    const { size } = useContext(RootContext);

    return <p {...props} className={cx("text-center text-sm text-tertiary", size === "lg" && "text-md", props.className)} />;
};

const EmptyState = Root as typeof Root & {
    Title: typeof Title;
    Header: typeof Header;
    Footer: typeof Footer;
    Content: typeof Content;
    Description: typeof Description;
    FeaturedIcon: typeof FeaturedIcon;
};

EmptyState.Title = Title;
EmptyState.Header = Header;
EmptyState.Footer = Footer;
EmptyState.Content = Content;
EmptyState.Description = Description;
EmptyState.FeaturedIcon = FeaturedIcon;

export { EmptyState };
