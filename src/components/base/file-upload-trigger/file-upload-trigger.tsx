"use client";

import type { DetailedReactHTMLElement, HTMLAttributes, ReactNode } from "react";
import { Children, cloneElement, useRef } from "react";
// `filterDOMProps` from "@react-aria/utils" was the second thing stopping this
// file from running: that package is not a dependency of this project and is
// not in node_modules — react-aria-components bundles its own copy. It was
// called on `rest`, which is whatever is left of the props after the six named
// ones, and FileTriggerProps declares nothing else and does not extend an HTML
// element's props. So the result was `{}` at every possible call site, and
// removing it costs nothing and saves a dependency. A vendored file is
// otherwise left alone; this is one of the few crash fixes that earn an edit.

interface FileTriggerProps {
    /**
     * Specifies what mime type of files are allowed.
     */
    acceptedFileTypes?: Array<string>;
    /**
     * Whether multiple files can be selected.
     */
    allowsMultiple?: boolean;
    /**
     * Specifies the use of a media capture mechanism to capture the media on the spot.
     */
    defaultCamera?: "user" | "environment";
    /**
     * Handler when a user selects a file.
     */
    onSelect?: (files: FileList | null) => void;
    /**
     * The children of the component.
     */
    children: ReactNode;
    /**
     * Enables the selection of directories instead of individual files.
     */
    acceptDirectory?: boolean;
}

/**
 * A FileTrigger allows a user to access the file system with any pressable React Aria or React Spectrum component, or custom components built with usePress.
 */
export const FileTrigger = (props: FileTriggerProps) => {
    const { children, onSelect, acceptedFileTypes, allowsMultiple, defaultCamera, acceptDirectory } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);

    // Make sure that only one child is passed to the component.
    // `Children`, not `React.Children`: upstream reaches for a `React` global
    // this file never imports, so the component threw a ReferenceError the
    // first time anything rendered it. @ts-nocheck is why the
    // typechecker never said so, and no consumer is why nobody ran it.
    // A crash is not formatting, so this is a fix rather than a tidy-up.
    const clonableElement = Children.only(children);

    // Clone the child element and add an `onClick` handler to open the file dialog.
    const mainElement = cloneElement(clonableElement as DetailedReactHTMLElement<HTMLAttributes<HTMLElement>, HTMLElement>, {
        onClick: () => {
            if (inputRef.current?.value) {
                inputRef.current.value = "";
            }
            inputRef.current?.click();
        },
    });

    return (
        <>
            {mainElement}
            <input
                type="file"
                ref={inputRef}
                style={{ display: "none" }}
                accept={acceptedFileTypes?.toString()}
                onChange={(e) => onSelect?.(e.target.files)}
                capture={defaultCamera}
                multiple={allowsMultiple}
                // @ts-expect-error
                webkitdirectory={acceptDirectory ? "" : undefined}
            />
        </>
    );
};
