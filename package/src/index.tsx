import React from "react"
import ReactClient from "react-dom/client"

import { Plugin as RevealPlugin, Api as RevealApi } from "reveal.js"

import "./config"
import { TldrevealOverlay } from "./TldrevealOverlay"

import "./style.css"

function init(reveal: RevealApi) {

    if (reveal.getConfig().view === "scroll") {
        console.error(
            "tldreveal does not work in scroll view.",
            "Please disable the `view: 'scroll'` option in your Reveal.js configuration."
        )
        return
    }

    if (reveal.getConfig().scrollActivationWidth) {
        console.warn(
            "Reveal.js is configured to switch to scroll view for mobile-sized viewports.",
            "Note that tldreveal will crash when scroll view is enabled.",
            "To disable scroll view on all sizes, set `scrollActivationWidth: null` in your Reveal.js configuration.",
            "See https://revealjs.com/scroll-view/#automatic-activation."
        )
    }

    if (reveal.getConfig().disableLayout && reveal.getConfig().tldreveal.disableLayoutWarning) {
        console.warn(
            "tldreveal assumes default Reveal.js layout to scale drawings with the slides.",
            "If you use manual positioning for your slides, you should manually position the .tl-canvas element accordingly.",
            "Set the configuration option `tldreveal.disableLayoutWarning: false` to disable this warning."
        )
    }

    reveal.on("ready", onRevealReady)

    function onRevealReady(_event) {
        // Create container element overlaid on the slides
        const container = document.createElement("div")
        container.classList.add("tldreveal", "tldreveal-inactive")
        reveal.getRevealElement()!.appendChild(container)

        // Start Swordpoing inside the container
        const reactRoot = ReactClient.createRoot(container)
        reactRoot.render(
            <TldrevealOverlay reveal={reveal} container={container} />
        );
    }
}

export function Tldreveal() : RevealPlugin {
    return {
        id: "tldreveal",
        init
    }
}
