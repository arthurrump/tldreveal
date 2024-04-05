import { Api as RevealApi } from "reveal.js"

export interface TldrevealConfig {
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
    isDarkMode: true,
    automaticDarkMode: true
}

export function getTldrevealConfig(reveal: RevealApi) {
    return { ...defaultTldrevealConfig, ...reveal.getConfig().tldreveal }
}
