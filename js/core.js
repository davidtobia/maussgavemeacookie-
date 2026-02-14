/*
 * core.js - Minimal utilities for scroll detection and performance
 * maussgavemeacookie - a gift to the internet
 */

// Throttle function for performance - limits function execution frequency
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Check if element is in viewport
function isInViewport(element, threshold = 0) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;

  const vertInView = (rect.top <= windowHeight - threshold) && ((rect.top + rect.height) >= threshold);
  const horInView = (rect.left <= windowWidth - threshold) && ((rect.left + rect.width) >= threshold);

  return vertInView && horInView;
}

// Get scroll percentage of page
function getScrollPercentage() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
}

// Get scroll percentage within an element
function getElementScrollPercentage(element) {
  const rect = element.getBoundingClientRect();
  const elementTop = rect.top + window.pageYOffset;
  const elementHeight = rect.height;
  const scrollTop = window.pageYOffset;
  const windowHeight = window.innerHeight;

  // Calculate how much of the element has been scrolled through
  const scrollStart = elementTop - windowHeight;
  const scrollEnd = elementTop + elementHeight;
  const scrollRange = scrollEnd - scrollStart;
  const scrollPosition = scrollTop - scrollStart;

  const percentage = Math.max(0, Math.min(100, (scrollPosition / scrollRange) * 100));
  return percentage;
}

// Add scroll state to body for CSS targeting
function updateScrollState() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollPercentage = getScrollPercentage();

  // Add classes based on scroll position
  if (scrollTop > 50) {
    document.body.classList.add('is-scrolled');
  } else {
    document.body.classList.remove('is-scrolled');
  }

  if (scrollPercentage > 90) {
    document.body.classList.add('near-bottom');
  } else {
    document.body.classList.remove('near-bottom');
  }
}

// Initialize scroll state tracking
function initScrollState() {
  const throttledUpdate = throttle(updateScrollState, 100);
  window.addEventListener('scroll', throttledUpdate);
  updateScrollState(); // Initial state
}

// Wait for DOM to be ready
function ready(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    throttle,
    isInViewport,
    getScrollPercentage,
    getElementScrollPercentage,
    updateScrollState,
    initScrollState,
    ready
  };
}
