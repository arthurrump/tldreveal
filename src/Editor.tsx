import { Tldraw, useEditor } from "tldraw"
import "tldraw/tldraw.css"

import { Api as RevealApi } from "reveal.js"

import React, { useEffect } from "react";

import "./Editor.css"

export function Editor({ reveal }: { reveal: RevealApi }) {
    return (
        <Tldraw>
            <Configuration reveal={reveal} />
        </Tldraw>
    )
}

function Configuration({ reveal }: { reveal: RevealApi }) {
    const editor = useEditor()

    useEffect(() => {
        editor.setCurrentTool("draw")

        const startState = reveal.getState()
        editor.getCurrentPage().name = `${startState.indexh}.${startState.indexv}`

        reveal.on("slidechanged", (event: any) => {
            const name = `${event.indexh}.${event.indexv}`
            let page = editor.getPages().find(p => p.name === name)
            if (page === undefined) {
                editor.createPage({ name })
                page = editor.getPages().find(p => p.name === name)!
            }
            editor.setCurrentPage(page)
        })
    }, [])

    return null
}
