import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { fileSave } from "browser-fs-access"

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
    TldrawUiMenuCheckboxItem,
    TLStore,
    TLStoreSnapshot,
} from "tldraw"
import { useAtom } from "@tldraw/state"

import { debounce, makeInt, parseOptionalBoolean } from "./util"
import { defaultStyleProps, getTldrevealConfig } from "./config";

// TODO:
// - Somehow create overlaid pages for fragment navigation
// - Fix the overlay in scroll mode
//   - Slide ids and dark mode detection fail, because we can't get the current slide element
//     - See https://github.com/hakimel/reveal.js/issues/3616
//   - Transition animation don't work, because there is no transition end in scroll view
//     -> need to detect scroll view and disable them
// - Fix the 40 slides with drawings limit (that's tldraw's (artificial) page limit)

const TLDREVEAL_FILE_EXTENSION = ".tldrev"

interface FileSubmenuProps {
    canUseLocalStorage: boolean
    saveToLocalStorage: boolean
}

function FileSubmenu({ canUseLocalStorage, saveToLocalStorage }: FileSubmenuProps) {
    const actions = useActions()

    const mainGroup =
        <TldrawUiMenuGroup  id="tldreveal-file-main">
            <TldrawUiMenuItem {...actions["tldreveal.save-file"]} />
        </TldrawUiMenuGroup>

    if (canUseLocalStorage) {
        return (
            <TldrawUiMenuSubmenu id="tldreveal-file" label="tldreveal.menu.file">
                {mainGroup}
                <TldrawUiMenuGroup id="tldreveal-file-localstorage">
                    <TldrawUiMenuCheckboxItem
                        checked={saveToLocalStorage}
                        {...actions["tldreveal.toggle-save-to-localstorage"]}
                    />
                    <TldrawUiMenuItem {...actions["tldreveal.clear-localstorage"]} />
                </TldrawUiMenuGroup>
            </TldrawUiMenuSubmenu>
        )
    } else {
        return mainGroup
    }
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

function CustomMainMenu({ fileProps }: { fileProps: FileSubmenuProps }) {
    const actions = useActions()
    return (
        <DefaultMainMenu>
            <FileSubmenu {...fileProps} />
            <ClearSubmenu />
            <EditSubmenu />
			<ExportFileContentSubMenu />
			<ExtrasGroup />
			<PreferencesGroup />
            <TldrawUiMenuGroup id="close">
                <TldrawUiMenuItem {...actions["tldreveal.close"]} />
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

    function tryGetId(element: HTMLElement) : string | undefined {
        return element.getAttribute("data-tlid") || element.id || undefined
    }

    const deckId : string | undefined = useMemo(() => 
        tryGetId(reveal.getSlidesElement()) || tryGetId(reveal.getRevealElement())
    , [])

    const saveToLocalStorageKey = deckId && `TLDREVEAL_SAVE_TO_LOCALSTORAGE__${deckId}`
    const localStorageKey = deckId && `TLDREVEAL_SNAPSHOT__${deckId}`

    const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
    const [editor, setEditor] = useState<Editor | undefined>()

    // Use a local user preferences atom, to prevent sharing dark mode status
    // across multiple instances
    const userPreferences = useAtom<TLUserPreferences>("userPreferences", { id: "tldreveal", isDarkMode: config.isDarkMode })
    const [isolatedUser] = useState(() => createTLUser({ userPreferences, setUserPreferences: userPreferences.set }))

    const [saveToLocalStorage, setSaveToLocalStorage_] = 
        useState(parseOptionalBoolean(localStorage.getItem(saveToLocalStorageKey)) ?? config.useLocalStorage)
    
    function setSaveToLocalStorage(value: boolean) {
        setSaveToLocalStorage_(value)
        localStorage.setItem(saveToLocalStorageKey, value ? "true" : "false")
    }
    
    const [isReady, setIsReady] = useState(false)
    const [isShown, setIsShown] = useState(true)
	const [isEditing, setIsEditing] = useState(false)

    const [currentSlide, setCurrentSlide] = useState<{ h: number, v: number }>(reveal.getIndices())

    const slideWidth = makeInt(reveal.getConfig().width)
    const slideHeight = makeInt(reveal.getConfig().height)
    const bounds = new Box(0, 0, slideWidth, slideHeight)

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

    function getTimestampedSnapshot(store: TLStore) : TLStoreSnapshot & { timestamp: number } {
        return {
            timestamp: Date.now(),
            ...store.getSnapshot()
        }
    }

    async function loadInitial(store: TLStore) {
        let localStorageSnapshot: (TLStoreSnapshot & { timestamp: number }) | undefined
        if (localStorageKey) {
            const snapshotJson = localStorage.getItem(localStorageKey)
            if (snapshotJson) {
                localStorageSnapshot = JSON.parse(snapshotJson)
            }
        }

        let uriSnapshot: (TLStoreSnapshot & { timestamp: number }) | undefined
        if (config.snapshotUrl) {
            let uri
            if (config.snapshotUrl === "auto") {
                const path = window.location.pathname
                const ext = [ ".html", ".htm" ].find(ext => path.endsWith(ext))
                if (ext) {
                    uri = path.substring(0, path.length - ext.length) + ".tldrev"
                } else {
                    uri = "index.tldrev"
                }
            } else {
                uri = config.snapshotUrl.url
            }

            try {
                const res = await fetch(uri)
                if (res.ok) {
                    const snapshotJson = await res.text()
                    try {
                        const snapshot = JSON.parse(snapshotJson)
                        if (!(snapshot.timestamp && snapshot.store && snapshot.schema)) {
                            console.warn("Received invalid snapshot from", uri)
                        } else {
                            uriSnapshot = snapshot
                        }
                    } catch {
                        console.warn("Received invalid snapshot from", uri)
                    }
                } else {
                    if (config.snapshotUrl === "auto") {
                        console.log("No saved drawings found at auto-detected uri:", uri, "Got status:", res.status, res.statusText)
                    } else {
                        console.warn("Failed to load saved drawings from", uri, "Got status:", res.status, res.statusText)
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch drawings from uri. Error:", err)
            }
        }

        let snapshot: (TLStoreSnapshot & { timestamp: number }) | undefined
        if (localStorageSnapshot && uriSnapshot) {
            if (localStorageSnapshot.timestamp >= uriSnapshot.timestamp) {
                snapshot = localStorageSnapshot
            } else {
                // TODO: dialog, for now always load newest
                snapshot = uriSnapshot
            }
        } else {
            snapshot = localStorageSnapshot || uriSnapshot
        }

        if (snapshot) {
            store.loadSnapshot(snapshot)
        }

        setIsReady(true)
    }

    // https://tldraw.dev/examples/data/assets/local-storage
    useLayoutEffect(() => {
        loadInitial(store)
    }, [ store ])

    useEffect(() => {
        // If we can and want to use local storage, then listen to changes of
        // the store and save them
        if (localStorageKey && saveToLocalStorage) {
            const cleanupStoreListen = store.listen(
                throttle(() => {
                    const snapshot = getTimestampedSnapshot(store)
                    localStorage.setItem(localStorageKey, JSON.stringify(snapshot))
                }, 500)
            )

            return () => {
                cleanupStoreListen()
            }
        }
    }, [ store, saveToLocalStorage ])

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
        // TODO: also disable transition in scroll view
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
                // Reset undo/redo to prevent undoing changes on other pages
                state.editor.history.clear()

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
            "tldreveal.action.save-file": "Save file",
            "tldreveal.action.clear-localstorage": "Clear browser storage",
            "tldreveal.action.clear-page": "Clear current slide",
            "tldreveal.action.clear-deck": "Clear deck",

            "tldreveal.options.save-to-localstorage": "Save in browser",

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
        ["tldreveal.save-file"]: {
            id: "tldreveal.save-file",
            label: "tldreveal.action.save-file",
            readonlyOk: true,
            kbd: "$s",
            async onSelect(_source) {
                const snapshot = getTimestampedSnapshot(store)
                await fileSave(new Blob([ JSON.stringify(snapshot) ]), {
                    fileName: (deckId || "untitled") + TLDREVEAL_FILE_EXTENSION, 
                    extensions: [ TLDREVEAL_FILE_EXTENSION ]
                })
            }
        },
        ["tldreveal.toggle-save-to-localstorage"]: {
            id: "tldreveal.toggle-save-to-localstorage",
            label: "tldreveal.options.save-to-localstorage",
            readonlyOk: true,
            checkbox: true,
            async onSelect(_source) {
                setSaveToLocalStorage(localStorageKey && !saveToLocalStorage)
            }
        },
        ["tldreveal.clear-localstorage"]: {
            id: "tldreveal.clear-localstorage",
            label: "tldreveal.action.clear-localstorage",
            async onSelect(_source) {
                if (localStorageKey) {
                    setSaveToLocalStorage(false)
                    localStorage.removeItem(localStorageKey)
                }
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

    if (isReady) {
        return (
            <Tldraw
                forceMobile
                hideUi={!isEditing}
                store={store}
                user={isolatedUser}
                onMount={onTldrawMount}
                components={{
                    PageMenu: null,
                    MainMenu: () => CustomMainMenu({ 
                        fileProps: { 
                            canUseLocalStorage: localStorageKey !== undefined, 
                            saveToLocalStorage
                        }
                    }),
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
}
