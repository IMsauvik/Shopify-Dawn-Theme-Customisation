// Optimized Cart Progress Bar with improved performance and error handling
class CartProgressBar {
  constructor() {
    this.thresholds = [
      { amount: 50000, type: 'shipping', message: 'Free Shipping Unlocked!', benefit: 'free shipping' },
      { amount: 159900, type: 'discount', message: '10% Discount Applied!', benefit: '10% discount' },
      { amount: 249900, type: 'discount', message: '15% Discount Applied!', benefit: '15% discount' },
      { amount: 349900, type: 'discount', message: '20% Discount Applied!', benefit: '20% discount' }
    ];
    this.maxThreshold = Math.max(...this.thresholds.map(t => t.amount));
    
    // Session-based milestone tracking
    this.sessionAchievedMilestones = new Set(
      JSON.parse(sessionStorage.getItem('cart_achieved_milestones') || '[]')
    );
    
    // Offers system
    this.offersCollection = 'dencrus';
    this.availableOffers = [];
    this.addedOffers = new Set();
    this.offerActivationThreshold = 50000;
    this.offerMilestone = 50000;
    this.isLoading = false;
    this.isInitialized = false;
    
    // Cart data tracking
    this.currentCartData = null;
    this.updateTimer = null;
    this.cartObserver = null;
    this.mainProductsTotal = 0;
    
    // Performance optimizations
    this.lastUpdateTime = 0;
    this.minUpdateInterval = 300; // Minimum time between updates
    this.retryAttempts = 0;
    this.maxRetries = 3;
    
    this.init();
  }

