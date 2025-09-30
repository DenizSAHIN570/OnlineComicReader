
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/reader";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/reader": Record<string, never>
		};
		Pathname(): "/" | "/reader" | "/reader/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/lib/libunrar.js" | "/libarchive/build/compiled/archive-reader.d.ts" | "/libarchive/build/compiled/compressed-file.d.ts" | "/libarchive/build/compiled/formats.d.ts" | "/libarchive/build/compiled/libarchive-browser.d.ts" | "/libarchive/build/compiled/libarchive-node.d.ts" | "/libarchive/build/compiled/libarchive.d.ts" | "/libarchive/build/compiled/utils.d.ts" | "/libarchive/libarchive-node.mjs" | "/libarchive/libarchive.js" | "/libarchive/libarchive.wasm" | "/libarchive/worker-bundle-node.mjs" | "/libarchive/worker-bundle.js" | string & {};
	}
}