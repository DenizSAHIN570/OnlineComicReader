<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { currentPageIndex, viewSettings } from '../store/session.js';
	import { filterStore, type Filter } from '$lib/store/filterStore';
	import type { ComicBook } from '../../types/comic.js';
	import FilterButton from './FilterButton.svelte';
	import { applyMonochrome } from '$lib/filters/monochrome';
	import { applyColorCorrection } from '$lib/filters/colorCorrection';
	import { applyVintage } from '$lib/filters/vintage';
	import { applyVibrant } from '$lib/filters/vibrant';
	import { logger } from '$lib/services/logger';

	const UI_HIDE_DELAY = 2200;
	const MAX_ZOOM = 5;
	const MIN_ZOOM = 0.1;

	export let comic: ComicBook;
	export let onExtractPage: (index: number) => Promise<Blob>;
	export let onExit: (() => Promise<void> | void) | undefined;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	let currentImage: HTMLImageElement | null = null;
	let currentImageUrl: string | null = null;

	let isImageLoading = false;
	let isUiVisible = true;
	let isUiPinned = false;
	let isExiting = false;

	let zoomLevel = 1;
	let panX = 0;
	let panY = 0;
	let isDragging = false;
	let lastPointerX = 0;
	let lastPointerY = 0;

	let hideUiTimer: ReturnType<typeof setTimeout> | null = null;
	let ignoreNextTap = false;

	const activePointers = new Map<number, { x: number; y: number }>();
	let isPinching = false;
	let pinchStartDistance = 0;
	let pinchStartZoom = 1;

	let hasAppliedInitialView = false;
	let activeFilter: Filter = 'none';

	$: if (comic && $currentPageIndex !== undefined) {
		loadCurrentPage();
	}

	$: if (comic && $filterStore[comic.id]) {
		activeFilter = $filterStore[comic.id];
		drawCurrentImage();
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		loadCurrentPage();

		window.addEventListener('keydown', handleKeydown);
		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerUp);
		canvas.addEventListener('wheel', handleWheel, { passive: false });

		showUi(true);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
		canvas?.removeEventListener('pointerdown', handlePointerDown);
		canvas?.removeEventListener('pointermove', handlePointerMove);
		canvas?.removeEventListener('pointerup', handlePointerUp);
		canvas?.removeEventListener('pointercancel', handlePointerUp);
		canvas?.removeEventListener('wheel', handleWheel);

		activePointers.clear();

		if (hideUiTimer) {
			clearTimeout(hideUiTimer);
			hideUiTimer = null;
		}
		if (currentImageUrl) {
			URL.revokeObjectURL(currentImageUrl);
			currentImageUrl = null;
		}
	});

	async function loadCurrentPage() {
		if (!comic || $currentPageIndex < 0 || $currentPageIndex >= comic.totalPages) return;

		isImageLoading = true;
		try {
			if (currentImageUrl) {
				URL.revokeObjectURL(currentImageUrl);
				currentImageUrl = null;
			}

			const blob = await onExtractPage($currentPageIndex);
			currentImageUrl = URL.createObjectURL(blob);

			const img = new Image();
			img.onload = () => {
				currentImage = img;
				if (!hasAppliedInitialView) {
					applyViewMode();
					hasAppliedInitialView = true;
				} else {
					clampPan();
					drawCurrentImage();
				}
				isImageLoading = false;
			};
			img.onerror = () => {
				logger.error('Viewer', 'Failed to load image');
				isImageLoading = false;
			};
			img.src = currentImageUrl;
		} catch (error) {
			logger.error('Viewer', 'Failed to extract page', error);
			isImageLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowLeft':
			case 'PageUp':
				goToPreviousPage();
				hideUi();
				break;
			case 'ArrowRight':
			case 'PageDown':
			case ' ':
				event.preventDefault();
				goToNextPage();
				hideUi();
				break;
			case 'Home':
				goToPage(0);
				break;
			case 'End':
				goToPage(comic.totalPages - 1);
				break;
			case '=':
			case '+':
				updateZoom(zoomLevel * 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
				break;
			case '-':
				updateZoom(zoomLevel * 0.8, canvas.clientWidth / 2, canvas.clientHeight / 2);
				break;
			case '0':
				resetZoom();
				break;
		}
	}

	function handlePointerDown(event: PointerEvent) {
		if (!canvas) return;
		canvas.setPointerCapture(event.pointerId);
		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (activePointers.size === 2) {
			startPinch();
			ignoreNextTap = true;
			return;
		}

		if (event.button !== undefined && event.button !== 0) {
			return;
		}

		isDragging = true;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
		ignoreNextTap = false;

		showUi(true);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!canvas) return;
		if (!activePointers.has(event.pointerId)) return;

		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (isPinching && activePointers.size >= 2) {
			updatePinchZoom();
			return;
		}

		if (!isDragging) return;

		const deltaX = event.clientX - lastPointerX;
		const deltaY = event.clientY - lastPointerY;

		if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
			ignoreNextTap = true;
		}

		panX += deltaX;
		panY += deltaY;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		clampPan();
		drawCurrentImage();
	}

	function handlePointerUp(event: PointerEvent) {
		if (!canvas) return;
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}

		activePointers.delete(event.pointerId);

		if (activePointers.size < 2) {
			isPinching = false;
			pinchStartDistance = 0;
		}

		if (activePointers.size === 0) {
			isDragging = false;
		}
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		showUi(true);

		if (event.ctrlKey || event.metaKey) {
			const factor = event.deltaY > 0 ? 0.9 : 1.1;
			updateZoom(zoomLevel * factor, event.clientX, event.clientY);
		} else {
			panX -= event.deltaX;
			panY -= event.deltaY;
			clampPan();
			drawCurrentImage();
		}
	}

	function handleTap(event: MouseEvent) {
		if (ignoreNextTap) {
			ignoreNextTap = false;
			return;
		}

		const target = event.currentTarget as HTMLElement | null;
		if (!target) return;

		const rect = target.getBoundingClientRect();
		const relativeX = event.clientX - rect.left;
		const leftZone = rect.width / 3;
		const rightZone = rect.width * (2 / 3);

		showUi(true);

		if (relativeX < leftZone) {
			goToPreviousPage();
			hideUi();
			return;
		}

		if (relativeX > rightZone) {
			goToNextPage();
			hideUi();
			return;
		}

		isUiPinned = !isUiPinned;
		if (isUiPinned) {
			showUi(false);
		} else {
			hideUi();
		}
	}

	function handleContentKey(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		handleTap(event as unknown as MouseEvent);
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
		}
	}

	function resetZoom() {
		zoomLevel = 1;
		panX = 0;
		panY = 0;
		clampPan();
		drawCurrentImage();
	}

	function clampZoom(value: number) {
		return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
	}

	function applyViewMode() {
		if (!currentImage || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const widthScale = rect.width / currentImage.width;
		const heightScale = rect.height / currentImage.height;

		switch ($viewSettings.fitMode) {
			case 'fit-width':
				zoomLevel = widthScale;
				break;
			case 'fit-height':
				zoomLevel = heightScale;
				break;
			default:
				zoomLevel = 1;
		}

		zoomLevel = clampZoom(zoomLevel);
		panX = 0;
		panY = 0;
		clampPan();
		drawCurrentImage();
	}

	function updateZoom(targetZoom: number, focusClientX: number, focusClientY: number) {
		if (!currentImage || !canvas) return;

		const rect = canvas.getBoundingClientRect();
		const prevZoom = zoomLevel;
		const newZoom = clampZoom(targetZoom);

		if (newZoom === prevZoom) return;

		const focusX = focusClientX - rect.left;
		const focusY = focusClientY - rect.top;

		const prevDrawWidth = currentImage.width * prevZoom;
		const prevDrawHeight = currentImage.height * prevZoom;

		const relX = prevDrawWidth ? (focusX - panX) / prevDrawWidth : 0.5;
		const relY = prevDrawHeight ? (focusY - panY) / prevDrawHeight : 0.5;

		zoomLevel = newZoom;

		const newDrawWidth = currentImage.width * zoomLevel;
		const newDrawHeight = currentImage.height * zoomLevel;

		panX = focusX - relX * newDrawWidth;
		panY = focusY - relY * newDrawHeight;

		clampPan();
		drawCurrentImage();
	}

	function startPinch() {
		const points = Array.from(activePointers.values());
		if (points.length < 2) return;

		pinchStartDistance = distanceBetween(points[0], points[1]);
		pinchStartZoom = zoomLevel;
		isPinching = true;
		isDragging = false;
	}

	function updatePinchZoom() {
		const points = Array.from(activePointers.values());
		if (points.length < 2 || !canvas) return;

		const newDistance = distanceBetween(points[0], points[1]);
		if (pinchStartDistance === 0) {
			pinchStartDistance = newDistance;
			return;
		}

		const scale = newDistance / pinchStartDistance;
		const centerX = (points[0].x + points[1].x) / 2;
		const centerY = (points[0].y + points[1].y) / 2;

		updateZoom(pinchStartZoom * scale, centerX, centerY);
	}

	function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function clampPan() {
		if (!currentImage || !canvas) return;

		const rect = canvas.getBoundingClientRect();
		const drawWidth = currentImage.width * zoomLevel;
		const drawHeight = currentImage.height * zoomLevel;

		if (drawWidth <= rect.width) {
			panX = (rect.width - drawWidth) / 2;
		} else {
			const minX = rect.width - drawWidth;
			panX = Math.min(0, Math.max(minX, panX));
		}

		if (drawHeight <= rect.height) {
			panY = (rect.height - drawHeight) / 2;
		} else {
			const minY = rect.height - drawHeight;
			panY = Math.min(0, Math.max(minY, panY));
		}
	}

	function drawCurrentImage() {
	if (!ctx || !currentImage || !canvas) return;

	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	const displayWidth = rect.width;
	const displayHeight = rect.height;

	clampPan();

		const width = Math.round(displayWidth * dpr);
		const height = Math.round(displayHeight * dpr);

		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, displayWidth, displayHeight);
		ctx.drawImage(currentImage, panX, panY, currentImage.width * zoomLevel, currentImage.height * zoomLevel);

		// Apply filter
		switch (activeFilter) {
			case 'monochrome':
				applyMonochrome(ctx);
				break;
			case 'color-correction':
				applyColorCorrection(ctx);
				break;
			case 'vintage':
				applyVintage(ctx);
				break;
			case 'vibrant':
				applyVibrant(ctx);
				break;
		}

		ctx.restore();
	}

	function handleViewModeChange() {
		if (!currentImage) return;
		applyViewMode();
		showUi(true);
	}

	function showUi(autoHide: boolean) {
		isUiVisible = true;
		if (hideUiTimer) {
			clearTimeout(hideUiTimer);
			hideUiTimer = null;
		}

		if (autoHide && !isUiPinned) {
			hideUiTimer = setTimeout(() => {
				isUiVisible = false;
				hideUiTimer = null;
			}, UI_HIDE_DELAY);
		}
	}

	function hideUi() {
		if (isUiPinned) return;
		if (hideUiTimer) {
			clearTimeout(hideUiTimer);
			hideUiTimer = null;
		}
		isUiVisible = false;
	}

	async function handleExit() {
		if (!onExit || isExiting) return;
		isExiting = true;
		try {
			await onExit();
		} finally {
			isExiting = false;
		}
	}
