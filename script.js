(() => {
  const image = document.getElementById('diagramImage');
  const viewport = document.getElementById('diagramViewport');
  const card = document.querySelector('.diagram-card');
  const zoomValue = document.getElementById('zoomValue');
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');
  const zoomReset = document.getElementById('zoomReset');
  const fullscreen = document.getElementById('fullscreen');

  let zoom = 1;
  const minZoom = 1;
  const maxZoom = 2.5;
  const step = 0.25;

  function renderZoom() {
    image.style.width = `${zoom * 100}%`;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= minZoom;
    zoomIn.disabled = zoom >= maxZoom;
  }

  function setZoom(nextZoom) {
    const oldWidth = image.clientWidth || viewport.clientWidth;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    const relativeX = centerX / oldWidth;
    const relativeY = centerY / (image.clientHeight || viewport.clientHeight);

    zoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
    renderZoom();

    requestAnimationFrame(() => {
      viewport.scrollLeft = relativeX * image.clientWidth - viewport.clientWidth / 2;
      viewport.scrollTop = relativeY * image.clientHeight - viewport.clientHeight / 2;
    });
  }

  zoomIn.addEventListener('click', () => setZoom(zoom + step));
  zoomOut.addEventListener('click', () => setZoom(zoom - step));
  zoomReset.addEventListener('click', () => {
    zoom = 1;
    renderZoom();
    viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  });

  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? step : -step));
  }, { passive: false });

  fullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await card.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {
      viewport.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'સંપૂર્ણ સ્ક્રીન બંધ કરો' : 'સંપૂર્ણ સ્ક્રીનમાં જુઓ');
  });

  image.addEventListener('error', () => {
    viewport.innerHTML = '<p class="image-error">આકૃતિ લોડ થઈ શકી નથી. કૃપા કરીને પાનું ફરીથી ખોલો.</p>';
  });

  renderZoom();
})();
