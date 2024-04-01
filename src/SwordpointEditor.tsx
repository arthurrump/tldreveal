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

import React, { useEffect, useState } from "react";

import "./SwordpointEditor.css"

// TODO:
// - Persistence (temporary and saved file)
// - Hide all when in overview or paused
// - Hide while transitioning
// - Copy full Canvas as SVG to easily paste in the source
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
        editor.updateInstanceState({ canMoveCamera: true })
        editor.zoomToBounds(bounds, { inset: 0 })
        editor.updateInstanceState({ 
            isDebugMode: false,
            canMoveCamera: false
        })
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

    useEffect(() => {
        if (editor) {
            editor.updateInstanceState({ canMoveCamera: true })
            editor.zoomToBounds(bounds, { inset: 0 })
            editor.updateInstanceState({ canMoveCamera: false })
        }
    }, [ editor, presentationScale ])

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
