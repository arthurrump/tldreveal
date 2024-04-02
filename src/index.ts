import { Plugin as RevealPlugin, Api as RevealApi } from "reveal.js"
import React from "react"
import ReactClient from "react-dom/client"
import { SwordpointEditor } from "./SwordpointEditor"

function init(reveal: RevealApi) {

    reveal.on("ready", onRevealReady)

    function onRevealReady(_event) {
        // Create container element overlaid on the slides
        const container = document.createElement("div")
        container.classList.add("swordpoint-overlay", "swordpoint-inactive")
        reveal.getRevealElement()!.appendChild(container)

        // Start Swordpoing inside the container
        const reactRoot = ReactClient.createRoot(container)
        reactRoot.render(React.createElement(SwordpointEditor, { reveal, container }));
    }
}

export function Swordpoint() : RevealPlugin {
    return {
        id: "swordpoint",
        init
    }
}
