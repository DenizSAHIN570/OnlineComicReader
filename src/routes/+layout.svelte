<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { error, clearError } from '$lib/store/session.js';
	import { filterStore } from '$lib/store/filterStore';
	
	// Track mouse usage for focus styles
	onMount(() => {
		filterStore.init();
		let isMouseUser = false;
		
		function handleMouseDown() {
			isMouseUser = true;
			document.body.classList.add('mouse-user');
		}
		
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Tab') {
				isMouseUser = false;
				document.body.classList.remove('mouse-user');
			}
		}
		
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('keydown', handleKeyDown);
		
		return () => {
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
	
	// Global error handler
	$: if ($error) {
		console.error('Global error:', $error);
		// Auto-clear errors after 10 seconds
		setTimeout(() => {
			clearError();
		}, 10000);
	}
</script>

<main>
	<slot />
</main>

{#if $error}
	<div class="global-error" role="alert">
		<div class="error-content">
			<span class="error-icon">⚠️</span>
			<span class="error-message">{$error}</span>
			<button class="error-dismiss" on:click={clearError} aria-label="Dismiss error">
				✕
			</button>
		</div>
	</div>
{/if}

<style>
	main {
		min-height: 100vh;
	}
	
	.global-error {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 10000;
		max-width: 400px;
		background: #f44336;
		color: white;
		border-radius: 4px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		animation: slideIn 0.3s ease-out;
	}
	
	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	.error-content {
		display: flex;
		align-items: center;
		padding: 1rem;
		gap: 0.5rem;
	}
	
	.error-icon {
		flex-shrink: 0;
	}
	
	.error-message {
		flex: 1;
		font-size: 0.9rem;
		line-height: 1.4;
		white-space: pre-line;
	}
	
	.error-dismiss {
		background: none;
		border: none;
		color: white;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		opacity: 0.8;
		flex-shrink: 0;
	}
	
	.error-dismiss:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}
	
	@media (max-width: 480px) {
		.global-error {
			top: 0.5rem;
			right: 0.5rem;
			left: 0.5rem;
			max-width: none;
		}
	}
</style>
