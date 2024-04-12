/// Create a function that is debounced: it only fires after the requests have
/// stopped coming in after a specified time
export function debounce<T extends (...args: any) => void>(func: T, time: number) : DebouncedFunction<T> {
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

export type DebouncedFunction<T extends (...args: any) => void> = (...args: Parameters<T>) => void

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
