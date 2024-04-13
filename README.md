# tldreveal

A [Reveal.js](https://revealjs.com/) plugin for drawing on your presentation, based on [tldraw](https://www.tldraw.com). Check out the [demo](https://arthurrump.github.io/tldreveal)!

## Installation

### Basic setup

If you write your presentation in a simple HTML file and don't have a build process, then it's easiest to include the bundled edition from a CDN:

Include the stylesheet in the `head`:

```html
<link rel="stylesheet" href="https://unpkg.com/tldreveal/dist/bundle/index.css" />
```

And add the script in the `body`, before the initialization script:

```html
<script src="https://unpkg.com/tldreveal/dist/bundle/index.js"></script>
<script>
    // Initialize Reveal.js with the Tldreveal plugin
    Reveal.initialize({
        // tldreveal does not support scroll view
        scrollActivationWidth: undefined,
        plugins: [ Tldreveal ]
    })
</script>
```

### Using npm

If you manage other dependencies through npm, you can use it for tldreveal as well and include it in your bundling process as any other dependency. Make sure to include the React peer dependencies as well:

```shell
npm install tldreveal react react-dom
```

Then import or require the module and register the plugin with Reveal.js:

```js
// Import the Tldreveal plugin
import { Tldreveal } from "tldreveal"

// Import the tldreveal CSS (if you use a bundler that can import CSS)
import "tldreveal/dist/esm/index.css"

// Initialize Reveal.js with the Tldreveal plugin
Reveal.initialize({
    // tldreveal does not support scroll view
    scrollActivationWidth: undefined,
    plugins: [ Tldreveal ]
})
```

You can also reference the CSS directly in your HTML if you don't use a bundler:

```html
<link rel="stylesheet" href="node_modules/tldreveal/dist/esm/index.css" />
```

## Configuration

You can configure some tldreveal options within the Reveal.js configuration:

```js
Reveal.initialize({
    scrollActivationWidth: undefined,
    plugins: [ Tldreveal ],
    tldreveal: {
        // Set for light-themed presentations
        isDarkMode: false,
        // Set the default drawing color to red
        defaultStyles: {
            color: "red"
        }
    }
})
```

See `TldrevealConfig` in [config.ts](package/src/config.ts) for all available options.
