<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { currentComic, currentPageIndex, viewSettings } from '../store/session.js';
	import type { ComicBook } from '../../types/comic.js';
	
	export let comic: ComicBook;
	export let onExtractPage: (index: number) => Promise<Blob>;
	
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let currentImageUrl: string | null = null;
	let isImageLoading = false;
	let zoomLevel = 1;
	let panX = 0;
	let panY = 0;
	let isDragging = false;
	let lastMouseX = 0;
	let lastMouseY = 0;
	let currentImage: HTMLImageElement | null = null;
	let isFirstLoad = true; // Track if this is the first page load
	
	$: if (comic && $currentPageIndex !== undefined) {
		loadCurrentPage();
	}
	
	onMount(() => {
		ctx = canvas.getContext('2d')!;
		loadCurrentPage();
		
		// Keyboard navigation
		window.addEventListener('keydown', handleKeydown);
		
		// Mouse events for zoom and pan
		canvas.addEventListener('wheel', handleWheel, { passive: false });
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mouseup', handleMouseUp);
		canvas.addEventListener('mouseleave', handleMouseUp);
	});
	
	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
		canvas?.removeEventListener('wheel', handleWheel);
		canvas?.removeEventListener('mousedown', handleMouseDown);
		canvas?.removeEventListener('mousemove', handleMouseMove);
		canvas?.removeEventListener('mouseup', handleMouseUp);
		canvas?.removeEventListener('mouseleave', handleMouseUp);
		
		if (currentImageUrl) {
			URL.revokeObjectURL(currentImageUrl);
		}
	});
	
	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowLeft':
			case 'PageUp':
				goToPreviousPage();
				break;
			case 'ArrowRight':
			case 'PageDown':
			case ' ':
				event.preventDefault();
				goToNextPage();
				break;
			case 'Home':
				goToPage(0);
				break;
			case 'End':
				goToPage(comic.totalPages - 1);
				break;
			case '=':
			case '+':
				zoomIn();
				break;
			case '-':
				zoomOut();
				break;
			case '0':
				resetZoom();
				break;
		}
	}
	
	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		
		if (event.ctrlKey || event.metaKey) {
			// Zoom with Ctrl+scroll
			const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
			zoomLevel = Math.max(0.1, Math.min(5, zoomLevel * zoomFactor));
			drawCurrentImage();
		} else {
			// Pan with scroll
			panX -= event.deltaX;
			panY -= event.deltaY;
			drawCurrentImage();
		}
	}
	
	function handleMouseDown(event: MouseEvent) {
		isDragging = true;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
		canvas.style.cursor = 'grabbing';
	}
	
	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) {
			canvas.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
			return;
		}
		
		const deltaX = event.clientX - lastMouseX;
		const deltaY = event.clientY - lastMouseY;
		
		panX += deltaX;
		panY += deltaY;
		
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
		
		drawCurrentImage();
	}
	
	function handleMouseUp() {
		isDragging = false;
		canvas.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
	}
	
	function goToPreviousPage() {
		if ($currentPageIndex > 0) {
			currentPageIndex.set($currentPageIndex - 1);
		}
	}
	
	function goToNextPage() {
		if ($currentPageIndex < comic.totalPages - 1) {
			currentPageIndex.set($currentPageIndex + 1);
		}
	}
	
	function goToPage(index: number) {
		if (index >= 0 && index < comic.totalPages) {
			currentPageIndex.set(index);
			// Don't reset zoom/pan - maintain current view state
		}
	}
	
	function zoomIn() {
		zoomLevel = Math.min(5, zoomLevel * 1.2);
		drawCurrentImage();
	}
	
	function zoomOut() {
		zoomLevel = Math.max(0.1, zoomLevel * 0.8);
		drawCurrentImage();
	}
	
	function resetZoom() {
		zoomLevel = 1;
		panX = 0;
		panY = 0;
		drawCurrentImage();
	}
	
	function fitToWidth() {
		if (!currentImage) return;
		const canvasRect = canvas.getBoundingClientRect();
		zoomLevel = canvasRect.width / currentImage.width;
		panX = 0;
		panY = 0;
		drawCurrentImage();
	}
	
	function fitToHeight() {
		if (!currentImage) return;
		const canvasRect = canvas.getBoundingClientRect();
		zoomLevel = canvasRect.height / currentImage.height;
		panX = 0;
		panY = 0;
		drawCurrentImage();
	}
	
	async function loadCurrentPage() {
		if (!comic || $currentPageIndex < 0 || $currentPageIndex >= comic.totalPages) {
			return;
		}
		
		isImageLoading = true;
		
		try {
			// Clean up previous image URL
			if (currentImageUrl) {
				URL.revokeObjectURL(currentImageUrl);
				currentImageUrl = null;
			}
			
			// Extract the page image
			const blob = await onExtractPage($currentPageIndex);
			currentImageUrl = URL.createObjectURL(blob);
			
			// Load and draw the image
			const img = new Image();
			img.onload = () => {
				currentImage = img;
				// Only apply fit mode on first load, maintain view state on page changes
				if (isFirstLoad) {
					if ($viewSettings.fitMode === 'fit-width') {
						fitToWidth();
					} else if ($viewSettings.fitMode === 'fit-height') {
						fitToHeight();
					} else {
						resetZoom();
					}
					isFirstLoad = false;
				} else {
					// Just redraw with current zoom/pan settings
					drawCurrentImage();
				}
				isImageLoading = false;
			};
			img.onerror = () => {
				console.error('Failed to load image');
				isImageLoading = false;
			};
			img.src = currentImageUrl;
			
		} catch (error) {
			console.error('Failed to extract page:', error);
			isImageLoading = false;
		}
	}
	
	function drawCurrentImage() {
		if (!currentImage || !ctx) return;
		
		const canvasRect = canvas.getBoundingClientRect();
		canvas.width = canvasRect.width * window.devicePixelRatio;
		canvas.height = canvasRect.height * window.devicePixelRatio;
		ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
		
		// Clear canvas
		ctx.clearRect(0, 0, canvasRect.width, canvasRect.height);
		
		// Calculate drawing dimensions with zoom
		const drawWidth = currentImage.width * zoomLevel;
		const drawHeight = currentImage.height * zoomLevel;
		
		// Calculate pan limits to keep image within view
		let offsetX = panX;
		let offsetY = panY;
		
		// Constrain panning to keep image visible
		if (drawWidth > canvasRect.width) {
			// Image is wider than canvas - allow panning but keep some image visible
			const maxPanX = Math.min(50, drawWidth * 0.1); // Show at least 10% or 50px
			const minPanX = canvasRect.width - drawWidth + Math.min(50, drawWidth * 0.1);
			offsetX = Math.max(minPanX, Math.min(maxPanX, panX));
		} else {
			// Image is smaller than canvas - center it
			offsetX = (canvasRect.width - drawWidth) / 2;
		}
		
		if (drawHeight > canvasRect.height) {
			// Image is taller than canvas - allow panning but keep some image visible
			const maxPanY = Math.min(50, drawHeight * 0.1); // Show at least 10% or 50px
			const minPanY = canvasRect.height - drawHeight + Math.min(50, drawHeight * 0.1);
			offsetY = Math.max(minPanY, Math.min(maxPanY, panY));
		} else {
			// Image is smaller than canvas - center it
			offsetY = (canvasRect.height - drawHeight) / 2;
		}
		
		// Update pan values with constrained values
		panX = offsetX;
		panY = offsetY;
		
		// Draw the image
		ctx.drawImage(currentImage, offsetX, offsetY, drawWidth, drawHeight);
	}
	
	function handleResize() {
		drawCurrentImage();
	}
	
	function handleViewModeChange() {
		// Apply the selected view mode immediately when changed by user
		if ($viewSettings.fitMode === 'fit-width') {
			fitToWidth();
		} else if ($viewSettings.fitMode === 'fit-height') {
			fitToHeight();
		} else {
			resetZoom();
		}
	}
