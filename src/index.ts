import { Plugin as RevealPlugin, Api as RevealApi } from "reveal.js"
import React from "react"
import ReactClient from "react-dom/client"
import { Editor } from "./Editor"

function init(reveal: RevealApi) {

    reveal.on("ready", onRevealReady)

    function onRevealReady(_event) {
        const swordpointElement = document.createElement("div")
        swordpointElement.classList.add("swordpoint-overlay")
        swordpointElement.setAttribute("data-prevent-swipe", "true")
        reveal.getRevealElement()?.appendChild(swordpointElement)
        const reactRoot = ReactClient.createRoot(swordpointElement)
        reactRoot.render(React.createElement(Editor, { reveal }));
    }
}

export function Swordpoint() : RevealPlugin {
    return {
        id: "swordpoint",
        init
    }
}
