const { build, context } = require("esbuild")

const entryPoints = [
    "src/index.ts"
]

function config(isProduction) {
    return {
        entryPoints,
        outdir: "www/dist",
        bundle: true,
        sourcemap: true,
        loader: {
            ".woff": "file",
            ".eot": "file",
            ".ttf": "file"
        } ,
        define: {
            "process.env.NODE_ENV": isProduction ? "\"production\"" : "\"dev\"",
            "process.env.IS_PREACT": "\"false\""
        },
        logLevel: "info"
    }
}

switch (process.argv[2]) {
    case "serve":
        (async () => {
            const ctx = await context({
                ...config(false),
                // TODO: make live-reload work for changes to HTML files too
                inject: [ "live-reload.js" ]
            })
            await ctx.watch()
            await ctx.serve({
                servedir: "www"
            })
        })()
        break;
    case "build":
        build({
            ...config(true),
            minify: true
        })
        break;
    default:
        console.warn("Specify either serve or build as an argument.")
        break;
}
