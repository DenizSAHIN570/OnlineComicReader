
import { writable, type Writable } from 'svelte/store';
import { comicStorage } from '$lib/storage/comicStorage';

export type Filter = 'none' | 'monochrome' | 'color-correction' | 'vintage' | 'vibrant';

export const availableFilters: { id: Filter; name: string }[] = [
	{ id: 'none', name: 'None' },
	{ id: 'monochrome', name: 'Monochrome' },
	{ id: 'color-correction', name: 'Color Correction' },
	{ id: 'vintage', name: 'Vintage' },
	{ id: 'vibrant', name: 'Vibrant' }
];

const createFilterStore = () => {
	const { subscribe, set, update }: Writable<Record<string, Filter>> = writable({});

	return {
		subscribe,
		set,
		update,
		async init() {
			const settings = await comicStorage.loadAllFilterSettings();
			set(settings as Record<string, Filter>);
		},
		async setFilter(comicId: string, filter: Filter) {
			await comicStorage.saveFilterSetting(comicId, filter);
			update((state) => {
				state[comicId] = filter;
				return state;
			});
		}
	};
};

export const filterStore = createFilterStore();
