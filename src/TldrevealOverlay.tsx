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
    TldrawUiMenuCheckboxItem,
    DefaultMainMenu,
    EditSubmenu,
    ExportFileContentSubMenu,
    ExtrasGroup,
    PreferencesGroup,
    TldrawUiDropdownMenuItem,
    TldrawUiButton,
    TldrawUiButtonLabel,
    useEditor
} from "tldraw"

import "tldraw/tldraw.css"

import { useFilesystem } from "./FilesystemContext";

// TODO:
// - Load saved document, via file picker and from url
// - Hide while transitioning (or better: animate the canvas with the slide)
// - Somehow create overlaid pages for fragment navigation
// - Configuration options for default styles (colour, stroke width, etc)
// - Optional button to start drawing without a keyboard
// - Quick way to clear the current slide
// - Quick way to clear the entire presentation
// - Fix the overlay in scroll mode

const TLDREVEAL_FILE_EXTENSION = ".tldrev"

type DebouncedFunction<T extends (...args: any) => void> = (...args: Parameters<T>) => void
function debounce<T extends (...args: any) => void>(func: T, time: number) : DebouncedFunction<T> {
    let timerId: number | undefined

    return function(this: any) : void {
        const args = arguments
        const context = this

        if (timerId !== undefined) clearTimeout(timerId)
        timerId = setTimeout(() => {
            func.apply(context, args)
            timerId = undefined
        }, time)
    }
}

function makeInt(numOrStr: number | string) : number {
    if (typeof numOrStr === "string") {
        return parseInt(numOrStr)
    } else {
        return numOrStr
    }
}

function CustomFileSubmenu() {
    const actions = useActions()
    const filesystem = useFilesystem()
    return (
        <TldrawUiMenuSubmenu id="tldreveal-file" label="tldreveal.menu.file">
            <TldrawUiMenuGroup id="tldreveal-file-actions">
                <TldrawUiMenuItem {...actions["tldreveal.open-file"]} />
                <TldrawUiMenuItem {...actions["tldreveal.save-file"]} />
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="tldreveal-file-preferences">
                <TldrawUiDropdownMenuItem>
                    <TldrawUiButton type="menu" disabled={true}>
                        <TldrawUiButtonLabel>{filesystem.openedFile || "No file selected"}</TldrawUiButtonLabel>
                    </TldrawUiButton>
                </TldrawUiDropdownMenuItem>
                <TldrawUiMenuCheckboxItem 
                    checked={filesystem.autosaveEnabled}
                    {...actions["tldreveal.toggle-autosave"]}
                />
            </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
    )
}

function CustomMainMenu() {
    return (
        <DefaultMainMenu>
            <CustomFileSubmenu />
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
    const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
    const [editor, setEditor] = useState<Editor | undefined>()

    const filesystem = useFilesystem()

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
        const storageKey = deckId => `TLDREVEAL_SNAPSHOT__${deckId}`

        if (deckId) {
            const storedSnapshot = localStorage.getItem(storageKey(deckId))
            if (storedSnapshot) {
                try {
                    const snapshot = JSON.parse(storedSnapshot)
                    store.loadSnapshot(snapshot)
                } catch (error: any) {
                    console.error("Failed to load tldreveal snapshot from local storage: ", error.message, error)
                }
            }
        }

        const cleanupStoreListen = store.listen(
            throttle(() => {
                const snapshot = store.getSnapshot()
                const snapshotJson = JSON.stringify(snapshot)
                if (deckId) {
                    localStorage.setItem(storageKey(deckId), snapshotJson)
                }
                if (filesystem.autosaveAvailable && filesystem.autosaveEnabled) {
                    filesystem.autosave(new Blob([ snapshotJson ]))
                }
            }, 500)
        )

        setIsShown(true)

        return () => {
            cleanupStoreListen()
        }
    }, [ store ])

    function initializeEditor(state = { editor }) {
        state.editor.setCurrentTool("draw")
        // TODO: Set up initial style
        // for (const [ styleProp, sharedStyle ] of sharedStyles.entries()) {
        //     if (sharedStyle.type === "shared") {
        //         editor.setStyleForNextShapes(styleProp, sharedStyle.value)
        //     }
        // }
        state.editor.updateInstanceState({ 
            isDebugMode: false,
            exportBackground: false
        })
        syncEditor({ editor, currentSlide })
    }

    function onTldrawMount(editor: Editor) {
        setEditor(editor)
        initializeEditor({ editor })
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

    const customTranslations = {
        en: {
            "tldreveal.menu.file": "File",
            "tldreveal.action.close": "Exit drawing mode",
            "tldreveal.action.open-file": "Open file",
            "tldreveal.action.save-file": "Save file",
            "tldreveal.preference.autosave": "Autosave",

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
                    file = await filesystem.openFile({
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
            }
        },
        ["tldreveal.save-file"]: {
            id: "tldreveal.save-file",
            label: "tldreveal.action.save-file",
            readonlyOk: true,
            kbd: "$s",
            async onSelect(_source) {
                const blob = new Blob([ JSON.stringify(store.getSnapshot()) ])
                filesystem.saveFile(blob, {
                    fileName: (deckId || "untitled") + TLDREVEAL_FILE_EXTENSION, 
                    extensions: [ TLDREVEAL_FILE_EXTENSION ]
                })
            }
        },
        ["tldreveal.toggle-autosave"]: {
            id: "tldreveal.toggle-autosave",
            label: "tldreveal.preference.autosave",
            readonlyOk: true,
            checkbox: true,
            onSelect(_source) {
                filesystem.toggleAutosave()
            }
        }
    }

    return (
        <Tldraw
            forceMobile
            hideUi={!isEditing}
            store={store}
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
