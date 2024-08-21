/// Turn a number | string into an integer number
export function makeInt(numOrStr: number | string) : number {
    if (typeof numOrStr === "string") {
        return parseInt(numOrStr)
    } else {
        return numOrStr
    }
}

/// Parse string to boolean if not null, else just return null
export function parseOptionalBoolean(text: string | null) : boolean | null {
    if (text === null) {
        return null
    } else {
        return text === "true"
    }
}
