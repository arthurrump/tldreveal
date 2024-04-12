// Enables live reloading in the esbuild server
new EventSource('/esbuild').addEventListener('change', () => location.reload())
