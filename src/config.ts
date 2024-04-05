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
    defaultStyles: {
        color?: TLDefaultColorStyle
        size?: TLDefaultSizeStyle
        dash?: TLDefaultDashStyle
        fill?: TLDefaultFillStyle
        font?: TLDefaultFontStyle
        horizontalAlign?: TLDefaultHorizontalAlignStyle
        verticalAlign?: TLDefaultVerticalAlignStyle
    }

    disableLayoutWarning: boolean

    isDarkMode: boolean
    automaticDarkMode: boolean
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
    automaticDarkMode: true
}

export function getTldrevealConfig(reveal: RevealApi) {
    return { ...defaultTldrevealConfig, ...reveal.getConfig().tldreveal }
}