</script>

<svelte:window on:resize={handleResize} />

<div class="viewer">
	<div class="viewer-header">
		<h2>{comic.title}</h2>
		<div class="page-info">
			Page {$currentPageIndex + 1} of {comic.totalPages}
		</div>
		<div class="controls">
			<button on:click={goToPreviousPage} disabled={$currentPageIndex <= 0}>
				← Previous
			</button>
			
			<div class="zoom-controls">
				<button on:click={zoomOut} title="Zoom Out (- key)">−</button>
				<span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
				<button on:click={zoomIn} title="Zoom In (+ key)">+</button>
				<button on:click={resetZoom} title="Reset Zoom (0 key)">⌂</button>
				<button on:click={handleViewModeChange} title="Reapply fit mode" class="fit-button">⟳</button>
			</div>
			
			<select bind:value={$viewSettings.fitMode} on:change={handleViewModeChange}>
				<option value="fit-width">Fit Width</option>
				<option value="fit-height">Fit Height</option>
				<option value="original">Original Size</option>
			</select>
			
			<button on:click={goToNextPage} disabled={$currentPageIndex >= comic.totalPages - 1}>
				Next →
			</button>
		</div>
	</div>
	
	<div class="viewer-content">
		<canvas 
			bind:this={canvas}
			class="page-canvas"
			class:loading={isImageLoading}
		></canvas>
		
		{#if isImageLoading}
			<div class="loading-overlay">
				<div class="loading-spinner"></div>
				<p>Loading page...</p>
			</div>
		{/if}
		
		<div class="help-text">
			<small>
				<strong>Navigation:</strong> Arrow keys, spacebar • 
				<strong>Zoom:</strong> Ctrl+Scroll, +/- keys • 
				<strong>Pan:</strong> Drag or scroll (borders enforced)
			</small>
		</div>
	</div>
</div>

<style>
	.viewer {
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		color: white;
	}
	
	.viewer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: #2a2a2a;
		border-bottom: 1px solid #444;
	}
	
	.viewer-header h2 {
		margin: 0;
		font-size: 1.2rem;
		truncate: true;
	}
	
	.page-info {
		font-size: 0.9rem;
		color: #ccc;
	}
	
	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	
	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem;
		background: #333;
		border-radius: 6px;
	}
	
	.zoom-controls button {
		padding: 0.5rem 0.75rem;
		background: #555;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: bold;
		min-width: 36px;
		transition: background 0.2s;
	}
	
	.zoom-controls button:hover {
		background: #666;
	}
	
	.zoom-controls .fit-button {
		background: #667eea;
		color: white;
	}
	
	.zoom-controls .fit-button:hover {
		background: #5a6fd8;
	}
	
	.zoom-level {
		color: #ccc;
		font-size: 0.9rem;
		font-weight: 500;
		min-width: 50px;
		text-align: center;
		padding: 0 0.5rem;
	}
	
	.controls button {
		padding: 0.5rem 1rem;
		background: #444;
		color: white;
		border: 1px solid #666;
		border-radius: 4px;
		cursor: pointer;
	}
	
	.controls button:hover:not(:disabled) {
		background: #555;
	}
	
	.controls button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.controls select {
		padding: 0.5rem;
		background: #444;
		color: white;
		border: 1px solid #666;
		border-radius: 4px;
	}
	
	.viewer-content {
		flex: 1;
		position: relative;
		overflow: hidden;
	}
	
	.page-canvas {
		width: 100%;
		height: 100%;
		user-select: none;
	}
	
	.help-text {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: #ccc;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		pointer-events: none;
		opacity: 0.8;
		transition: opacity 0.3s;
	}
	
	.viewer-content:hover .help-text {
		opacity: 0.3;
	}
	
	.loading-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		background: rgba(0, 0, 0, 0.8);
		padding: 2rem;
		border-radius: 8px;
	}
	
	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #444;
		border-top: 4px solid #fff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}
	
	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
</style>
