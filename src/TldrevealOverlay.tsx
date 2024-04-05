import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { fileSave, fileOpen } from "browser-fs-access"

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
    PageRecordType,
    TldrawUiMenuSubmenu,
    TldrawUiMenuGroup,
    TLUiActionsContextType,
    useActions,
    DefaultMainMenu,
    EditSubmenu,
    ExportFileContentSubMenu,
    ExtrasGroup,
    PreferencesGroup,
    transact,
    TLShapeId,
    createTLUser,
    TLUserPreferences,
} from "tldraw"
import { useAtom } from "@tldraw/state"

import "tldraw/tldraw.css"

import { debounce, makeInt } from "./util"
import { defaultStyleProps, getTldrevealConfig } from "./config";

// TODO:
// - Load saved document, via file picker and from url
//   - Fix keyboard not working after opening a file
//   - Fix sync after file opening
// - Fix the undo/redo stack across pages
// - Somehow create overlaid pages for fragment navigation
// - Fix the overlay in scroll mode
// - Fix the 40 slides with drawings limit (that's tldraw's (artificial) page limit)

const TLDREVEAL_FILE_EXTENSION = ".tldrev"

function FileSubmenu() {
    const actions = useActions()
    return (
        <TldrawUiMenuSubmenu id="tldreveal-file" label="tldreveal.menu.file">
            <TldrawUiMenuGroup id="tldreveal-file-group">
                <TldrawUiMenuItem {...actions["tldreveal.open-file"]} />
                <TldrawUiMenuItem {...actions["tldreveal.save-file"]} />
            </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
    )
}

function ClearSubmenu() {
    const actions = useActions()
    return (
        <TldrawUiMenuSubmenu id="tldreveal-clear" label="tldreveal.menu.clear">
            <TldrawUiMenuGroup id="tldreveal-clear-group">
                <TldrawUiMenuItem {...actions["tldreveal.clear-page"]} />
                <TldrawUiMenuItem {...actions["tldreveal.clear-deck"]} />
            </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
    )
}

function CustomMainMenu() {
    return (
        <DefaultMainMenu>
            <FileSubmenu />
            <ClearSubmenu />
            <EditSubmenu />
			<ExportFileContentSubMenu />
			<ExtrasGroup />
			<PreferencesGroup />
            <TldrawUiMenuGroup id="tldreveal-links">
                <TldrawUiMenuItem
                    id="github"
                    label="GitHub"
                    readonlyOk
                    icon="github"
                    onSelect={() => {
                        window.open("https://github.com/arthurrump/tldreveal", "_blank")
                    }} 
                />
            </TldrawUiMenuGroup>
        </DefaultMainMenu>
    )
}

