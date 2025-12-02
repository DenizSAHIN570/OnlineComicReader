# Disclaimer

This application is a comic book reader. It does not host, distribute, or include any copyrighted comic book files.  
Users are solely responsible for the content they choose to open with this software.  
The maintainers and contributors accept no liability for misuse or distribution of third-party content.

Contains AI generated code.

# Online Comic Reader

Online Comic Reader is a SvelteKit application for reading CBZ/CBR comics directly in the browser. It focuses on fast archive extraction, an immersive viewer, and seamless device persistence so you can pick up exactly where you left off.

## Features

- **Instant archive loading** – client-side extraction for `.cbz` and `.cbr` files with pinch/scroll zoom and smooth panning.
- **Auto-hiding viewer UI** – tap or move to reveal controls; pin the overlay when you want it to stay.
- **Touch & keyboard friendly** – left/right taps, arrow keys, pinch-to-zoom, drag to pan.
- **Local library** – comics, thumbnails, and progress are cached in IndexedDB for quick reopen and offline access.
- **Installable PWA** – ships with a manifest and Workbox configuration so you can add it to your home screen and use it offline.
- **Recent history** – home view shows storage usage and last-read progress; library lists everything stored locally.

## Project Structure

```
src/
├── lib/
│   ├── archive/        # libarchive.js wrapper for extracting images
│   ├── storage/        # browser storage helpers (IndexedDB blobs)
│   ├── store/          # Svelte writable stores for session state
│   └── ui/             # UI components (Viewer.svelte, etc.)
├── routes/
│   ├── +page.svelte    # Landing page with uploader and recent shelf
│   ├── reader/         # Reader route (+page.svelte) that mounts Viewer
│   └── library/        # Dedicated library page for offline collection
└── types/              # Shared TypeScript interfaces
```

Key supporting files:

- `vite.config.ts` – Vite + PWA plugin configuration.
- `svelte.config.js` – SvelteKit adapter/static build setup.
- `package.json` – project scripts and dependencies.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open the app at http://localhost:5173
```

Drag a `.cbz`/`.cbr` file onto the home page (or tap the drop zone on mobile) to start reading. The viewer automatically caches the file and your progress locally. Revisit the home page or library to reopen cached comics without reuploading.

## Building

Create a production build with:

```bash
npm run build
```

Serve the generated static output from the `build/` directory with any static file host.

## License

MIT License - feel free to use and modify as needed.
