/**
 * Holi Color Pop Effect
 * Creates colorful particles when users interact with the screen
 * Works with both mouse and touch events
 */

// Add this to a .js file in your theme assets

document.addEventListener('DOMContentLoaded', function() {
  // Create a container for the Holi effect
  const holiContainer = document.createElement('div');
  holiContainer.className = 'holi-container';
  document.body.appendChild(holiContainer);

  // Holi colors (vibrant traditional Holi colors)
  const holiColors = [
    '#FF5F5F', // Red
    '#FF9933', // Orange
    '#FFEA00', // Yellow
    '#7CFC00', // Green
    '#00BFFF', // Blue
    '#9370DB', // Purple
    '#FF69B4', // Pink
    '#00FFCC'  // Teal
  ];

  // Track whether touch or mouse is being used
  let isTouchDevice = false;

  // Function to create a single color particle
  function createColorParticle(x, y) {
    const particle = document.createElement('div');
    particle.className = 'holi-particle';
    
    // Random size between 10 and 30px
    const size = Math.floor(Math.random() * 20) + 10;
    
    // Random color from our Holi palette
    const color = holiColors[Math.floor(Math.random() * holiColors.length)];
    
    // Random rotation
    const rotation = Math.floor(Math.random() * 360);
    
    // Set styles
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = color;
    particle.style.left = `${x - (size/2)}px`;
    particle.style.top = `${y - (size/2)}px`;
    particle.style.transform = `rotate(${rotation}deg)`;
    
    // Add to container
    holiContainer.appendChild(particle);
    
    // Animate the particle
    setTimeout(() => {
      particle.style.transform = `translate(${(Math.random() - 0.5) * 100}px, ${(Math.random() - 0.5) * 100}px) rotate(${rotation + 180}deg)`;
      particle.style.opacity = '0';
    }, 10);
    
    // Remove particle after animation completes
    setTimeout(() => {
      holiContainer.removeChild(particle);
    }, 1500);
  }

  // Create multiple particles at once
  function createColorBurst(x, y) {
    // Create between 8-15 particles
    const particleCount = Math.floor(Math.random() * 8) + 8;
    
    for (let i = 0; i < particleCount; i++) {
      // Add slight variation to position
      const offsetX = x + (Math.random() - 0.5) * 20;
      const offsetY = y + (Math.random() - 0.5) * 20;
      createColorParticle(offsetX, offsetY);
    }
  }

  // Handle mouse events
  document.addEventListener('mousemove', function(e) {
    // Only respond to mouse if not a touch device (to avoid duplicate events)
    if (!isTouchDevice && e.buttons === 1) {
      createColorBurst(e.clientX, e.clientY);
    }
  });
  
  document.addEventListener('click', function(e) {
    // Don't trigger on form elements to avoid interfering with regular use
    if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) {
      createColorBurst(e.clientX, e.clientY);
    }
  });

  // Handle touch events
  document.addEventListener('touchstart', function() {
    isTouchDevice = true;
  }, { passive: true });
  
  document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      createColorBurst(touch.clientX, touch.clientY);
    }
  }, { passive: true });
});