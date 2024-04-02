import React from "react"
import ReactClient from "react-dom/client"

import { Plugin as RevealPlugin, Api as RevealApi } from "reveal.js"

import { TldrevealOverlay } from "./TldrevealOverlay"

import "./style.css"

function init(reveal: RevealApi) {

    reveal.on("ready", onRevealReady)

    function onRevealReady(_event) {
        // Create container element overlaid on the slides
        const container = document.createElement("div")
        container.classList.add("tldreveal", "tldreveal-inactive")
        reveal.getRevealElement()!.appendChild(container)

        // Start Swordpoing inside the container
        const reactRoot = ReactClient.createRoot(container)
        reactRoot.render(React.createElement(TldrevealOverlay, { reveal, container }));
    }
}

export function Tldreveal() : RevealPlugin {
    return {
        id: "tldreveal",
        init
    }
}
