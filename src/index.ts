import { Plugin as RevealPlugin, Api as RevealApi } from "reveal.js"
import React from "react"
import ReactClient from "react-dom/client"
import { Excalidraw } from "@excalidraw/excalidraw"
import { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types"
// Looks like tldraw has better support for not allowing the Canvas to be moved:
// https://github.com/tldraw/tldraw/issues/1946#issuecomment-2009368099

function init(reveal: RevealApi) {
    let excalidraw: ExcalidrawImperativeAPI

    reveal.on("ready", onRevealReady)

    function onRevealReady(_event) {
        const swordpointElement = document.createElement("div")
        swordpointElement.style.width = "100%";
        swordpointElement.style.height = "100%";
        swordpointElement.style.zIndex = "100";
        reveal.getSlidesElement()?.appendChild(swordpointElement)
        const reactRoot = ReactClient.createRoot(swordpointElement)
        reactRoot.render(React.createElement(Excalidraw, {
            excalidrawAPI: this.onExcalidrawReady
        }))
    }

    function onExcalidrawReady(excalidraw_: ExcalidrawImperativeAPI) {
        excalidraw = excalidraw_

        // Get the current state for the current slide
        // this.excalidraw.updateScene

        // Subscribe
        // this.reveal.on("slidechanged", event => {
        //     // Clear the current page
        // })
    
        // this.reveal.on("slidetransitionend", event => {
        //     // Restore excalidraw for event.indexh, event.indexv
        // })
    }
}

export function Swordpoint() : RevealPlugin {
    return {
        id: "swordpoint",
        init
    }
}
