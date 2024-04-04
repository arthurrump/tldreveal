import React, { Fragment, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Api as RevealApi } from "reveal.js"

import { 
    Box,
    Editor,
    Tldraw,
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
    createTLStore,
    defaultShapeUtils,
    throttle,
    PageRecordType
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
// - Hide while transitioning (or better: animate the canvas with the slide)
// - Somehow create overlaid pages for fragment navigation
// - Configuration options for default styles (colour, stroke width, etc)
// - Optional button to start drawing without a keyboard
// - Quick way to clear the current slide
// - Quick way to clear the entire presentation
// - Fix the overlay in scroll mode

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

export interface TldrevealOverlayProps {
    /// The instance of Reveal this overlaid on
    reveal: RevealApi
    /// The container element in which the overlay is rendered
    container: HTMLDivElement
}

export function TldrevealOverlay({ reveal, container }: TldrevealOverlayProps) {
    const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
    const [editor, setEditor] = useState<Editor | undefined>()

    const [isShown, setIsShown] = useState(false)
	const [isEditing, setIsEditing] = useState(false)

    const [currentSlide, setCurrentSlide] = useState<{ h: number, v: number }>(reveal.getIndices())

    const slideWidth = makeInt(reveal.getConfig().width)
    const slideHeight = makeInt(reveal.getConfig().height)
    const bounds = new Box(0, 0, slideWidth, slideHeight)

    function tryGetId(element: HTMLElement) : string | undefined {
        return element.getAttribute("data-tlid") || element.id || undefined
    }

    const deckId : string | undefined = useMemo(() => 
        tryGetId(reveal.getSlidesElement()) || tryGetId(reveal.getRevealElement())
    , [])

    function getSlideId(index: { h: number, v: number }) : string {
        const slideElement = reveal.getSlide(index.h, index.v)

        const givenId = tryGetId(slideElement)
        if (givenId !== undefined) {
            return givenId
        }

        if (index.v !== 0) {
            const stackId = tryGetId(slideElement.parentElement)
            if (stackId !== undefined) {
                return `${stackId}.${index.v}`
            }

            const firstInStackId = getSlideId({ h: index.h, v: 0 })
            if (firstInStackId.match("^\\d+\\.0$")) {
                return firstInStackId.replace(".0", `.${index.v}`)
            } else {
                return `${firstInStackId}.${index.v}`
            }
        }

        return `${index.h}.${index.v}`
    }

    const currentSlideId = useMemo(() => getSlideId(currentSlide), [ currentSlide ])

    useLayoutEffect(() => {
        let cleanup = () => {}

        if (deckId) {
            const storageKey = `TLDREVEAL_SNAPSHOT__${deckId}`

            const storedSnapshot = localStorage.getItem(storageKey)
            if (storedSnapshot) {
                try {
                    const snapshot = JSON.parse(storedSnapshot)
                    store.loadSnapshot(snapshot)
                } catch (error: any) {
                    console.error("Failed to load tldreveal snapshot from local storage: ", error.message, error)
                }
            }

            const cleanupStoreListen = store.listen(
                throttle(() => {
                    const snapshot = store.getSnapshot()
                    localStorage.setItem(storageKey, JSON.stringify(snapshot))
                }, 500)
            )

            cleanup = () => {
                cleanupStoreListen()
            }
        }

        setIsShown(true)

        return cleanup
    }, [ store ])

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        editor.setCurrentTool("draw")
        // TODO: Set up initial style
        // for (const [ styleProp, sharedStyle ] of sharedStyles.entries()) {
        //     if (sharedStyle.type === "shared") {
        //         editor.setStyleForNextShapes(styleProp, sharedStyle.value)
        //     }
        // }
        editor.updateInstanceState({ 
            isDebugMode: false,
            exportBackground: false
        })
        syncEditor({ editor, currentSlide })
    }

    useEffect(() => {
        container.classList.toggle("tldreveal-hidden", !isShown)

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

    function handleDKey() {
        setIsEditing(true)
    }

    const handleKeydown = (state = { isEditing }) => (event: KeyboardEvent) => {
        if (state.isEditing && event.key === "Escape") {
            setIsEditing(false)
            event.stopImmediatePropagation()
        }
    }

    useEffect(() => {
        const state = { isEditing }
        const handleKeydown_ = handleKeydown(state)

        reveal.addKeyBinding({ keyCode: 68, key: "D", description: "Enter drawing mode" }, handleDKey)
        window.addEventListener("keydown", handleKeydown_, true)
        return () => {
            reveal.removeKeyBinding(68)
            window.removeEventListener("keydown", handleKeydown_, true)
        }
    }, [ isEditing ])

    function handleReady(event) {
        setCurrentSlide({ h: event.indexh, v: event.indexv })
    }
    
    function handleSlidechanged(event) {
        setCurrentSlide({ h: event.indexh, v: event.indexv })
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
        reveal.on("overviewshown", handleOverviewshown)
        reveal.on("overviewhidden", handleOverviewhidden)
        reveal.on("paused", handlePaused)
        reveal.on("resumed", handleResumed)
        return () => {
            reveal.off("ready", handleReady)
            reveal.off("slidechanged", handleSlidechanged)
            reveal.off("overviewshown", handleOverviewshown)
            reveal.off("overviewhidden", handleOverviewhidden)
            reveal.off("paused", handlePaused)
            reveal.off("resumed", handleResumed)
        }
    }, [])

    const handleResize = (state = { editor }) => _event => {
        syncEditorBounds(state)
    }

    useEffect(() => {
        const state = { editor }
        const handleResize_ = handleResize(state)

        reveal.on("resize", handleResize_)
        return () => {
            reveal.off("resize", handleResize_)
        }
    }, [ editor ])

    function syncEditorBounds(state = { editor }) {
        if (state.editor) {
            // Set the correct zoom and prevent further movement
            state.editor.updateInstanceState({ canMoveCamera: true })
            state.editor.zoomToBounds(bounds, { inset: 0 })
            state.editor.updateInstanceState({ canMoveCamera: false })
        }
    }

    function syncEditor(state = { editor, currentSlide }) {
        if (state.editor) {
            // Find the correct page, or create it if there isn't one
            const pageId = PageRecordType.createId(currentSlideId)
            if (!state.editor.getPage(pageId)) {
                state.editor.createPage({ id: pageId, name: currentSlideId })
            }

            // Navigate to the correct page if we're not there yet
            if (state.editor.getCurrentPageId() !== pageId) {
                state.editor.setCurrentPage(pageId)
            }

            // Set the bounds correctly on the new page
            syncEditorBounds(state)
        }
    }

    useEffect(() => {
        syncEditor({ editor, currentSlide })
    }, [ editor, currentSlide ])

    return (
        <Tldraw
            forceMobile
            hideUi={!isEditing}
            store={store}
            onMount={onTldrawMount}
            components={{
                MenuPanel: null,
                ActionsMenu: CustomActionsMenu,
                QuickActions: () => <CustomQuickActions onClose={() => setIsEditing(false)} />
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
    )
}
