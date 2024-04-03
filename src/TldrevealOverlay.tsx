import React, { Fragment, useEffect, useState } from "react";

import { Api as RevealApi } from "reveal.js"

import { 
    Box,
    Editor,
    StoreSnapshot,
    TLRecord,
    TLPageId,
    Tldraw,
    TldrawImage,
    DefaultQuickActions,
    DefaultQuickActionsContent,
    TldrawUiMenuItem,
    AlignMenuItems,
    DistributeMenuItems,
    EditLinkMenuItem,
    GroupOrUngroupMenuItem,
    ReorderMenuItems,
    RotateCWMenuItem,
    StackMenuItems,
    DefaultActionsMenu,
    ReadonlySharedStyleMap
} from "tldraw"

import "tldraw/tldraw.css"

// TODO:
// - Persistence (temporary and saved file)
//   - persistenceKey doesn't work, because we override snapshot
//   - Only persist to localStorage if the deck has an id
//   - https://tldraw.dev/examples/data/assets/local-storage
//   - What the .com version does:
//     - https://github.dev/tldraw/tldraw/blob/1ba9cbfa2afab156da762dcc21425bc03936764f/apps/dotcom/src/utils/useFileSystem.tsx
//     - serializeTldrawJsonBlob(editor.store)
//     - parseAndLoadDocument(editor, await file.text(), msg, addToast)
//       - Is marked @internal, but maybe we can use it too. Does some checking and migration, so might be nice.
// - Use `data-id` or `id` of slide (if available), to preserve drawings when order changes
//   - How to handle un-id-ed slides? In a vertical stack use the stack id + index?
// - Hide while transitioning (or better: animate the canvas with the slide)
// - Fix the small jump when switching to SVG
// - Fix the overlay in scroll mode

type SlideIndex = `${number}.${number}`

function makeInt(numOrStr: number | string) : number {
    if (typeof numOrStr === "string") {
        return parseInt(numOrStr)
    } else {
        return numOrStr
    }
}

function CustomQuickActions({ onClose }) {
    return (
        <DefaultQuickActions>
            <TldrawUiMenuItem id="close" icon="cross" onSelect={() => onClose() } />
            <DefaultQuickActionsContent />
        </DefaultQuickActions>
    )
}

function CustomActionsMenu() {
    return (
        <DefaultActionsMenu>
            <AlignMenuItems />
            <DistributeMenuItems />
            <StackMenuItems />
            <ReorderMenuItems />
            <RotateCWMenuItem />
            <EditLinkMenuItem />
            <GroupOrUngroupMenuItem />
        </DefaultActionsMenu>
    )
}

