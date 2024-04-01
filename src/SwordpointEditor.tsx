import { 
    Box,
    Editor,
    StoreSnapshot,
    TLRecord,
    TLPageId,
    Tldraw,
    TldrawImage,
    react,
    useEditor
} from "tldraw"
import "tldraw/tldraw.css"

import { Api as RevealApi } from "reveal.js"

import React, { Fragment, useEffect, useState } from "react";

import "./SwordpointEditor.css"

interface SlideIndex {
    indexh: number
    indexv: number
}

export function SwordpointEditor({ reveal }: { reveal: RevealApi }) {
    const [editor, setEditor] = useState<Editor | undefined>()
	const [snapshot, setSnapshot] = useState<StoreSnapshot<TLRecord>>()
	const [currentPageId, setCurrentPageId] = useState<TLPageId | undefined>()
	const [viewportPageBounds, setViewportPageBounds] = useState(new Box(0, 0, 600, 400))

	const [isEditing, setIsEditing] = useState(false)

    const [presentationScale, setPresentationScale] = useState<number>(1)

	const format = "svg"
    const showBackground = false;

    function startEditor() {
        console.log("Starting editor")
        setIsEditing(true)
        document.getElementsByClassName("swordpoint-overlay")[0].classList.remove("swordpoint-inactive")
    }

    function onTldrawMount(editor: Editor) {
        console.log("Mounted tldraw, setting editor to", editor)
        setEditor(editor)
        editor.setCurrentTool("draw")
        editor.updateInstanceState({ isDebugMode: false })
        if (currentPageId) {
            editor.setCurrentPage(currentPageId)
        }
        if (viewportPageBounds) {
            editor.zoomToBounds(viewportPageBounds, { inset: 0 })
        }
    }

    function stopEditor(state) {
        console.log("Stopping editor")
        if (!state.editor) {
            console.warn("Stopping editor, but no editor found!")
        } else {
            setViewportPageBounds(state.editor.getViewportPageBounds())
            setCurrentPageId(state.editor.getCurrentPageId())
            setSnapshot(state.editor.store.getSnapshot())
        }
        setIsEditing(false)
        document.getElementsByClassName("swordpoint-overlay")[0].classList.add("swordpoint-inactive")
    }

    const handleKeydown = (state) => (event: KeyboardEvent) => {
        console.log("keydown:", event.key, "state:", state)
        if (state.isEditing && event.key === "Escape") {
            stopEditor(state)
            event.stopImmediatePropagation()
        } else if (!state.isEditing && event.key === "d") {
            startEditor()
            event.stopImmediatePropagation()
        }
    }

    useEffect(() => {
        function handleResize(event) {
            console.log("Presentation scaled:", event.scale)
            setPresentationScale(event.scale)
        }
        reveal.on("resize", handleResize)
        return () => {
            reveal.off("resize", handleResize)
        }
    }, [])

    useEffect(() => {
        const state = { isEditing, editor }
        const handleKeydown_ = handleKeydown(state)

        console.log("Update event handlers.", "state:", state)
        window.addEventListener("keydown", handleKeydown_, true)
        return () => {
            window.removeEventListener("keydown", handleKeydown_, true)
        }

        // reveal.on("slidechanged", (event: any) => {
        //     const name = `${event.indexh}.${event.indexv}`
        //     let page = editor.getPages().find(p => p.name === name)
        //     if (page === undefined) {
        //         editor.createPage({ name })
        //         page = editor.getPages().find(p => p.name === wname)!
        //     }
        //     editor.setCurrentPage(page)
        // })

        // reveal.on("overviewshown", event => {
        //     // Hide drawings
        //     stopEditor()
        // })

        // reveal.on("overviewhidden", event => {
        //     // Show drawings again
        // })

        // TODO: handle view
    }, [ isEditing, editor ])

    return (
        <Fragment>
            {isEditing ? (
                <Tldraw
                    snapshot={snapshot}
                    onMount={onTldrawMount}
                >
                    <ConstrainCamera />
                </Tldraw>
            ) : (
                <TldrawImage
                    snapshot={snapshot}
                    pageId={currentPageId}
                    background={showBackground}
                    bounds={viewportPageBounds}
                    padding={0}
                    scale={presentationScale}
                    format={format} />
            )}
        </Fragment>
    )
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