</script>

<svelte:window on:resize={drawCurrentImage} />

<div class="viewer" class:ui-visible={isUiVisible || isUiPinned}>
	<FilterButton {comic} />
	<div
		class="canvas-layer"
		class:dragging={isDragging}
		role="button"
		tabindex="0"
		aria-pressed={isUiPinned}
		aria-label="Comic page viewer. Tap or click left to go back, right to advance, center to toggle controls."
		on:click={handleTap}
		on:keydown={handleContentKey}
	>
		<canvas bind:this={canvas} class:loading={isImageLoading}></canvas>

		{#if isImageLoading}
			<div class="loading-overlay">
				<div class="loading-spinner"></div>
				<p>Loading page...</p>
			</div>
		{/if}

		<div class="help-overlay" class:hidden={!isUiVisible && !isUiPinned}>
			<small>
				<strong>Navigation:</strong> tap left/right or use arrow keys •
				<strong>Zoom:</strong> pinch or scroll •
				<strong>Pan:</strong> drag the page
			</small>
		</div>
	</div>

	<div class="overlay overlay-top" class:hidden={!isUiVisible && !isUiPinned}>
		{#if onExit}
			<button class="back-button" on:click={handleExit} disabled={isExiting} aria-label="Go back">
				<span class="arrow">←</span>
				<span>{isExiting ? 'Saving…' : 'Back'}</span>
			</button>
		{/if}

		<div class="header">
			<div class="title-block">
				<h2>{comic.title}</h2>
				<div class="page-info">
					Page {$currentPageIndex + 1} of {comic.totalPages}
				</div>
			</div>

			<div class="controls">
				<button on:click={goToPreviousPage} disabled={$currentPageIndex <= 0} aria-label="Previous page">←</button>

				<div class="zoom-controls">
					<button on:click={() => updateZoom(zoomLevel * 0.9, canvas.clientWidth / 2, canvas.clientHeight / 2)} aria-label="Zoom out">−</button>
					<span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
					<button on:click={() => updateZoom(zoomLevel * 1.1, canvas.clientWidth / 2, canvas.clientHeight / 2)} aria-label="Zoom in">+</button>
					<button on:click={resetZoom} aria-label="Reset zoom">⌂</button>
					<button on:click={handleViewModeChange} aria-label="Apply fit mode">⟳</button>
				</div>

				<select bind:value={$viewSettings.fitMode} on:change={handleViewModeChange} aria-label="View mode">
					<option value="fit-width">Fit Width</option>
					<option value="fit-height">Fit Height</option>
					<option value="original">Original Size</option>
				</select>

				<button on:click={goToNextPage} disabled={$currentPageIndex >= comic.totalPages - 1} aria-label="Next page">
					Next →
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.hidden {
		opacity: 0 !important;
		pointer-events: none !important;
	}

	.viewer {
		position: relative;
		height: 100vh;
		width: 100vw;
		background: #000;
		color: #f5f5f5;
		overflow: hidden;
	}

	.canvas-layer {
		height: 100%;
		width: 100%;
		position: relative;
		touch-action: none;
		cursor: grab;
	}

	.canvas-layer.dragging {
		cursor: grabbing;
	}

	.canvas-layer:focus-visible {
		outline: 2px solid #ff6600;
		outline-offset: 3px;
	}

	canvas {
		height: 100%;
		width: 100%;
		display: block;
		cursor: inherit;
	}

	canvas.loading {
		filter: blur(2px);
	}

	.overlay {
		position: absolute;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		pointer-events: none;
		transition: opacity 0.25s ease;
		opacity: 1;
	}

	.overlay.hidden {
		opacity: 0;
	}

	.overlay-top {
		top: 0;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0) 100%);
		gap: 1rem;
	}

	.overlay-top > * {
		pointer-events: auto;
	}

	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.25rem;
		background: linear-gradient(135deg, #ff6600 0%, #ff8533 100%);
		color: #fff;
		border: none;
		border-radius: 999px;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(255, 102, 0, 0.35);
		transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
	}

	.back-button .arrow {
		font-size: 1.1rem;
		line-height: 1;
	}

	.back-button:not(:disabled):hover {
		transform: translateY(-1px);
		box-shadow: 0 10px 24px rgba(255, 102, 0, 0.45);
	}

	.back-button:disabled {
		opacity: 0.7;
		cursor: progress;
		box-shadow: none;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		width: 100%;
		justify-content: space-between;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.title-block h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #ff8533;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.page-info {
		font-size: 0.9rem;
		color: #d1d1d1;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.controls button {
		padding: 0.5rem 1rem;
		background: #1f1f1f;
		color: #f5f5f5;
		border: 1px solid #2f2f2f;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
	}

	.controls button:hover:not(:disabled) {
		background: #292929;
		border-color: #3a3a3a;
		transform: translateY(-1px);
	}

	.controls button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
	}

	.controls select {
		padding: 0.5rem;
		background: #1f1f1f;
		color: #f5f5f5;
		border: 1px solid #2f2f2f;
		border-radius: 6px;
	}

	.zoom-controls {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: #151515;
		border-radius: 8px;
		border: 1px solid #1f1f1f;
		padding: 0.25rem;
		box-shadow: inset 0 0 12px rgba(255, 255, 255, 0.05);
	}

	.zoom-level {
		color: #ff8533;
		font-size: 0.85rem;
		font-weight: 600;
		min-width: 50px;
		text-align: center;
	}

	.canvas-layer .loading-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 1.5rem;
		border-radius: 10px;
		background: rgba(12, 12, 12, 0.92);
		text-align: center;
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
	}

	.loading-spinner {
		width: 36px;
		height: 36px;
		border: 4px solid rgba(255, 255, 255, 0.15);
		border-top-color: #ff6600;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 0.75rem;
	}

	.help-overlay {
		position: absolute;
		left: 50%;
		bottom: 1.5rem;
		transform: translateX(-50%);
		background: rgba(12, 12, 12, 0.85);
		color: #d9d9d9;
		padding: 0.6rem 1rem;
		border-radius: 999px;
		font-size: 0.75rem;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.08);
		pointer-events: none;
		transition: opacity 0.25s ease;
		opacity: 1;
	}

	.help-overlay.hidden {
		opacity: 0;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.controls {
			gap: 0.6rem;
		}

		.controls button {
			padding: 0.45rem 0.75rem;
		}

		.zoom-controls {
			display: none;
		}
	}
</style>