export function TldrevealOverlay({ reveal, container }: { reveal: RevealApi, container: HTMLDivElement }) {
    const [editor, setEditor] = useState<Editor | undefined>()
	const [snapshot, setSnapshot] = useState<StoreSnapshot<TLRecord>>()
    const [sharedStyles, setSharedStyles] = useState<ReadonlySharedStyleMap>()
    const [slidePageMap, setSlidePageMap] = useState<{ [Slide: SlideIndex]: TLPageId }>({})

    const [isShown, setIsShown] = useState(true)
	const [isEditing, setIsEditing] = useState(false)

    const [currentSlide, setCurrentSlide] = useState<SlideIndex>("0.0")
    const [presentationScale, setPresentationScale] = useState<number>(1)

    const slideWidth = makeInt(reveal.getConfig().width)
    const slideHeight = makeInt(reveal.getConfig().height)
    const bounds = new Box(0, 0, slideWidth, slideHeight)

    function tryGetId(element: HTMLElement) : string | undefined {
        return element.getAttribute("data-id") || element.id || undefined
    }

    const deckId : string | undefined = 
        tryGetId(reveal.getSlidesElement()) || tryGetId(reveal.getRevealElement())

    function saveEditor(state = { editor }) {
        if (!state.editor) {
            console.warn("Trying to save editor, but no editor found!")
        } else {
            setSnapshot(state.editor.store.getSnapshot())
            setSharedStyles(state.editor.getSharedStyles())
        }
    }

    function show() {
        setIsShown(true)
    }

    function hide(state = { editor }) {
        if (editor !== undefined) {
            saveEditor(state)
        }
        setIsShown(false)
    }

    function startEditor() {
        setIsEditing(true)
    }

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        editor.setCurrentTool("draw")
        if (sharedStyles !== undefined) {
            for (const [ styleProp, sharedStyle ] of sharedStyles.entries()) {
                if (sharedStyle.type === "shared") {
                    editor.setStyleForNextShapes(styleProp, sharedStyle.value)
                }
            }
        }
        editor.updateInstanceState({ 
            isDebugMode: false,
            exportBackground: false
        })
        syncEditor({ editor, slidePageMap, currentSlide, presentationScale })
    }

    function stopEditor(state = { editor }) {
        saveEditor(state)
        setIsEditing(false)
        setEditor(undefined)
    }

    useEffect(() => {
        if (isShown && isEditing) {
            container.classList.remove("tldreveal-inactive")
            container.setAttribute("data-prevent-swipe", "true")
        } else {
            if (!container.classList.contains("tldreveal-inactive")) {
                container.classList.add("tldreveal-inactive")
            }
            if (container.hasAttribute("data-prevent-swipe")) {
                container.removeAttribute("data-prevent-swipe")
            }
        }
    }, [ isShown, isEditing ])

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
    
    const handleOverviewshown = state => _event => {
        hide(state)
    }
    
    function handleOverviewhidden(_event) {
        show()
    }

    const handlePaused = state => _event => {
        hide(state)
    }

    function handleResumed(_event) {
        show()
    }
    
    useEffect(() => {
        reveal.on("ready", handleReady)
        // beforeslidechange
        // slidetransitionend
        reveal.on("slidechanged", handleSlidechanged)
        reveal.on("resize", handleResize)
        reveal.on("overviewhidden", handleOverviewhidden)
        reveal.on("resumed", handleResumed)
        return () => {
            reveal.off("ready", handleReady)
            reveal.off("slidechanged", handleSlidechanged)
            reveal.off("resize", handleResize)
            reveal.off("overviewhidden", handleOverviewhidden)
            reveal.off("resumed", handleResumed)
        }
    }, [])

    useEffect(() => {
        const handleOverviewshown_ = handleOverviewshown({ editor })
        const handlePaused_ = handlePaused({ editor })

        reveal.on("overviewshown", handleOverviewshown_)
        reveal.on("paused", handlePaused_)
        return () => {
            reveal.off("overviewshown", handleOverviewshown_)
            reveal.off("paused", handlePaused_)        
        }
    }, [ editor ])

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

    return (
        <Fragment>
            { (isShown && isEditing) ?
                <Tldraw
                    forceMobile
                    snapshot={snapshot}
                    onMount={onTldrawMount}
                    components={{
                        MenuPanel: null,
                        ActionsMenu: CustomActionsMenu,
                        QuickActions: () => <CustomQuickActions onClose={stopEditor} />
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
                        },
                        // Remove actions related to zooming
                        actions(editor, actions) {
                            delete actions["select-zoom-tool"]
                            delete actions["zoom-in"]
                            delete actions["zoom-out"]
                            delete actions["zoom-to-100"]
                            delete actions["zoom-to-fit"]
                            delete actions["zoom-to-selection"]
                            delete actions["back-to-content"]
                            return actions
                        }
                    }}
                    >
                </Tldraw>
            : (isShown && slidePageMap[currentSlide] !== undefined) &&
                <TldrawImage
                    snapshot={snapshot}
                    pageId={slidePageMap[currentSlide]}
                    background={false}
                    bounds={bounds}
                    padding={0}
                    scale={presentationScale}
                    format="svg" />
            }
        </Fragment>
    )
}
