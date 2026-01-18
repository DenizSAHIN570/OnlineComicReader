# ComiKaiju Roadmap

This roadmap outlines the future development phases for **ComiKaiju**, aimed at transforming it from a local file viewer into a comprehensive, cross-platform comic management ecosystem.

## 🚀 Current Status (v1.3.0)
- [x] **Enterprise Core**: Centralized logging, global error handling, and robust type safety.
- [x] **File Manager**: Hierarchical folders, bulk uploads, and OS-like navigation.
- [x] **Deduplication**: Content-addressable storage (SHA-256) to minimize disk usage.
- [x] **Theming**: Adaptive Light/Dark/System modes with semantic CSS variables.
- [x] **Universal Archive Support**: Client-side extraction for CBZ, CBR, ZIP, and RAR.

---

## 🔍 Search
Enhancing discoverability within large collections.
- **Global Search**: A unified search bar in the Library to find comics and folders by name.
- **Fuzzy Matching**: Implementation of fuzzy search logic to handle typos and partial titles.
- **Metadata Filters**: Advanced filtering by file size, upload date, and reading progress (e.g., "Show Unread").
- **Deep Indexing**: Fast indexing of local IndexedDB structures for near-instant results.

## ☁️ Cloud Storage Integration
Expanding beyond browser storage limits.
- **Provider Support**: Integration with major providers including **Google Drive**, **OneDrive**, **Dropbox**, and **Nextcloud (WebDAV)**.
- **Remote Browsing**: The ability to navigate cloud folders directly within the ComiKaiju UI.
- **On-Demand Streaming**: Reading comics directly from the cloud without requiring a full local download.
- **Auto-Sync**: Automatically back up the local Library database to a preferred cloud provider.

## 👤 Accounts
Enabling persistence and multi-device synchronization.
- **User Authentication**: Secure sign-in/sign-up flows (OAuth2, Email/Password).
- **Progress Sync**: Synchronize reading positions, bookmarks, and "Last Read" status across multiple browsers and devices.
- **Profile Management**: Custom user preferences, avatars, and reading statistics.
- **Library Portability**: Export and import account data to ensure users are never locked into a single instance.

## 💻 Native System Integration
Bridging the gap between the web and the local OS.
- **File System Access API**: Allow users to map local OS folders directly to the ComiKaiju Library without importing/copying files.
- **Direct Streaming**: Read high-resolution comics directly from the hard drive to bypass browser IndexedDB storage quotas.
- **File Associations**: Register ComiKaiju as a default handler for `.cbz` and `.cbr` files on supported operating systems.
- **Folder Watching**: Automatically detect new files added to mapped local folders.

## 📊 Telemetry
Understanding usage patterns and identifying pain points.
- **Anonymous Analytics**: Track page views and interaction counts (e.g., "how many times is the reader opened?") without collecting Personal Identifiable Information (PII).
- **Error Reporting**: Automatically aggregate global errors and crashes to prioritize bug fixes.
- **Performance Monitoring**: Measure load times for archives and page extraction to optimize the processing engine.
- **Opt-out Mechanism**: Provide a clear privacy toggle for users who prefer zero-telemetry.

## 🎨 Reader Experience
Refining the visual interface for maximum immersion.
- **Dynamic Backgrounds**: Ambient background coloring that reacts to the current page content.
    - **Edge Sampling**: Use a Canvas-based extractor to sample only image edges (top, bottom, left, right) for high performance.
    - **Adaptive Mixing**: Use CSS `color-mix()` to blend extracted colors with a neutral base (e.g., 80% black) to prevent distraction.

---

## 🛠 Tech Stack Extensions
*To support the roadmap above, the following technologies will be explored:*
- **Auth**: Supabase or Firebase for rapid account implementation.
- **Search**: `FlexSearch` or `Fuse.js` for client-side indexing.
- **Cloud**: Integration with provider-specific SDKs (e.g., Google Picker API).