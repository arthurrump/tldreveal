const { build } = require("esbuild")
const { dependencies, peerDependencies } = require("./package.json")

const index = "./src/index.tsx"

const commonConfig = {
    bundle: true,
    entryPoints: [ index ],
    minify: true,
    sourcemap: true,
    logLevel: "info"
}

// Modern ES module
build({
    ...commonConfig,
    format: "esm",
    // Don't include dependencies in the module
    external: [ ...Object.keys(dependencies), ...Object.keys(peerDependencies) ],
    outfile: "./dist/esm/index.js",
    target: [ "es2016" ]
})

// A version that works with CommonJS require()
build({
    ...commonConfig,
    format: "cjs",
    // Don't include dependencies in the module
    external: [ ...Object.keys(dependencies), ...Object.keys(peerDependencies) ],
    outfile: "./dist/cjs/index.js",
    target: [ "es2016" ]
})

// A browser bundle with all batteries included
build({
    ...commonConfig,
    format: "iife",
    // Do include dependencies here, except for Reveal.js
    external: [ "reveal.js" ],
    outfile: "./dist/bundle/index.js",
    target: [ "es2016", "chrome114", "firefox115" ],
    footer: {
        "js": 
            "// This bundle includes code from tldraw, available for non-commercial use under the tldraw License\n" +
            "// See https://github.com/tldraw/tldraw/blob/main/LICENSE.md for more",
        "css":
            "/* This bundle includes code from tldraw, available for non-commercial use under the tldraw License\n" +
            " * See https://github.com/tldraw/tldraw/blob/main/LICENSE.md for more */"
    }
})
