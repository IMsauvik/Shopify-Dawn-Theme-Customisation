class CartProgressBar {
  constructor() {
    this.thresholds = [
      { amount: 49900, type: 'shipping', message: 'Free Shipping Unlocked!', benefit: 'free shipping' },
      { amount: 159900, type: 'discount', message: '10% Discount Applied!', benefit: '10% discount' },
      { amount: 249900, type: 'discount', message: '15% Discount Applied!', benefit: '15% discount' },
      { amount: 349900, type: 'discount', message: '20% Discount Applied!', benefit: '20% discount' }
    ];
    this.maxThreshold = Math.max(...this.thresholds.map(t => t.amount));
    
    this.sessionAchievedMilestones = new Set(
      JSON.parse(sessionStorage.getItem('cart_achieved_milestones') || '[]')
    );
    
    this.offersCollection = 'rs-9';
    this.availableOffers = [];
    this.addedOffers = new Set();
    this.offerActivationThreshold = 49900;
    this.offerMilestone = 50000;
    this.isLoading = false;
    this.isInitialized = false;
    
    this.mainProductsTotal = 0;
    this.cartObserver = null;
    this.updateTimer = null;
    
    this.debouncedUpdate = this.throttle(() => {
      this.updateProgressBar();
    }, 300);
    
    this.init();
  }

  async init() {
    try {
      await this.waitForDOM();
      await this.fetchCartData();
      await this.loadOffers();
      this.setupEventListeners();
      this.observeCartDrawer();
      this.updateProgressBar();
      this.isInitialized = true;
      console.log('Cart Progress Bar initialized successfully');
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  handleInitializationError(error) {
    console.error('Cart Progress Bar initialization failed:', error);
    
    setTimeout(() => {
      if (!this.isInitialized) {
        console.log('Retrying Cart Progress Bar initialization...');
        this.init();
      }
    }, 2000);
  }

  async fetchCartData() {
    try {
      const response = await fetch('/cart.js', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const cartData = await response.json();
      window.cart = cartData;
      
      this.mainProductsTotal = this.calculateMainProductsTotal(cartData);
      
      const offerItems = cartData.items.filter(item => 
        item.properties && item.properties._offer_item === 'true'
      );
      
      this.addedOffers = new Set(offerItems.map(item => item.variant_id));
      
      console.log('Cart data fetched:', { 
        total: cartData.total_price, 
        mainTotal: this.mainProductsTotal,
        offerItems: offerItems.length 
      });
      
    } catch (error) {
      console.error('Error fetching cart data:', error);
      this.mainProductsTotal = 0;
    }
  }

  calculateMainProductsTotal(cartData) {
    if (!cartData || !cartData.items) return 0;
    
    return cartData.items
      .filter(item => !item.properties || item.properties._offer_item !== 'true')
      .reduce((total, item) => {
        return total + (item.final_line_price || item.line_price || 0);
      }, 0);
  }

  calculateAllowedOffers(currentAmount) {
    return Math.floor((currentAmount - this.offerActivationThreshold) / this.offerMilestone);
  }

  setupEventListeners() {
    document.addEventListener('cart:updated', this.debouncedUpdate);
    
    const cartForm = document.querySelector('#CartDrawer-Form, form[action="/cart"]');
    if (cartForm) {
      cartForm.addEventListener('submit', this.debouncedUpdate);
    }
    
    this.interceptCartFetch();
    
    document.addEventListener('click', (e) => {
      if (e.target.matches('.cart-remove-button, [data-cart-remove]')) {
        setTimeout(this.debouncedUpdate, 500);
      }
    });
    
    document.addEventListener('change', (e) => {
      if (e.target.matches('input[name="updates[]"], .quantity__input')) {
        setTimeout(this.debouncedUpdate, 300);
      }
    });
  }

  interceptCartFetch() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if (this.isCartRelatedURL(args[0])) {
        setTimeout(this.debouncedUpdate, 200);
      }
      
      return response;
    };
  }

  isCartRelatedURL(url) {
    const cartUrls = ['/cart/add.js', '/cart/change.js', '/cart/update.js', '/cart/clear.js'];
    return cartUrls.some(cartUrl => String(url).includes(cartUrl));
  }

  observeCartDrawer() {
    const cartDrawer = document.querySelector('cart-drawer, #CartDrawer');
    if (!cartDrawer) return;

    this.cartObserver = new MutationObserver((mutations) => {
      const hasCartRelatedChanges = mutations.some(mutation => 
        this.isCartRelatedMutation(mutation)
      );
      
      if (hasCartRelatedChanges) {
        this.debouncedUpdate();
      }
    });

    this.cartObserver.observe(cartDrawer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-cart-empty']
    });
  }

  isCartRelatedMutation(mutation) {
    const cartSelectors = [
      '.cart-item', '.cart-items', '.totals', '.cart-drawer__footer',
      '[data-cart-item]', '[data-cart-total]'
    ];
    
    const checkNode = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      return cartSelectors.some(selector => 
        node.matches && node.matches(selector) || 
        node.querySelector && node.querySelector(selector)
      );
    };

    return Array.from(mutation.addedNodes).some(checkNode) ||
           Array.from(mutation.removedNodes).some(checkNode) ||
           (mutation.target && checkNode(mutation.target));
  }

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
    };
  }

  debouncedUpdate() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(async () => {
      await this.fetchCartData();
      this.updateProgressBar();
    }, 150);
  }

  async updateProgressBar() {
    try {
      this.injectProgressBarIfNeeded();
      this.toggleProgressBarVisibility();
      
      const currentAmount = this.mainProductsTotal;
      this.updateProgress(currentAmount);
      this.updateOffersSection(currentAmount);
      
    } catch (error) {
      console.error('Error updating progress bar:', error);
    }
  }

  toggleProgressBarVisibility() {
    const progressBars = document.querySelectorAll('.cart-progress-bar, .offers-section');
    const isEmpty = !window.cart || window.cart.item_count === 0;
    
    progressBars.forEach(el => {
      el.style.display = isEmpty ? 'none' : 'block';
    });
  }

  injectProgressBarIfNeeded() {
    const existingProgressBar = document.querySelector('.cart-progress-bar');
    if (existingProgressBar) return;

    const cartDrawer = document.querySelector('cart-drawer-items, .drawer__inner, #CartDrawer-CartItems');
    if (!cartDrawer) return;

    const progressBarHTML = this.generateProgressBarHTML();
    cartDrawer.insertAdjacentHTML('afterbegin', progressBarHTML);
    
    setTimeout(() => {
      this.setupOfferListeners();
    }, 100);
  }

  generateProgressBarHTML() {
    const currentAmount = this.mainProductsTotal;
    const progressPercentage = Math.min((currentAmount / this.maxThreshold) * 100, 100);
    
    const achievedThresholds = this.thresholds.filter(t => currentAmount >= t.amount);
    const nextThreshold = this.thresholds.find(t => currentAmount < t.amount);
    
    return `
      <div class="cart-progress-bar">
        <div class="progress-message">
          ${this.generateProgressMessage(currentAmount, achievedThresholds, nextThreshold)}
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercentage}%"></div>
        </div>
        <div class="progress-milestones">
          ${this.generateMilestonesHTML()}
        </div>
        ${this.generateOffersHTML()}
      </div>
    `;
  }

  generateProgressMessage(currentAmount, achievedThresholds, nextThreshold) {
    if (achievedThresholds.length === this.thresholds.length) {
      return `🎉 <span class="discount-highlight">All rewards unlocked!</span> You've got free shipping and maximum discount!`;
    }
    
    if (nextThreshold) {
      const remaining = nextThreshold.amount - currentAmount;
      return `Add <span class="price-highlight">${this.formatPrice(remaining)}</span> more to unlock <strong>${nextThreshold.benefit}</strong>!`;
    }
    
    return `🛒 Start shopping to unlock amazing rewards!`;
  }

  generateMilestonesHTML() {
    const currentAmount = this.mainProductsTotal;
    
    return this.thresholds.map(threshold => {
      const isAchieved = currentAmount >= threshold.amount;
      const isCurrent = !isAchieved && threshold === this.thresholds.find(t => currentAmount < t.amount);
      
      return `
        <div class="milestone ${isAchieved ? 'achieved' : ''} ${isCurrent ? 'current' : ''}">
          <div class="milestone-icon">${this.getMilestoneIcon(threshold.type, isAchieved)}</div>
          <div class="milestone-label">${this.formatPrice(threshold.amount)}</div>
        </div>
      `;
    }).join('');
  }

  getMilestoneIcon(type, isAchieved) {
    const iconColor = isAchieved ? '#27ae60' : '#ccc';
    
    if (type === 'shipping') {
      return `<svg viewBox="0 0 24 24" fill="${iconColor}"><path d="M3 4h13l3 3v6h-2c0 1.66-1.34 3-3 3s-3-1.34-3-3H9c0 1.66-1.34 3-3 3s-3-1.34-3-3H1V4h2zm10 9c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/></svg>`;
    } else {
      return `<svg viewBox="0 0 24 24" fill="${iconColor}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }
  }

  generateOffersHTML() {
    const currentAmount = this.mainProductsTotal;
    const allowedOffers = Math.max(0, this.calculateAllowedOffers(currentAmount));
    const isActive = currentAmount >= this.offerActivationThreshold;
    
    if (this.availableOffers.length === 0) {
      return '';
    }

    const offersHtml = this.availableOffers.slice(0, 8).map(product => 
      this.renderOfferCard(product, isActive, allowedOffers)
    ).join('');

    return `
      <div class="offers-section ${isActive ? '' : 'locked'}">
        <div class="offers-header">
          <h3 class="offers-title">${this.getOffersTitle(currentAmount, isActive, allowedOffers)}</h3>
          <span class="offers-counter">${this.addedOffers.size}/${allowedOffers}</span>
        </div>
        ${this.generateOfferProgressHTML(currentAmount, allowedOffers)}
        <div class="offers-slider">
          ${offersHtml}
        </div>
      </div>
    `;
  }

  getOffersTitle(currentAmount, isActive, allowedOffers) {
    if (!isActive) {
      const remaining = this.offerActivationThreshold - currentAmount;
      return `🔒 Spend ${this.formatPrice(remaining)} more to unlock Rs 9 products`;
    }
    
    if (allowedOffers === 0) {
      return `🎁 Spend ${this.formatPrice(this.offerMilestone)} more to unlock your first Rs 9 product`;
    }
    
    const nextUnlock = this.offerActivationThreshold + (allowedOffers * this.offerMilestone);
    const remaining = nextUnlock - currentAmount;
    
    if (remaining > 0) {
      return `🎁 Spend ${this.formatPrice(remaining)} more to unlock your next Rs 9 product`;
    }
    
    return `🎉 ${allowedOffers} Rs 9 products available!`;
  }

  generateOfferProgressHTML(currentAmount, allowedOffers) {
    if (currentAmount < this.offerActivationThreshold) {
      const progressPercentage = Math.min((currentAmount / this.offerActivationThreshold) * 100, 100);
      const remaining = this.offerActivationThreshold - currentAmount;
      
      return `
        <div class="milestone-progress">
          <div class="milestone-progress-label">Progress to unlock Rs 9 products</div>
          <div class="milestone-progress-track">
            <div class="milestone-progress-fill" style="width: ${progressPercentage}%"></div>
          </div>
          <div class="milestone-progress-text">
            ${this.formatPrice(remaining)} remaining to unlock Rs 9 products
          </div>
        </div>
      `;
    }

    const currentMilestoneStart = Math.floor((currentAmount - this.offerActivationThreshold) / this.offerMilestone) * this.offerMilestone + this.offerActivationThreshold;
    const nextMilestoneEnd = currentMilestoneStart + this.offerMilestone;
    const progressInMilestone = currentAmount - currentMilestoneStart;
    const milestoneProgress = Math.min((progressInMilestone / this.offerMilestone) * 100, 100);
    
    const rs9ProgressPercentage = allowedOffers > 0 ? Math.min((this.addedOffers.size / allowedOffers) * 100, 100) : 0;

    return `
      <div class="milestone-progress">
        <div class="milestone-progress-label">Next Rs 9 product milestone</div>
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
      
      await this.refreshCartDrawer();
      
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
    try {
      const response = await fetch(`${window.location.pathname}?sections=cart-drawer,cart-icon-bubble`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch cart sections: ${response.status}`);
      }

      const sections = await response.json();
      
      await this.fetchCartData();
      
      const cartDrawer = document.querySelector('cart-drawer-items');
      if (cartDrawer && cartDrawer.renderContents) {
        cartDrawer.renderContents({ sections });
      }

      document.dispatchEvent(new CustomEvent('cart:updated'));
      
      console.log('Cart drawer refreshed successfully');
    } catch (error) {
      console.error('Error refreshing cart drawer:', error);
      document.dispatchEvent(new CustomEvent('cart:updated'));
      await this.fetchCartData();
    }
  }

  updateProgress(currentAmount) {
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill) {
      const progressPercentage = Math.min((currentAmount / this.maxThreshold) * 100, 100);
      
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
        
        if (!wasSessionAchieved) {
          this.sessionAchievedMilestones.add(threshold.amount);
          sessionStorage.setItem('cart_achieved_milestones', 
            JSON.stringify([...this.sessionAchievedMilestones]));
          
          this.showCelebration(threshold.message);
          this.triggerConfetti();
        }
      } else {
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
    
    const title = offersSection.querySelector('.offers-title');
    if (title) {
      title.textContent = this.getOffersTitle(currentAmount, isActive, allowedOffers);
    }

    this.updateOffersCounter(allowedOffers);
    this.updateOfferProgressBars(currentAmount, allowedOffers);
    
    this.updateOfferCards(isActive, allowedOffers);
  }

  updateOffersCounter(allowedOffers) {
    const counter = document.querySelector('.offers-counter');
    if (counter) {
      counter.textContent = `${this.addedOffers.size}/${allowedOffers}`;
    }
  }

  updateOfferProgressBars(currentAmount, allowedOffers) {
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
      
      card.className = `offer-card ${!canAdd ? 'disabled' : ''} ${isAdded ? 'added' : ''}`;
      
      const button = card.querySelector('.offer-btn');
      if (button) {
        button.disabled = !canAdd;
        button.textContent = !isActive ? '🔒' : isAdded ? '✓ Added' : '+ Add';
        button.className = `offer-btn ${isAdded ? 'added' : ''}`;
        
        const productTitle = card.querySelector('.offer-title')?.textContent || 'product';
        button.setAttribute('aria-label', `${isAdded ? 'Remove' : 'Add'} ${productTitle} to cart`);
      }
    });
  }

  formatPrice(amount) {
    return `₹${(amount / 100).toFixed(0)}`;
  }

  showCelebration(message, duration = 3000) {
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
    try {
      if (typeof confetti !== 'undefined') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
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

  destroy() {
    if (this.cartObserver) {
      this.cartObserver.disconnect();
    }
    
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    document.removeEventListener('cart:updated', this.debouncedUpdate);
    
    if (window.fetch !== fetch) {
    }
    
    console.log('Cart Progress Bar destroyed');
  }

  static initialize() {
    if (window.cartProgressBar) {
      window.cartProgressBar.destroy();
    }
    
    window.cartProgressBar = new CartProgressBar();
    return window.cartProgressBar;
  }
}

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.head.insertAdjacentHTML('beforeend', cartProgressBarStyles);
    CartProgressBar.initialize();
  });
} else {
  document.head.insertAdjacentHTML('beforeend', cartProgressBarStyles);
  CartProgressBar.initialize();
}
