import Reveal from "reveal.js"
import { Tldreveal } from "../src/index"

import RevealHighlight from "reveal.js/plugin/highlight/highlight.esm"
import "reveal.js/plugin/highlight/zenburn.css"

import "reveal.js/dist/reveal.css"
import "reveal.js/dist/theme/white.css"

Reveal.initialize({
    hash: true,
    scrollActivationWidth: null,
    plugins: [ Tldreveal, RevealHighlight ],
    tldreveal: {
        isDarkMode: false,
        snapshotUri: "auto"
    }
})
