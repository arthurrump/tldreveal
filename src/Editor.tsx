import { 
    Box,
    Tldraw,
    react,
    useEditor
} from "tldraw"
import "tldraw/tldraw.css"

import { Api as RevealApi } from "reveal.js"

import React, { useEffect } from "react";

import "./Editor.css"

export function Editor({ reveal }: { reveal: RevealApi }) {
    return (
        <Tldraw>
            <Configuration reveal={reveal} />
            <ConstrainCamera />
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

function ConstrainCamera() {
    const editor = useEditor()

    useEffect(() => {
        function constrainCamera(camera: { x: number; y: number; z: number }): {
            x: number
            y: number
            z: number
        } {
            const viewportBounds = editor.getViewportScreenBounds()

            const usableViewport = new Box(
                0,
                0,
                viewportBounds.w,
                viewportBounds.h
            )

            return {
                x: usableViewport.midX,
                y: usableViewport.midY,
                z: 1,
            }
        }

        const removeOnChange = editor.sideEffects.registerBeforeChangeHandler(
            'camera',
            (_prev, next) => {
                const constrained = constrainCamera(next)
                if (constrained.x === next.x && constrained.y === next.y && constrained.z === next.z)
                    return next
                return { ...next, ...constrained }
            }
        )

        const removeReaction = react('update camera when viewport/shape changes', () => {
            const original = editor.getCamera()
            const constrained = constrainCamera(original)
            if (
                original.x === constrained.x &&
                original.y === constrained.y &&
                original.z === constrained.z
            ) {
                return
            }

            // this needs to be in a microtask for some reason, but idk why
            queueMicrotask(() => editor.setCamera(constrained))
        })

        return () => {
            removeOnChange()
            removeReaction()
        }
    }, [editor])

    return null
}
