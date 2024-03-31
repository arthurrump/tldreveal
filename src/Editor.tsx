import { Tldraw, useEditor } from "tldraw"
import "tldraw/tldraw.css"

import React, { useEffect } from "react";

import "./Editor.css"

export function Editor() {
    return (
        <Tldraw hideUi>
            <SetDraw />
        </Tldraw>
    )
}

function SetDraw() {
    const editor = useEditor()
    useEffect(() => {
        editor.setCurrentTool("draw")
    }, [])
    return null
}