function CustomQuickActions() {
    const actions = useActions()
    return (
        <DefaultQuickActions>
            <TldrawUiMenuItem {...actions["tldreveal.close"]} />
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
    const config = getTldrevealConfig(reveal)

    const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
    const [editor, setEditor] = useState<Editor | undefined>()

    // Use a local user preferences atom, to prevent sharing dark mode status
    // across multiple instances
    const userPreferences = useAtom<TLUserPreferences>("userPreferences", { id: "tldreveal", isDarkMode: config.isDarkMode })
    const [isolatedUser] = useState(() => createTLUser({ userPreferences, setUserPreferences: userPreferences.set }))

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

    // https://tldraw.dev/examples/data/assets/local-storage
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

    function initializeEditor(state = { editor, currentSlide }) {
        state.editor.setCurrentTool("draw")
        for (const style of Object.keys(config.defaultStyles)) {
            if (config.defaultStyles[style]) {
                state.editor.setStyleForNextShapes(defaultStyleProps[style], config.defaultStyles[style])
            }
        }
        state.editor.updateInstanceState({ 
            isDebugMode: false,
            exportBackground: false
        })
        syncEditor(state)
    }

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        initializeEditor({ editor, currentSlide })
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

    const handleDblclick = (state = { isEditing }) => (event: MouseEvent) => {
        if (!state.isEditing) {
            setIsEditing(true)
            event.stopImmediatePropagation()
        }
    }

    useEffect(() => {
        const state = { isEditing }
        const handleKeydown_ = handleKeydown(state)
        const handleDblclick_ = handleDblclick(state)

        reveal.addKeyBinding({ keyCode: 68, key: "D", description: "Enter drawing mode" }, handleDKey)
        window.addEventListener("dblclick", handleDblclick_, true)
        window.addEventListener("keydown", handleKeydown_, true)
        return () => {
            reveal.removeKeyBinding(68)
            window.removeEventListener("dblclick", handleDblclick_, true)
            window.removeEventListener("keydown", handleKeydown_, true)
        }
    }, [ isEditing ])

    function handleReady(event) {
        setCurrentSlide({ h: event.indexh, v: event.indexv })
    }
    
    const handleSlidechanged = (state = { currentSlideId }) => event => {
        const currentTransition: string | undefined = 
            reveal.getConfig().transition 
            || event.currentSlide.getAttribute("data-transition")
        const noTransition = currentTransition === "none" || currentTransition?.includes("none-in")
        const hasSameSlideId = getSlideId({ h: event.indexh, v: event.indexv }) === state.currentSlideId
        if (noTransition || hasSameSlideId) {
            setCurrentSlide({ h: event.indexh, v: event.indexv })
        } else {
            container.classList.toggle("start-transition", true)
            setTimeout(() => {
                setCurrentSlide({ h: event.indexh, v: event.indexv })
                container.classList.toggle("transitioning", true)
            }, 200)
        }
    }
    
    function handleSlidetransitionend(_event) {
        container.classList.toggle("start-transition", false)
        container.classList.toggle("transitioning", false)
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
        reveal.on("slidetransitionend", handleSlidetransitionend)
        reveal.on("overviewshown", handleOverviewshown)
        reveal.on("overviewhidden", handleOverviewhidden)
        reveal.on("paused", handlePaused)
        reveal.on("resumed", handleResumed)
        return () => {
            reveal.off("ready", handleReady)
            reveal.off("overviewshown", handleOverviewshown)
            reveal.off("overviewhidden", handleOverviewhidden)
            reveal.off("paused", handlePaused)
            reveal.off("resumed", handleResumed)
        }
    }, [])
    
    useEffect(() => {
        const handleSlidechanged_ = handleSlidechanged({ currentSlideId })
        reveal.on("slidechanged", handleSlidechanged_)
        return () => {
            reveal.off("slidechanged", handleSlidechanged_)
        }
    }, [ currentSlideId ])

    const handleResize = (state = { editor }) => {
        // Run both a throttled and debounced version: the throttled function
        // handles the in-between values, without completely flooding tldraw
        // with zoom requests; the debounced version then waits until the final
        // dimensions have been reached and everything is stabilised to make
        // sure the final adjustement puts it in the right position.
        const throttled = throttle(() => syncEditorBounds(state), 100)
        const debounced = debounce(() => syncEditorBounds(state), 500)
        return () => {
            throttled()
            debounced()
        }
    }

    useEffect(() => {
        const state = { editor }
        const handleResize_ = handleResize(state)

        window.addEventListener("resize", handleResize_)
        return () => {
            window.removeEventListener("resize", handleResize_)
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

            // Navigate to the correct page if we're not there yet, and delete
            // the previous page if it is empty
            const oldCurrentPageId = state.editor.getCurrentPageId()
            if (oldCurrentPageId !== pageId) {
                // Delete the old current page if it has no shapes on it
                const deleteOldCurrent = 
                    state.editor.getCurrentPageShapeIds().size === 0

                state.editor.setCurrentPage(pageId)

                if (deleteOldCurrent) {
                    state.editor.deletePage(oldCurrentPageId)
                }
            }

            if (config.automaticDarkMode) {
                const currentSlideClasses = 
                reveal.getSlide(currentSlide.h, currentSlide.v).classList
                if (currentSlideClasses.contains("has-dark-background")) {
                    userPreferences.update(u => ({ ...u, isDarkMode: true }))
                } else if (currentSlideClasses.contains("has-light-background")) {
                    userPreferences.update(u => ({ ...u, isDarkMode: false }))
                } else {
                    userPreferences.update(u => ({ ...u, isDarkMode: config.isDarkMode }))
                }
            }

            // Set the bounds correctly on the new page
            syncEditorBounds(state)
        }
    }

    useEffect(() => {
        syncEditor({ editor, currentSlide })
    }, [ editor, currentSlide ])

    const customTranslations = {
        en: {
            "tldreveal.menu.file": "File",
            "tldreveal.menu.clear": "Clear",
            "tldreveal.action.close": "Exit drawing mode",
            "tldreveal.action.open-file": "Open file",
            "tldreveal.action.save-file": "Save file",
            "tldreveal.action.clear-page": "Clear current slide",
            "tldreveal.action.clear-deck": "Clear deck",

            // Set the default name for built-in export functions
            "document.default-name": deckId || "unknown"
        }
    }

    const customActions : TLUiActionsContextType = {
        ["tldreveal.close"]: {
            id: "tldreveal.close",
            label: "tldreveal.action.close",
            icon: "cross",
            readonlyOk: true,
            async onSelect(_source) {
                setIsEditing(false)
            }
        },
        ["tldreveal.open-file"]: {
            id: "tldreveal.open-file",
            label: "tldreveal.action.open-file",
            kbd: "$o",
            async onSelect(_source) {
                let file: File
                try {
                    file = await fileOpen({
                        extensions: [ TLDREVEAL_FILE_EXTENSION ],
                        multiple: false,
                        description: "tldreveal project"
                    })
                } catch (error) {
                    // user canceled
                    return
                }

                const snapshot = JSON.parse(await file.text())
                store.loadSnapshot(snapshot)
                initializeEditor()
                // TODO: Fix this properly
                setTimeout(() => syncEditorBounds(), 500)
            }
        },
        ["tldreveal.save-file"]: {
            id: "tldreveal.save-file",
            label: "tldreveal.action.save-file",
            readonlyOk: true,
            kbd: "$s",
            async onSelect(_source) {
                const blob = new Blob([ JSON.stringify(store.getSnapshot()) ])
                await fileSave(blob, {
                    fileName: (deckId || "untitled") + TLDREVEAL_FILE_EXTENSION, 
                    extensions: [ TLDREVEAL_FILE_EXTENSION ]
                })
            }
        },
        ["tldreveal.clear-page"]: {
            id: "tldreveal.clear-page",
            label: "tldreveal.action.clear-page",
            async onSelect(_source) {
                transact(() => {
                    // Delete all shapes on the current page
                    editor.deleteShapes(editor.getCurrentPageShapes())
                })
            }
        },
        ["tldreveal.clear-deck"]: {
            id: "tldreveal.clear-deck",
            label: "tldreveal.action.clear-deck",
            async onSelect(_source) {
                transact(() => {
                    // Find all shapes from the store and delete them
                    const allShapeIds = 
                        store.allRecords()
                            .filter(record => record.typeName === "shape")
                            .map(record => record.id as TLShapeId)
                    editor.deleteShapes(allShapeIds)

                    // Delete all assets
                    editor.deleteAssets(editor.getAssets())

                    // Delete all pages except the current
                    const currentPage = editor.getCurrentPage()
                    for (const page of editor.getPages()) {
                        if (page.id !== currentPage.id) editor.deletePage(page)
                    }
                })
            }
        }
    }

    return (
        <Tldraw
            forceMobile
            hideUi={!isEditing}
            store={store}
            user={isolatedUser}
            onMount={onTldrawMount}
            components={{
                PageMenu: null,
                MainMenu: CustomMainMenu,
                ActionsMenu: CustomActionsMenu,
                QuickActions: CustomQuickActions
            }}
            overrides={{
                translations: customTranslations,
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
                    return { ...actions, ...customActions }
                }
            }}
            >
        </Tldraw>
    )
}
