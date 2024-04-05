import React, { createContext, useContext, useState } from "react"
import { FirstFileOpenOptions, FirstFileSaveOptions, fileOpen, fileSave } from "browser-fs-access"

export interface Filesystem {
    openedFile: string | undefined
    autosaveAvailable: boolean
    autosaveEnabled: boolean

    toggleAutosave(): void
    saveFile(blob: Blob | Promise<Blob>, options?: FirstFileSaveOptions): Promise<void>
    autosave(blob: Blob | Promise<Blob>): Promise<void>
    openFile(options?: FirstFileOpenOptions<false>): Promise<File>
}

export const FilesystemContext = createContext<Filesystem>({} as Filesystem)

export function FilesystemProvider({ children }) {
    const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(false)
    const [handle, setHandle] = useState<FileSystemFileHandle | undefined>()

    const context : Filesystem = {
        openedFile: handle?.name,
        autosaveAvailable: handle !== undefined,
        autosaveEnabled: autosaveEnabled,

        toggleAutosave() {
            setAutosaveEnabled(!autosaveEnabled)
        },
        async saveFile(blob, options) {
            const newHandle = await fileSave(blob, options)
            setHandle(newHandle)
        },
        async autosave(blob) {
            if (handle !== undefined && autosaveEnabled) {
                try {
                    const newHandle = await fileSave(blob, {}, handle, true)
                    setHandle(newHandle)
                } catch (error: any) {
                    console.error("Failed to autosave:", error.message)
                    setHandle(undefined)
                    setAutosaveEnabled(false)
                }
            }
        },
        async openFile(options) {
            const file = await fileOpen(options)
            setHandle(file.handle)
            return file
        }
    }

    return (
        <FilesystemContext.Provider value={context}>
            {children}
        </FilesystemContext.Provider>
    )
}

export function useFilesystem() {
    return useContext(FilesystemContext)
}
