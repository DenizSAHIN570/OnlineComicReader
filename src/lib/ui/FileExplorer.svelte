<script lang="ts">
	import { onMount } from 'svelte';
	import { fileManager } from '$lib/services/fileManager';

	let contents: any[] = [];
	let currentFolderId: string | null = null;

	onMount(async () => {
		await loadContents(null);
	});

	async function loadContents(folderId: string | null) {
		contents = await fileManager.getContents(folderId);
		currentFolderId = folderId;
	}

	async function createNewFolder() {
		const folderName = prompt('Enter folder name:');
		if (folderName) {
			await fileManager.createFolder(folderName, currentFolderId);
			await loadContents(currentFolderId);
		}
	}
</script>

<div>
	<button on:click={createNewFolder}>New Folder</button>
	<ul>
		{#each contents as item}
			<li>{item.name}</li>
		{/each}
	</ul>
</div>
