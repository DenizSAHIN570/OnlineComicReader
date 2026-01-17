<script lang="ts">
	let fileInput: HTMLInputElement;

	function triggerFileInput() {
		fileInput.click();
	}

	async function handleFolderSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files) return;

		for (const file of files) {
			console.log(file.webkitRelativePath);
		}
	}
</script>

<div>
	<button on:click={triggerFileInput}>Upload Folder</button>
	<input
		bind:this={fileInput}
		type="file"
		webkitdirectory
		style="display: none;"
		on:change={handleFolderSelect}
	/>
</div>
