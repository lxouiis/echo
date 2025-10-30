document.addEventListener('DOMContentLoaded', () => {

    const earth = document.querySelector('.hero-earth');
    if (!earth) return;

    // A flag to prevent the scroll event from firing too often
    let isTicking = false;

    function animateEarthOnScroll() {
        const scrollY = window.scrollY;

        // Calculate new scale and position
        // The earth shrinks and moves up as you scroll down
        const scale = Math.max(0.4, 1 - scrollY / 1000); // Don't let it get smaller than 40%
        const translateY = scrollY * 0.3; // Moves up at 30% of scroll speed

        // Apply the transformation
        // We keep the original translate(-50%, -50%) for centering and add our new values
        earth.style.transform = `translate(-50%, calc(-50% - ${translateY}px)) scale(${scale})`;

        isTicking = false;
    }

    // Listen for scroll events
    window.addEventListener('scroll', () => {
        if (!isTicking) {
            // Use requestAnimationFrame to ensure smooth animation
            window.requestAnimationFrame(animateEarthOnScroll);
            isTicking = true;
        }
    });

});