  async init() {
    if (this.isInitialized) return;
    console.log('Initializing Cart Progress Bar...');
    
    try {
      // Wait for DOM to be ready
      await this.waitForDOM();
      
      // Initialize in sequence with error handling
      await this.fetchCartData();
      await this.loadOffers();
      this.setupEventListeners();
      await this.updateProgressBar();
      
      this.isInitialized = true;
      console.log('Cart Progress Bar initialized successfully');
      
    } catch (error) {
      console.error('Cart Progress Bar initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  async waitForDOM() {
    if (document.readyState === 'loading') {
      return new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }
  }

  handleInitializationError(error) {
    // Retry initialization after a delay
    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      console.log(`Retrying initialization (${this.retryAttempts}/${this.maxRetries})...`);
      setTimeout(() => {
        this.isInitialized = false;
        this.init();
      }, 2000 * this.retryAttempts);
    } else {
      console.error('Max retry attempts reached. Cart Progress Bar failed to initialize.');
    }
  }

  async fetchCartData() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/cart.js', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.currentCartData = await response.json();
      window.cart = this.currentCartData; // Global reference for other scripts
      
      this.calculateMainProductsTotal();
      console.log('Cart data fetched successfully:', {
        items: this.currentCartData.items?.length || 0,
        total: this.mainProductsTotal
      });
      
      return this.currentCartData;
      
    } catch (error) {
      console.error('Error fetching cart data:', error);
      // Fallback to empty cart
      this.currentCartData = { items: [], item_count: 0, total_price: 0 };
      return this.currentCartData;
    }
  }

  calculateMainProductsTotal() {
    this.mainProductsTotal = 0;
    this.addedOffers.clear();
    
    if (!this.currentCartData?.items) return;
    
    this.currentCartData.items.forEach(item => {
      try {
        if (item.properties?._offer_item) {
          this.addedOffers.add(item.variant_id);
        } else if (!item.properties?._free_gift) {
          this.mainProductsTotal += item.final_line_price || item.line_price || 0;
        }
      } catch (error) {
        console.warn('Error processing cart item:', item, error);
      }
    });
    
    console.log(`Calculated totals - Main: ₹${this.mainProductsTotal/100}, Offers: ${this.addedOffers.size}`);
  }

  calculateAllowedOffers(cartTotal) {
    if (cartTotal < this.offerActivationThreshold) return 0;
    return Math.floor(cartTotal / this.offerMilestone);
  }

  setupEventListeners() {
    // Throttled update function
    const throttledUpdate = this.throttle(() => this.updateProgressBar(), this.minUpdateInterval);
    
    // Cart update events
    document.addEventListener('cart:updated', throttledUpdate);
    
    // Quantity changes
    document.addEventListener('change', (e) => {
      if (e.target.matches('.quantity__input[data-quantity-variant-id]')) {
        setTimeout(throttledUpdate, 500);
      }
    });

    // Form submissions
    document.addEventListener('submit', (e) => {
      if (e.target.action?.includes('/cart/add')) {
        setTimeout(throttledUpdate, 1000);
      }
    });

    // Intercept fetch calls for cart operations
    this.interceptCartFetch();
    
    // Observe cart drawer changes
    this.observeCartDrawer();
  }

  interceptCartFetch() {
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const result = originalFetch.apply(this, args);
      
      const url = args[0];
      if (typeof url === 'string' && this.isCartRelatedURL(url)) {
        result.then(() => {
          setTimeout(() => this.debouncedUpdate(), 500);
        }).catch(() => {
          setTimeout(() => this.debouncedUpdate(), 500);
        });
      }
      
      return result;
    };
  }

  isCartRelatedURL(url) {
    const cartURLs = ['/cart/add', '/cart/change', '/cart/update', '/cart/clear'];
    return cartURLs.some(cartURL => url.includes(cartURL));
  }

  observeCartDrawer() {
    if (this.cartObserver) {
      this.cartObserver.disconnect();
    }

    this.cartObserver = new MutationObserver(this.throttle((mutations) => {
      let shouldUpdate = false;
      
      for (const mutation of mutations) {
        if (this.isCartRelatedMutation(mutation)) {
          shouldUpdate = true;
          break;
        }
      }
      
      if (shouldUpdate) {
        setTimeout(() => this.debouncedUpdate(), 200);
      }
    }, 100));

    this.cartObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  isCartRelatedMutation(mutation) {
    if (mutation.type === 'childList') {
      return Array.from(mutation.addedNodes).some(node => 
        node.nodeType === Node.ELEMENT_NODE && 
        (node.classList?.contains('cart-drawer') || 
         node.querySelector?.('.cart-drawer') ||
         node.classList?.contains('drawer__inner'))
      );
    }
    
    if (mutation.type === 'attributes' && 
        mutation.attributeName === 'class' &&
        mutation.target.classList?.contains('drawer')) {
      return true;
    }
    
    return false;
  }

  // Utility function for throttling
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  debouncedUpdate() {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.minUpdateInterval) {
      if (this.updateTimer) clearTimeout(this.updateTimer);
      this.updateTimer = setTimeout(() => {
        this.lastUpdateTime = Date.now();
        this.updateProgressBar();
      }, this.minUpdateInterval);
      return;
    }
    
    this.lastUpdateTime = now;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.updateProgressBar(), 100);
  }

  async updateProgressBar() {
    try {
      console.log('Updating progress bar...');
      
      await this.fetchCartData();
      
      const currentAmount = this.mainProductsTotal;
      const hasItems = this.currentCartData?.item_count > 0;
      
      this.toggleProgressBarVisibility(hasItems);
      
      if (hasItems) {
        this.updateProgress(currentAmount);
        this.updateOffersSection(currentAmount);
      }
      
      this.injectProgressBarIfNeeded();
      
    } catch (error) {
      console.error('Error updating progress bar:', error);
    }
  }

  toggleProgressBarVisibility(hasItems) {
    const elements = document.querySelectorAll('.cart-progress-bar, .offers-section');
    elements.forEach(el => {
      if (el) el.style.display = hasItems ? 'block' : 'none';
    });
  }

  injectProgressBarIfNeeded() {
    const cartDrawer = document.querySelector('.cart-drawer .drawer__inner');
    const existingProgressBar = document.querySelector('.cart-progress-bar');
    
    if (cartDrawer && !existingProgressBar && this.currentCartData?.item_count > 0) {
      console.log('Injecting progress bar into cart drawer');
      
      const cartHeader = cartDrawer.querySelector('.drawer__header');
      if (cartHeader) {
        const progressBarHTML = this.generateProgressBarHTML();
        cartHeader.insertAdjacentHTML('afterend', progressBarHTML);
        
        // Setup listeners after injection
        setTimeout(() => this.setupOfferListeners(), 100);
      }
    }
  }

  generateProgressBarHTML() {
    const currentAmount = this.mainProductsTotal;
    const progressPercentage = Math.min((currentAmount / this.maxThreshold) * 100, 100);
    
    const achievedThresholds = this.thresholds.filter(t => currentAmount >= t.amount);
    const nextThreshold = this.thresholds.find(t => currentAmount < t.amount);
    
    return `
      <div class="cart-progress-bar" role="progressbar" aria-valuenow="${progressPercentage}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-message">
          ${this.generateProgressMessage(currentAmount, achievedThresholds, nextThreshold)}
        </div>
        
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercentage}%"></div>
        </div>
        
        <div class="progress-milestones">
          ${this.generateMilestonesHTML(currentAmount)}
        </div>
        
        ${this.generateOffersHTML()}
      </div>
    `;
  }

  generateProgressMessage(currentAmount, achievedThresholds, nextThreshold) {
    if (currentAmount === 0) {
      return 'Add items to your cart to unlock benefits!';
    }
    
    if (achievedThresholds.length > 0) {
      const latestAchieved = achievedThresholds[achievedThresholds.length - 1];
      let message = `🎉 ${latestAchieved.message}`;
      
      if (nextThreshold) {
        const remaining = nextThreshold.amount - currentAmount;
        message += ` Add <span class="price-highlight">${this.formatPrice(remaining)}</span> more for <span class="discount-highlight">${nextThreshold.benefit}</span>!`;
      } else {
        message += ' All benefits unlocked!';
      }
      return message;
    }
    
    if (nextThreshold) {
      const remaining = nextThreshold.amount - currentAmount;
      return `Add <span class="price-highlight">${this.formatPrice(remaining)}</span> more to get <span class="discount-highlight">${nextThreshold.benefit}</span>!`;
    }
    
    return '';
  }

  generateMilestonesHTML(currentAmount) {
    return this.thresholds.map((threshold, index) => `
      <div class="milestone ${currentAmount >= threshold.amount ? 'achieved' : ''}" data-threshold="${threshold.amount}">
        <div class="milestone-icon">
          ${this.getMilestoneIcon(threshold.type)}
        </div>
        <span class="milestone-label">
          ${threshold.type === 'shipping' ? 'Free Ship' : threshold.benefit}<br>₹${threshold.amount / 100}
        </span>
      </div>
    `).join('');
  }

  getMilestoneIcon(type) {
    if (type === 'shipping') {
      return `
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `;
    }
    
    return `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.79 21L3 11.21v2c0 .45.19.86.49 1.16l8.4 8.4c.78.78 2.05.78 2.83 0l6.21-6.21c.78-.78.78-2.05 0-2.83L12.79 21z"/>
        <path d="M11.38 17.41c.39.39.9.59 1.41.59.51 0 1.02-.2 1.41-.59l6.21-6.21c.78-.78.78-2.05 0-2.83L12.62.58C12.25.21 11.74 0 11.21 0H5C3.9 0 3 .9 3 2v6.21c0 .53.21 1.04.59 1.41l7.79 7.79zM7 5c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1z"/>
      </svg>
    `;
  }

  generateOffersHTML() {
    if (this.availableOffers.length === 0) return '';

    const currentAmount = this.mainProductsTotal;
    const allowedOffers = this.calculateAllowedOffers(currentAmount);
    const isActive = currentAmount >= this.offerActivationThreshold;
    
    const offersHtml = this.availableOffers
      .slice(0, 8)
      .map(product => this.renderOfferCard(product, isActive, allowedOffers))
      .join('');

    return `
      <div class="offers-section ${isActive ? '' : 'locked'}">
        <div class="offers-header">
          <h3 class="offers-title">${this.getOffersTitle(currentAmount, isActive, allowedOffers)}</h3>
          ${isActive ? `<div class="offers-counter">${this.addedOffers.size}/${allowedOffers}</div>` : ''}
        </div>
        
        ${this.generateOfferProgressHTML(currentAmount, allowedOffers)}
        
        <div class="offers-slider" role="group" aria-label="Rs 9 Product Offers">
          ${offersHtml}
        </div>
      </div>
    `;
  }

  getOffersTitle(currentAmount, isActive, allowedOffers) {
    const remainingForActivation = Math.max(0, this.offerActivationThreshold - currentAmount);
    
    if (!isActive && remainingForActivation > 0) {
      return `🔒 Add ${this.formatPrice(remainingForActivation)} to choose Rs 9 products`;
    }
    
    if (isActive) {
      const progressInCurrentTier = (currentAmount - this.offerActivationThreshold) % this.offerMilestone;
      const remainingForNext = this.offerMilestone - progressInCurrentTier;
      
      if (this.addedOffers.size < allowedOffers) {
        const remaining = allowedOffers - this.addedOffers.size;
        return `🎁 Choose ${remaining} more Rs 9 product${remaining > 1 ? 's' : ''} (${this.addedOffers.size}/${allowedOffers})`;
      } else if (remainingForNext < this.offerMilestone && remainingForNext > 0) {
        return `🎁 Add ${this.formatPrice(remainingForNext)} more to unlock another Rs 9 product`;
      } else {
        return `🎁 All Rs 9 products unlocked for this tier!`;
      }
    }
    
    return '';
  }

  generateOfferProgressHTML(currentAmount, allowedOffers) {
    if (currentAmount < this.offerActivationThreshold) return '';

    const currentMilestoneStart = Math.floor((currentAmount - this.offerActivationThreshold) / this.offerMilestone) * this.offerMilestone + this.offerActivationThreshold;
    const nextMilestoneEnd = currentMilestoneStart + this.offerMilestone;
    const progressInMilestone = currentAmount - currentMilestoneStart;
    const milestoneProgress = Math.min((progressInMilestone / this.offerMilestone) * 100, 100);
    const rs9ProgressPercentage = allowedOffers > 0 ? Math.min((this.addedOffers.size / allowedOffers) * 100, 100) : 0;

    return `
      <div class="milestone-progress">
        <div class="milestone-progress-label">
          Current Milestone: ₹${currentMilestoneStart/100} - ₹${nextMilestoneEnd/100}
        </div>
        <div class="milestone-progress-track">
          <div class="milestone-progress-fill" style="width: ${milestoneProgress}%"></div>
        </div>
        <div class="milestone-progress-text">
          ${this.formatPrice(progressInMilestone)} / ${this.formatPrice(this.offerMilestone)} towards next Rs 9 product
        </div>
      </div>
      
      ${allowedOffers > 0 ? `
        <div class="offers-progress">
          <div class="offers-progress-track">
            <div class="offers-progress-fill" style="width: ${rs9ProgressPercentage}%"></div>
          </div>
          <div class="offers-progress-text">${this.addedOffers.size}/${allowedOffers} Rs 9 products selected</div>
        </div>
      ` : ''}
    `;
  }

  async loadOffers() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(`/collections/${this.offersCollection}/products.json?limit=12`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.availableOffers = (data.products || []).filter(product => 
        product && product.variants && product.variants.length > 0
      );
      
      console.log('Rs 9 offers loaded successfully:', this.availableOffers.length);
      
    } catch (error) {
      console.error('Error loading Rs 9 offers:', error);
      this.availableOffers = [];
    }
  }

  renderOfferCard(product, isActive, allowedOffers) {
    if (!product?.variants?.[0]) return '';
    
    const variant = product.variants[0];
    const isAdded = this.addedOffers.has(variant.id);
    const canAdd = isActive && (this.addedOffers.size < allowedOffers || isAdded);
    
    const imageUrl = product.images?.[0]?.src || 'https://via.placeholder.com/150x150?text=No+Image';
    const title = product.title || 'Product';

    return `
      <div class="offer-card ${!canAdd ? 'disabled' : ''} ${isAdded ? 'added' : ''}" 
           data-variant-id="${variant.id}">
        <img src="${imageUrl}" 
             alt="${title}" 
             class="offer-image" 
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/150x150?text=No+Image'">
        <h4 class="offer-title">${title}</h4>
        <p class="offer-price">₹9</p>
        <button class="offer-btn ${isAdded ? 'added' : ''}" 
                ${!canAdd ? 'disabled' : ''} 
                data-variant-id="${variant.id}"
                aria-label="${isAdded ? 'Remove' : 'Add'} ${title} to cart">
          ${!isActive ? '🔒' : isAdded ? '✓ Added' : '+ Add'}
        </button>
      </div>
    `;
  }

  setupOfferListeners() {
    const offerButtons = document.querySelectorAll('.offer-btn:not([disabled])');
    
    offerButtons.forEach(button => {
      // Remove existing listeners to prevent duplicates
      button.removeEventListener('click', this.handleOfferClick);
      
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.isLoading || button.disabled) return;
        
        const variantId = parseInt(button.dataset.variantId);
        if (isNaN(variantId)) {
          console.error('Invalid variant ID:', button.dataset.variantId);
          return;
        }
        
        const card = button.closest('.offer-card');
        await this.handleOfferAction(variantId, button, card);
      });
    });
  }

  async handleOfferAction(variantId, button, card) {
    if (this.isLoading) return;
    
    this.isLoading = true;
    const originalText = button.textContent;
    
    // Visual feedback
    button.classList.add('loading');
    button.textContent = '...';
    card.style.opacity = '0.7';
    
    try {
      if (this.addedOffers.has(variantId)) {
        await this.removeOfferFromCart(variantId);
        this.addedOffers.delete(variantId);
        this.showCelebration('Rs 9 product removed from cart!');
      } else {
        if (this.mainProductsTotal === 0) {
          this.showCelebration('❌ Please add main products first before adding Rs 9 products!');
          return;
        }
        
        await this.addOfferToCart(variantId);
        this.addedOffers.add(variantId);
        this.showCelebration('🎉 Rs 9 product added to cart! 🎉');
        this.triggerConfetti();
      }
      
      // Refresh cart display
      await this.refreshCartDrawer();
      
      // Update button state
      const isAdded = this.addedOffers.has(variantId);
      card.classList.toggle('added', isAdded);
      button.classList.toggle('added', isAdded);
      button.textContent = isAdded ? '✓ Added' : '+ Add';
      
    } catch (error) {
      console.error('Error handling offer action:', error);
      button.textContent = originalText;
      this.showCelebration('❌ Something went wrong. Please try again.');
    } finally {
      this.isLoading = false;
      button.classList.remove('loading');
      card.style.opacity = '1';
    }
  }

  async addOfferToCart(variantId) {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: variantId,
        quantity: 1,
        properties: {
          '_offer_item': 'true'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to add offer to cart: ${response.status}`);
    }

    return response.json();
  }

  async removeOfferFromCart(variantId) {
    const response = await fetch('/cart/change.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: variantId,
        quantity: 0
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to remove offer from cart: ${response.status}`);
    }

    return response.json();
  }

  async refreshCartDrawer() {
    // Trigger cart update events
    document.dispatchEvent(new CustomEvent('cart:updated'));
    
    // Update cart data
    await this.fetchCartData();
  }

  updateProgress(currentAmount) {
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill) {
      const progressPercentage = Math.min((currentAmount / this.maxThreshold) * 100, 100);
      
      // Use requestAnimationFrame for smooth animation
      requestAnimationFrame(() => {
        progressFill.style.width = `${progressPercentage}%`;
      });
    }
    
    this.updateMilestones(currentAmount);
    this.updateProgressMessage(currentAmount);
  }

  updateMilestones(currentAmount) {
    const milestones = document.querySelectorAll('.milestone');
    
    milestones.forEach((milestone, index) => {
      const threshold = this.thresholds[index];
      if (!threshold) return;
      
      const wasSessionAchieved = this.sessionAchievedMilestones.has(threshold.amount);
      milestone.classList.remove('achieved', 'current');
      
      if (currentAmount >= threshold.amount) {
        milestone.classList.add('achieved');
        
        // Show celebration only for newly achieved milestones
        if (!wasSessionAchieved) {
          this.sessionAchievedMilestones.add(threshold.amount);
          sessionStorage.setItem('cart_achieved_milestones', 
            JSON.stringify([...this.sessionAchievedMilestones]));
          
          this.showCelebration(threshold.message);
          this.triggerConfetti();
        }
      } else {
        // Mark next milestone as current
        const nextThreshold = this.thresholds.find(t => currentAmount < t.amount);
        if (nextThreshold && threshold.amount === nextThreshold.amount) {
          milestone.classList.add('current');
        }
      }
    });
  }

  updateProgressMessage(currentAmount) {
    const messageEl = document.querySelector('.progress-message');
    if (!messageEl) return;

    const achievedThresholds = this.thresholds.filter(t => currentAmount >= t.amount);
    const nextThreshold = this.thresholds.find(t => currentAmount < t.amount);
    
    messageEl.innerHTML = this.generateProgressMessage(currentAmount, achievedThresholds, nextThreshold);
  }

  updateOffersSection(currentAmount) {
    const offersSection = document.querySelector('.offers-section');
    if (!offersSection) return;

    const allowedOffers = this.calculateAllowedOffers(currentAmount);
    const isActive = currentAmount >= this.offerActivationThreshold;
    
    offersSection.className = `offers-section ${isActive ? '' : 'locked'}`;
    
    // Update title
    const title = offersSection.querySelector('.offers-title');
    if (title) {
      title.textContent = this.getOffersTitle(currentAmount, isActive, allowedOffers);
    }

    // Update counters and progress bars
    this.updateOffersCounter(allowedOffers);
    this.updateOfferProgressBars(currentAmount, allowedOffers);
    
    // Update offer cards
    this.updateOfferCards(isActive, allowedOffers);
  }

  updateOffersCounter(allowedOffers) {
    const counter = document.querySelector('.offers-counter');
    if (counter) {
      counter.textContent = `${this.addedOffers.size}/${allowedOffers}`;
    }
  }

  updateOfferProgressBars(currentAmount, allowedOffers) {
    // Update main offers progress bar
    const progressFill = document.querySelector('.offers-progress-fill');
    const progressText = document.querySelector('.offers-progress-text');
    
    if (progressFill && allowedOffers > 0) {
      const progressPercentage = Math.min((this.addedOffers.size / allowedOffers) * 100, 100);
      requestAnimationFrame(() => {
        progressFill.style.width = `${progressPercentage}%`;
      });
    }
    
    if (progressText) {
      progressText.textContent = `${this.addedOffers.size}/${allowedOffers} Rs 9 products selected`;
    }

    // Update milestone progress bar
    this.updateMilestoneProgressBar(currentAmount);
  }

  updateMilestoneProgressBar(currentAmount) {
    if (currentAmount < this.offerActivationThreshold) return;

    const milestoneProgressFill = document.querySelector('.milestone-progress-fill');
    const milestoneProgressText = document.querySelector('.milestone-progress-text');
    const milestoneProgressLabel = document.querySelector('.milestone-progress-label');
    
    const currentMilestoneStart = Math.floor((currentAmount - this.offerActivationThreshold) / this.offerMilestone) * this.offerMilestone + this.offerActivationThreshold;
    const nextMilestoneEnd = currentMilestoneStart + this.offerMilestone;
    const progressInMilestone = currentAmount - currentMilestoneStart;
    const milestoneProgress = Math.min((progressInMilestone / this.offerMilestone) * 100, 100);
    
    if (milestoneProgressFill) {
      requestAnimationFrame(() => {
        milestoneProgressFill.style.width = `${milestoneProgress}%`;
      });
    }
    
    if (milestoneProgressText) {
      milestoneProgressText.textContent = `${this.formatPrice(progressInMilestone)} / ${this.formatPrice(this.offerMilestone)} towards next Rs 9 product`;
    }
    
    if (milestoneProgressLabel) {
      milestoneProgressLabel.textContent = `Current Milestone: ₹${currentMilestoneStart/100} - ₹${nextMilestoneEnd/100}`;
    }
  }

  updateOfferCards(isActive, allowedOffers) {
    const cards = document.querySelectorAll('.offer-card');
    
    cards.forEach(card => {
      const variantId = parseInt(card.dataset.variantId);
      if (isNaN(variantId)) return;
      
      const isAdded = this.addedOffers.has(variantId);
      const canAdd = isActive && (this.addedOffers.size < allowedOffers || isAdded);
      
      // Update card classes
      card.className = `offer-card ${!canAdd ? 'disabled' : ''} ${isAdded ? 'added' : ''}`;
      
      // Update button
      const button = card.querySelector('.offer-btn');
      if (button) {
        button.disabled = !canAdd;
        button.textContent = !isActive ? '🔒' : isAdded ? '✓ Added' : '+ Add';
        button.className = `offer-btn ${isAdded ? 'added' : ''}`;
        
        // Update aria-label for accessibility
        const productTitle = card.querySelector('.offer-title')?.textContent || 'product';
        button.setAttribute('aria-label', `${isAdded ? 'Remove' : 'Add'} ${productTitle} to cart`);
      }
    });
  }

  // Utility functions
  formatPrice(amount) {
    return `₹${(amount / 100).toFixed(0)}`;
  }

  showCelebration(message, duration = 3000) {
    // Remove existing celebration
    const existing = document.querySelector('.cart-celebration');
    if (existing) existing.remove();
    
    const celebration = document.createElement('div');
    celebration.className = 'cart-celebration';
    celebration.textContent = message;
    celebration.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: bold;
      z-index: 10000;
      animation: slideInFromRight 0.3s ease-out;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    document.body.appendChild(celebration);
    
    setTimeout(() => {
      if (celebration.parentNode) {
        celebration.style.animation = 'slideOutToRight 0.3s ease-in';
        setTimeout(() => celebration.remove(), 300);
      }
    }, duration);
  }

  triggerConfetti() {
    // Simple confetti effect - you can replace with a more sophisticated library
    try {
      if (typeof confetti !== 'undefined') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        // Fallback visual effect
        this.createSimpleConfetti();
      }
    } catch (error) {
      console.warn('Confetti library not available:', error);
    }
  }

  createSimpleConfetti() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
    
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: fixed;
        width: 8px;
        height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -10px;
        left: ${Math.random() * 100}vw;
        z-index: 9999;
        pointer-events: none;
        animation: confettiFall ${2 + Math.random() * 3}s linear forwards;
      `;
      
      document.body.appendChild(confetti);
      
      setTimeout(() => confetti.remove(), 5000);
    }
  }

  // Cleanup method
  destroy() {
    if (this.cartObserver) {
      this.cartObserver.disconnect();
    }
    
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    // Remove event listeners
    document.removeEventListener('cart:updated', this.debouncedUpdate);
    
    // Reset global fetch if modified
    if (window.fetch !== fetch) {
      // Restore original fetch if needed
    }
    
    console.log('Cart Progress Bar destroyed');
  }

  // Static method to initialize
  static initialize() {
    if (window.cartProgressBar) {
      window.cartProgressBar.destroy();
    }
    
    window.cartProgressBar = new CartProgressBar();
    return window.cartProgressBar;
  }
}

// CSS Animations - Add these styles to your theme
const cartProgressBarStyles = `
<style>
@keyframes slideInFromRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutToRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes confettiFall {
  to {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.cart-progress-bar {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  font-family: inherit;
}

.progress-message {
  text-align: center;
  font-weight: 500;
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.4;
}

.price-highlight {
  color: #e74c3c;
  font-weight: bold;
}

.discount-highlight {
  color: #27ae60;
  font-weight: bold;
}

.progress-track {
  width: 100%;
  height: 8px;
  background-color: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-milestones {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.milestone {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.milestone.achieved {
  opacity: 1;
  color: #27ae60;
}

.milestone.current {
  opacity: 0.8;
  transform: scale(1.1);
}

.milestone-icon {
  width: 24px;
  height: 24px;
  margin-bottom: 4px;
}

.milestone-icon svg {
  width: 100%;
  height: 100%;
}

.milestone-label {
  font-size: 10px;
  line-height: 1.2;
  font-weight: 500;
}

.offers-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.offers-section.locked {
  opacity: 0.6;
}

.offers-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.offers-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.offers-counter {
  background: #3498db;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.milestone-progress,
.offers-progress {
  margin-bottom: 12px;
}

.milestone-progress-label,
.offers-progress-text {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.milestone-progress-track,
.offers-progress-track {
  width: 100%;
  height: 6px;
  background-color: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.milestone-progress-fill,
.offers-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f39c12, #e67e22);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.milestone-progress-text {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.offers-slider {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.offers-slider::-webkit-scrollbar {
  height: 4px;
}

.offers-slider::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.offers-slider::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 2px;
}

.offer-card {
  flex: 0 0 120px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px;
  text-align: center;
  transition: all 0.3s ease;
  background: white;
}

.offer-card:hover:not(.disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.offer-card.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.offer-card.added {
  border-color: #27ae60;
  background: #f8fff8;
}

.offer-image {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}

.offer-title {
  font-size: 11px;
  font-weight: 500;
  margin: 0 0 4px 0;
  line-height: 1.3;
  height: 28px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.offer-price {
  font-size: 12px;
  font-weight: bold;
  color: #e74c3c;
  margin: 0 0 6px 0;
}

.offer-btn {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #3498db;
  background: white;
  color: #3498db;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.offer-btn:hover:not(:disabled) {
  background: #3498db;
  color: white;
}

.offer-btn.added {
  background: #27ae60;
  border-color: #27ae60;
  color: white;
}

.offer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.offer-btn.loading {
  opacity: 0.7;
  cursor: wait;
}

.cart-celebration {
  font-family: inherit;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .cart-progress-bar {
    padding: 12px;
  }
  
  .progress-milestones {
    gap: 4px;
  }
  
  .milestone-icon {
    width: 20px;
    height: 20px;
  }
  
  .milestone-label {
    font-size: 9px;
  }
  
  .offer-card {
    flex: 0 0 100px;
  }
  
  .offer-image {
    width: 60px;
    height: 60px;
  }
}
</style>
`;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Inject styles
    document.head.insertAdjacentHTML('beforeend', cartProgressBarStyles);
    // Initialize the cart progress bar
    CartProgressBar.initialize();
  });
} else {
  // DOM is already loaded
  document.head.insertAdjacentHTML('beforeend', cartProgressBarStyles);
  CartProgressBar.initialize();
}