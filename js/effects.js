/*
 * effects.js - Scroll effects, parallax, mood transitions, scene activation
 * maussgavemeacookie - a gift to the internet
 */

// Parallax Effect
function initParallax() {
  const parallaxElements = document.querySelectorAll('[data-scroll-behavior="parallax"]');

  if (parallaxElements.length === 0) return;

  const handleParallax = throttle(() => {
    parallaxElements.forEach(element => {
      if (!isInViewport(element, 200)) return;

      const speed = parseFloat(element.dataset.parallaxSpeed) || 0.5;
      const rect = element.getBoundingClientRect();
      const scrolled = window.pageYOffset;
      const elementTop = rect.top + scrolled;
      const offset = (scrolled - elementTop) * speed;

      element.style.transform = `translateY(${offset}px)`;
    });
  }, 10);

  window.addEventListener('scroll', handleParallax);
  handleParallax(); // Initial state
}

// Fade-in Effect
function initFadeIn() {
  const fadeElements = document.querySelectorAll('[data-scroll-behavior="fade-in"]');

  if (fadeElements.length === 0) return;

  // Set initial state
  fadeElements.forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  });

  const handleFadeIn = throttle(() => {
    fadeElements.forEach(element => {
      if (isInViewport(element, 100) && element.style.opacity === '0') {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }
    });
  }, 100);

  window.addEventListener('scroll', handleFadeIn);
  handleFadeIn(); // Initial check
}

// Scene Activation and Mood Transitions
function initSceneActivation() {
  const scenes = document.querySelectorAll('.scene[data-mood]');

  if (scenes.length === 0) return;

  let currentMood = null;

  const handleSceneActivation = () => {
    let activeScene = null;
    let maxVisibleArea = 0;

    // Find which scene has the most visible area
    scenes.forEach(scene => {
      const rect = scene.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate visible area of this scene
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      // Calculate what percentage of the viewport this scene occupies
      const visibleArea = visibleHeight / viewportHeight;

      // The scene with the largest visible area wins
      if (visibleArea > maxVisibleArea && visibleArea > 0.2) { // Minimum 20% visibility
        maxVisibleArea = visibleArea;
        activeScene = scene;
      }
    });

    // Apply mood from active scene to body
    if (activeScene) {
      const mood = activeScene.dataset.mood;
      if (mood && mood !== currentMood) {
        // Add new mood
        document.body.setAttribute('data-mood', mood);
        scenes.forEach(s => s.classList.remove('active-scene'));
        activeScene.classList.add('active-scene');
        currentMood = mood;
      }
    }
  };

  const throttledHandler = throttle(handleSceneActivation, 150);
  window.addEventListener('scroll', throttledHandler);
  handleSceneActivation(); // Initial state
}

// Typography Emphasis - Gradually emphasize text based on scroll
function initTypographyEmphasis() {
  const emphasisElements = document.querySelectorAll('[data-scroll-behavior="emphasize"]');

  if (emphasisElements.length === 0) return;

  const handleEmphasis = throttle(() => {
    emphasisElements.forEach(element => {
      const percentage = getElementScrollPercentage(element);

      if (percentage > 0 && percentage < 100) {
        // Gradually increase font weight as element scrolls through viewport
        const minWeight = 400;
        const maxWeight = 700;
        const weight = minWeight + ((maxWeight - minWeight) * (percentage / 100));
        element.style.fontWeight = Math.floor(weight);
      }
    });
  }, 50);

  window.addEventListener('scroll', handleEmphasis);
  handleEmphasis();
}

// Scale effect - Grow/shrink elements based on scroll
function initScaleEffect() {
  const scaleElements = document.querySelectorAll('[data-scroll-behavior="scale"]');

  if (scaleElements.length === 0) return;

  const handleScale = throttle(() => {
    scaleElements.forEach(element => {
      if (!isInViewport(element, 100)) return;

      const percentage = getElementScrollPercentage(element);
      const minScale = parseFloat(element.dataset.scaleMin) || 0.8;
      const maxScale = parseFloat(element.dataset.scaleMax) || 1.2;

      if (percentage > 0 && percentage < 100) {
        const scale = minScale + ((maxScale - minScale) * (percentage / 100));
        element.style.transform = `scale(${scale})`;
      }
    });
  }, 50);

  window.addEventListener('scroll', handleScale);
  handleScale();
}

// Initialize all effects
function initAllEffects() {
  // Scroll effects disabled to prevent bugs
  // Scene moods can be added via simple CSS classes instead
  initScrollState();
}

// Auto-initialize when DOM is ready
ready(() => {
  initAllEffects();
});

// Export for manual initialization if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initParallax,
    initFadeIn,
    initSceneActivation,
    initTypographyEmphasis,
    initScaleEffect,
    initAllEffects
  };
}
