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

// TODO:
// - Clean up surrounding UI
//   - See the Custom UI example https://github.dev/tldraw/tldraw/blob/main/apps/examples/src/examples/custom-ui/CustomUiExample.tsx
//   - and the exploded version https://github.dev/tldraw/tldraw/blob/main/apps/examples/src/examples/exploded/ExplodedExample.tsx
// - Restrict Canvas to the slide and handle scaling
//   - https://github.dev/tldraw/tldraw/blob/main/apps/examples/src/examples/inset-canvas/InsetCanvasExample.tsx
// - Persistence (temporary and saved file)
// - Hide all when in overview or paused
// - Copy full Canvas as SVG to easily paste in the source

type SlideIndex = `${number}.${number}`

export function SwordpointEditor({ reveal }: { reveal: RevealApi }) {
    const [editor, setEditor] = useState<Editor | undefined>()
	const [snapshot, setSnapshot] = useState<StoreSnapshot<TLRecord>>()
    const [slidePageMap, setSlidePageMap] = useState<{ [Slide: SlideIndex]: TLPageId }>({})

    const [isShown, setIsShown] = useState(true)
	const [isEditing, setIsEditing] = useState(false)

    const [currentSlide, setCurrentSlide] = useState<SlideIndex>("0.0")
    const [presentationScale, setPresentationScale] = useState<number>(1)

    function startEditor() {
        setIsEditing(true)
        document.getElementsByClassName("swordpoint-overlay")[0].classList.remove("swordpoint-inactive")
    }

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        editor.setCurrentTool("draw")
        editor.updateInstanceState({ isDebugMode: false })
        syncEditorPage({ editor, slidePageMap, currentSlide })
    }

    function stopEditor(state = { isEditing, editor }) {
        if (!state.editor) {
            console.warn("Stopping editor, but no editor found!")
        } else {
            setSnapshot(state.editor.store.getSnapshot())
        }
        setIsEditing(false)
        setEditor(undefined)
        document.getElementsByClassName("swordpoint-overlay")[0].classList.add("swordpoint-inactive")
    }

    const handleKeydown = (state = { isEditing, editor }) => (event: KeyboardEvent) => {
        if (state.isEditing && event.key === "Escape") {
            stopEditor(state)
            event.stopImmediatePropagation()
        } else if (!state.isEditing && event.key === "d") {
            startEditor()
            event.stopImmediatePropagation()
        }
    }

    useEffect(() => {
        const state = { isEditing, editor }
        const handleKeydown_ = handleKeydown(state)

        window.addEventListener("keydown", handleKeydown_, true)
        return () => {
            window.removeEventListener("keydown", handleKeydown_, true)
        }
    }, [ isEditing, editor ])

    function handleReady(event) {
        setCurrentSlide(`${event.indexh}.${event.indexv}`)
    }
    
    function handleSlidechanged(event) {
        setCurrentSlide(`${event.indexh}.${event.indexv}`)
    }
    
    function handleResize(event) {
        setPresentationScale(event.scale)
    }
    
    function handleOverviewshown(_event) {
        setIsShown(false)
    }
    
    function handleOverviewhidden(_event) {
        setIsShown(true)
    }
    
    useEffect(() => {
        reveal.on("ready", handleReady)
        reveal.on("slidechanged", handleSlidechanged)
        reveal.on("resize", handleResize)
        reveal.on("overviewshown", handleOverviewshown)
        reveal.on("overviewhidden", handleOverviewhidden)
        return () => {
            reveal.off("ready", handleReady)
            reveal.off("slidechanged", handleSlidechanged)
            reveal.off("resize", handleResize)
            reveal.off("overviewshown", handleOverviewshown)
            reveal.off("overviewhidden", handleOverviewhidden)
        }
    }, [])

    function syncEditorPage(state = { editor, slidePageMap, currentSlide }) {
        if (state.editor) {
            let pageId = state.slidePageMap[currentSlide]
            if (pageId === undefined) {
                state.editor.createPage({ name: currentSlide })
                const pages = state.editor.getPages()
                pageId = pages[pages.length - 1].id
                setSlidePageMap({ ...state.slidePageMap, [currentSlide]: pageId })
            }
            state.editor.setCurrentPage(pageId)
        }
    }

    useEffect(() => {
        syncEditorPage({ editor, slidePageMap, currentSlide })
    }, [ editor, slidePageMap, currentSlide ])

    if (isShown) {
        if (isEditing) {
            return (
                <Tldraw
                    snapshot={snapshot}
                    onMount={onTldrawMount}
                >
                    <ConstrainCamera />
                </Tldraw>
            )
        } else if (slidePageMap[currentSlide] !== undefined) {
            return (
                <TldrawImage
                    snapshot={snapshot}
                    pageId={slidePageMap[currentSlide]}
                    background={false}
                    // bounds={viewportPageBounds}
                    padding={0}
                    scale={presentationScale}
                    format="svg" />
            )
        }
    } else {
        return null
    }
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
