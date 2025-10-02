Disclaimer

This application is a comic book reader. It does not host, distribute, or include any copyrighted comic book files.  
Users are solely responsible for the content they choose to open with this software.  
The maintainers and contributors accept no liability for misuse or distribution of third-party content.

# Online Comic Reader

A fast, modern browser-based comic book reader built with SvelteKit and TypeScript.

## Features

- **Sleek AMOLED Interface**: Modern dark UI with book shelf design and gradient accents
- **Smart Caching**: IndexedDB-based caching for instant page loading
- **Reading Progress**: Automatically saves your reading position
- **Keyboard Shortcuts**: Arrow keys, spacebar, Home/End navigation, zoom controls
- **PWA**: PWA Support for offline use
- **Mobile Friendly**: Responsive design works on tablets and phones

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:5173`

4. **Drop a CBZ/CBR file** or click to select one and start reading!

## Usage

### Opening Comics
- Drag and drop a `.cbz` or `.cbr` file onto the landing page
- Or click the drop zone to select a file using the file picker
- Recently opened comics will appear in your library shelf
- **New files**: Navigate directly to reading - no extra steps!
- **Recent comics**: May require re-selecting the file due to browser security

### Reading
- **Navigation**: Use arrow keys, spacebar, or on-screen buttons
- **Zoom Controls**: 
  - Ctrl+Scroll wheel to zoom in/out
  - +/- keys for zoom
  - 0 key to reset zoom
  - Zoom buttons in the toolbar
- **Pan & Scroll**: 
  - Drag with mouse to pan around zoomed images
  - Scroll wheel to pan when zoomed
  - Automatic centering for smaller images
- **View Modes**: Switch between fit-width, fit-height, and original size
- **Progress**: Your reading position is automatically saved
- **Performance**: Pages are cached for instant loading

### Keyboard Shortcuts
- `←` / `PageUp`: Previous page
- `→` / `PageDown` / `Space`: Next page
- `Home`: Go to first page
- `End`: Go to last page
- `+` / `=`: Zoom in
- `-`: Zoom out  
- `0`: Reset zoom to 100%
- `Ctrl+Scroll`: Zoom in/out

## Technical Architecture

### Core Components
- **ZipManager**: Handles archive extraction using Web Workers
- **IndexedDB Store**: Caches extracted images and reading positions
- **Viewer Component**: Canvas-based image rendering with zoom/fit modes
- **Session Store**: Svelte stores for reactive state management

### Web Workers
Archive processing runs in Web Workers to prevent UI blocking:
- ZIP extraction and file listing
- Image blob creation and caching
- Background prefetching of upcoming pages

### Caching Strategy
- **Session Cache**: Current comic pages in memory
- **Persistent Cache**: IndexedDB stores extracted images
- **Reading Positions**: Automatically saved to IndexedDB
- **Smart Prefetch**: Loads 2 pages ahead for smooth navigation

## File Support

### Fully Supported
- ✅ **CBZ/CBR** (Comic Book ZIP) - Perfect support with instant loading


## Development

### Project Structure
```
src/
├── routes/                 # SvelteKit routes
│   ├── +layout.svelte     # Global layout
│   ├── +page.svelte       # Landing page
│   └── reader/            # Reader route
├── lib/
│   ├── archive/           # Archive handling
│   │   ├── zipWorker.ts   # Web Worker for ZIP extraction
│   │   └── zipManager.ts  # Worker management wrapper
│   ├── store/             # Data persistence
│   │   ├── indexeddb.ts   # IndexedDB cache
│   │   └── session.ts     # Svelte stores
│   └── ui/                # UI components
│       └── Viewer.svelte  # Main comic viewer
└── types/
    └── comic.ts           # TypeScript definitions
```

### Key Dependencies
- **SvelteKit**: Framework and build system
- **TypeScript**: Type safety and modern JavaScript
- **fflate**: Fast ZIP extraction library
- **Vite**: Build tool and dev server

## Performance Notes

- **Memory Efficient**: Only loads current page + 2 prefetched pages
- **Fast Extraction**: Web Workers prevent UI freezing during extraction
- **Smart Caching**: IndexedDB provides persistent caching across sessions
- **Canvas Rendering**: Uses `createImageBitmap` for efficient decoding

## Contributing

This is a feature-complete implementation. Planned improvements:
- File System Access API for persistent file access
- ComicInfo.xml metadata parsing
- Two-page spread mode
- Thumbnail strip navigation
- PWA/offline support (done)

## License

MIT License - feel free to use and modify as needed.
