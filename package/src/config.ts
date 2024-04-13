import { 
    TLDefaultColorStyle,
    TLDefaultSizeStyle,
    TLDefaultDashStyle,
    TLDefaultFillStyle,
    TLDefaultFontStyle, 
    TLDefaultHorizontalAlignStyle,
    TLDefaultVerticalAlignStyle,
    DefaultColorStyle,
    DefaultSizeStyle,
    DefaultDashStyle,
    DefaultFillStyle,
    DefaultFontStyle,
    DefaultHorizontalAlignStyle,
    DefaultVerticalAlignStyle
} from "tldraw"

import { Api as RevealApi } from "reveal.js"

export const defaultStyleProps = {
    color: DefaultColorStyle,
    size: DefaultSizeStyle,
    dash: DefaultDashStyle,
    fill: DefaultFillStyle,
    font: DefaultFontStyle,
    horizontalAlign: DefaultHorizontalAlignStyle,
    verticalAlign: DefaultVerticalAlignStyle
}

export interface TldrevealConfig {
    /// Configure the default drawing styles for tldraw, used when the editor is
    /// first started.
    defaultStyles: {
        color?: TLDefaultColorStyle
        size?: TLDefaultSizeStyle
        dash?: TLDefaultDashStyle
        fill?: TLDefaultFillStyle
        font?: TLDefaultFontStyle
        horizontalAlign?: TLDefaultHorizontalAlignStyle
        verticalAlign?: TLDefaultVerticalAlignStyle
    }

    /// Show a warning when the `disableLayout` option is enabled. Set to
    /// `false` to silence the warning when you have provided your own style
    /// overrides. Defaults to `true`. 
    disableLayoutWarning: boolean

    /// Whether the tldraw UI is rendered in dark mode by default. Set to
    /// `false` if you use a light theme for Reveal.js, defaults to `true`.
    isDarkMode: boolean
    /// Allow automatic switching between dark and light mode for slides with a
    /// custom data-background attribute. Defaults to `true`.
    automaticDarkMode: boolean

    /// Use localStorage to store drawing state in the browser. Requires an `id`
    /// or `data-tlid` attribute on the .reveal or .slides element to determine
    /// the identity of the slide deck. Defaults to `true`, if that id is found.
    useLocalStorage: boolean
    /// Load drawing state from a URL. Set to `false` to disable this option,
    /// set to `"auto"` to automatically determine the URL from the deck URL or
    /// set to `{ url: "/path/to/saved.tldrev" }` to supply a custom location.
    /// The automatic mode replaces `.html` or `.html` in the slide path with
    /// `.tldrev` if the path ends with one of those extensions. Else it appends
    /// `/index.tldrev`.
    snapshotUrl: false | "auto" | { url: string }
}

declare global {
    namespace Reveal {
        interface Options {
            tldreveal?: Partial<TldrevealConfig>
        }
    }
}

export const defaultTldrevealConfig: TldrevealConfig = {
    defaultStyles: {},
    disableLayoutWarning: true,
    isDarkMode: true,
    automaticDarkMode: true,
    useLocalStorage: true,
    snapshotUrl: false
}

export function getTldrevealConfig(reveal: RevealApi) {
    return { ...defaultTldrevealConfig, ...reveal.getConfig().tldreveal }
}
