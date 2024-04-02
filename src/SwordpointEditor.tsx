import { 
    Box,
    Editor,
    StoreSnapshot,
    TLRecord,
    TLPageId,
    Tldraw,
    TldrawImage
} from "tldraw"
import "tldraw/tldraw.css"

import { Api as RevealApi } from "reveal.js"

import React, { useEffect, useState } from "react";

import "./SwordpointEditor.css"

// TODO:
// - Persistence (temporary and saved file)
// - Hide while transitioning
// - Copy full Canvas as SVG to easily paste in the source
// - Store the state when hiding (now in-progress drawing is lost)
// - Keep the active drawing color etc. when transitioning in/out editing
// - Fix the small jump when switching to SVG

type SlideIndex = `${number}.${number}`

function makeInt(numOrStr: number | string) : number {
    if (typeof numOrStr === "string") {
        return parseInt(numOrStr)
    } else {
        return numOrStr
    }
}

export function SwordpointEditor({ reveal }: { reveal: RevealApi }) {
    const [editor, setEditor] = useState<Editor | undefined>()
	const [snapshot, setSnapshot] = useState<StoreSnapshot<TLRecord>>()
    const [slidePageMap, setSlidePageMap] = useState<{ [Slide: SlideIndex]: TLPageId }>({})

    const [isShown, setIsShown] = useState(true)
	const [isEditing, setIsEditing] = useState(false)

    const [currentSlide, setCurrentSlide] = useState<SlideIndex>("0.0")
    const [presentationScale, setPresentationScale] = useState<number>(1)

    const slideWidth = makeInt(reveal.getConfig().width)
    const slideHeight = makeInt(reveal.getConfig().height)
    const bounds = new Box(slideWidth / 2, slideHeight / 2, slideWidth, slideHeight)

    function startEditor() {
        setIsEditing(true)
        document.getElementsByClassName("swordpoint-overlay")[0].classList.remove("swordpoint-inactive")
    }

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        editor.setCurrentTool("draw")
        editor.updateInstanceState({ isDebugMode: false })
        syncEditor({ editor, slidePageMap, currentSlide, presentationScale })
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

    function handlePaused(_event) {
        setIsShown(false)
    }

    function handleResumed(_event) {
        setIsShown(true)
    }
    
    useEffect(() => {
        reveal.on("ready", handleReady)
        // beforeslidechange
        // slidetransitionend
        reveal.on("slidechanged", handleSlidechanged)
        reveal.on("resize", handleResize)
        reveal.on("overviewshown", handleOverviewshown)
        reveal.on("overviewhidden", handleOverviewhidden)
        reveal.on("paused", handlePaused)
        reveal.on("resumed", handleResumed)
        return () => {
            reveal.off("ready", handleReady)
            reveal.off("slidechanged", handleSlidechanged)
            reveal.off("resize", handleResize)
            reveal.off("overviewshown", handleOverviewshown)
            reveal.off("overviewhidden", handleOverviewhidden)
            reveal.off("paused", handlePaused)
            reveal.off("resumed", handleResumed)
        }
    }, [])

    function syncEditor(state = { editor, slidePageMap, currentSlide, presentationScale }) {
        if (state.editor) {
            // Find the correct pageId, or create it if there isn't one
            let pageId = state.slidePageMap[currentSlide]
            if (pageId === undefined) {
                state.editor.createPage({ name: currentSlide })
                const pages = state.editor.getPages()
                pageId = pages[pages.length - 1].id
                setSlidePageMap({ ...state.slidePageMap, [currentSlide]: pageId })
            }

            // Navigate to the correct page if we're not there yet
            if (state.editor.getCurrentPageId() !== pageId) {
                state.editor.setCurrentPage(pageId)
            }

            // Set the correct zoom and prevent further movement
            state.editor.updateInstanceState({ canMoveCamera: true })
            state.editor.zoomToBounds(bounds, { inset: 0 })
            state.editor.updateInstanceState({ canMoveCamera: false })
        }
    }

    useEffect(() => {
        syncEditor({ editor, slidePageMap, currentSlide, presentationScale })
    }, [ editor, slidePageMap, currentSlide, presentationScale ])

    if (isShown) {
        if (isEditing) {
            return (
                <Tldraw
                    forceMobile
                    snapshot={snapshot}
                    onMount={onTldrawMount}
                    components={{
                        MenuPanel: null
                    }}
                    overrides={{
                        tools(editor, tools) {
                            // Remove the keyboard shortcut for the hand tool
                            tools.hand.kbd = undefined
                            return tools
                        },
                        toolbar(editor, toolbar) {
                            // Remove the hand tool from the toolbar
                            const handIndex = toolbar.findIndex(t => t.id === "hand")
                            if (handIndex !== -1)
                                toolbar.splice(handIndex, 1)
                            return toolbar
                        }
                    }}
                    >
                </Tldraw>
            )
        } else if (slidePageMap[currentSlide] !== undefined) {
            return (
                <TldrawImage
                    snapshot={snapshot}
                    pageId={slidePageMap[currentSlide]}
                    background={false}
                    bounds={bounds}
                    padding={0}
                    scale={presentationScale}
                    format="svg" />
            )
        }
    } else {
        return null
    }
}
