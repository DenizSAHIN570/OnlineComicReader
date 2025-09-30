# Online CBR Reader

A fast, modern browser-based comic book reader built with SvelteKit and TypeScript. Optimized for CBZ/ZIP files with a sleek AMOLED dark interface.

## Features

- **Lightning-Fast CBZ/ZIP Support**: Uses `fflate` for instant extraction in Web Workers
- **Sleek AMOLED Interface**: Modern dark UI with book shelf design and gradient accents
- **Advanced Zoom & Pan**: Smooth zoom (10%-500%), drag to pan with smart borders, scroll wheel controls
- **View Mode Persistence**: Fit-width/fit-height modes persist when changing pages
- **Smart Caching**: IndexedDB-based caching for instant page loading
- **Reading Progress**: Automatically saves your reading position
- **Multiple View Modes**: Fit-to-width, fit-to-height, and original size with zoom
- **Keyboard Shortcuts**: Arrow keys, spacebar, Home/End navigation, zoom controls
- **Mobile Friendly**: Responsive design works on tablets and phones
- **CBR/RAR Awareness**: Provides helpful guidance for converting CBR files to CBZ format

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

4. **Drop a CBZ file** or click to select one and start reading!

## Usage

### Opening Comics
- Drag and drop a `.cbz` or `.zip` file onto the landing page
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
- ✅ **CBZ** (Comic Book ZIP) - Perfect support with instant loading
- ✅ **ZIP** files containing images - Perfect support with instant loading

### Limited Support
- ⚠️ **CBR** (Comic Book RAR) - Browser limitations due to WASM constraints
- ⚠️ **RAR** files - Browser limitations due to WASM constraints

### Recommended Workflow for CBR Files

**Option 1: Convert CBR to CBZ**
1. Download a tool like [CBR to CBZ Converter](https://convertio.co/cbr-cbz/)
2. Upload your CBR file and convert to CBZ
3. Use the converted CBZ file for perfect compatibility

**Option 2: Manual Conversion**
1. Rename `.cbr` file to `.rar`
2. Extract using WinRAR, 7-Zip, or similar
3. Select all images and create a new ZIP file
4. Rename the ZIP to `.cbz`

**Why CBZ is better:**
- ⚡ Faster loading (no WASM overhead)
- 🔄 Better browser compatibility
- 💾 Smaller memory footprint
- 🎯 More reliable extraction

### Coming Soon
- 🔄 **ComicInfo.xml** metadata parsing
- 🔄 **Two-page spread** mode
- 🔄 **Thumbnail navigation** panel

## Browser Compatibility

- **Chrome/Edge**: Full support including File System Access API
- **Firefox**: Full support with standard file picker
- **Safari**: Full support with standard file picker
- **Mobile Browsers**: Responsive design, touch/swipe navigation

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

## Troubleshooting

### CBR/RAR File Issues

If you try to open CBR/RAR files, you'll see a helpful error message explaining the limitations. Here's what to do:

**Quick Solution: Convert to CBZ**
1. Use an online converter like [convertio.co](https://convertio.co/cbr-cbz/)
2. Upload your CBR file and download the CBZ version
3. Use the CBZ file - it will load instantly!

**Manual Conversion:**
1. Rename `.cbr` to `.rar` and extract with any archive tool
2. Select all images and create a new ZIP file
3. Rename the ZIP to `.cbz`

### General Issues

- **File re-selection required:** This only happens with recent comics due to browser security - fresh uploads work seamlessly
- **Pages not loading:** Refresh and re-select the file
- **Large files slow:** This is expected for files over 100MB
- **Browser crashes:** Try smaller files or close other tabs to free memory

## Limitations

- **File Re-selection**: Browser security prevents persistent file access - only affects library comics after restart
- **Large Archives**: Very large ZIP files (>100MB) may take time to process initially
- **CBR/RAR Files**: Limited browser support due to WASM constraints - conversion to CBZ recommended

## Contributing

This is a feature-complete implementation. Planned improvements:
- File System Access API for persistent file access
- ComicInfo.xml metadata parsing
- Two-page spread mode
- Thumbnail strip navigation
- PWA/offline support

## License

MIT License - feel free to use and modify as needed.
