class StockSort {
  constructor() {
    this.customSortValue = 'stock-status-first';
    this.customSortText = 'In stock first';
    this.init();
  }

  init() {
    // Add our custom sort option
    this.addCustomSortOption();
    
    // Apply sorting if needed
    if (this.isStockSortActive()) {
      this.sortByStock();
    }
    
    // Set up event listeners for DOM changes
    this.setupMutationObserver();
  }

  addCustomSortOption() {
    const sortSelectors = document.querySelectorAll('select[name="sort_by"]');
    
    sortSelectors.forEach(select => {
      // Check if our option doesn't already exist
      if (!Array.from(select.options).some(option => option.value === this.customSortValue)) {
        const option = document.createElement('option');
        option.value = this.customSortValue;
        option.textContent = this.customSortText;
        select.appendChild(option);
        
        // Set as selected if it's the current sort
        if (this.isStockSortActive()) {
          select.value = this.customSortValue;
        }
        
        // Add change listener
        select.addEventListener('change', this.handleSortChange.bind(this));
      }
    });
  }
  
  handleSortChange(event) {
    if (event.target.value === this.customSortValue) {
      // Prevent default sorting behavior
      event.preventDefault();
      event.stopPropagation();
      
      // Apply our custom sorting
      this.sortByStock();
      
      // Update URL
      this.updateURL();
      
      return false;
    }
  }
  
  isStockSortActive() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('sort_by') === this.customSortValue;
  }
  
  sortByStock() {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) return;
    
    const products = Array.from(productGrid.querySelectorAll('.grid__item'));
    
    const inStockProducts = [];
    const outOfStockProducts = [];
    
    products.forEach(product => {
      // Check for sold out badge in Dawn theme
      const soldOutBadge = product.querySelector('.badge--bottom-right');
      const isSoldOut = soldOutBadge && soldOutBadge.textContent.toLowerCase().includes('sold out');
      
      if (isSoldOut) {
        outOfStockProducts.push(product);
      } else {
        inStockProducts.push(product);
      }
    });
    
    // Clear and rebuild the product grid
    productGrid.innerHTML = '';
    
    // Add in-stock products first
    inStockProducts.forEach(product => {
      productGrid.appendChild(product);
    });
    
    // Then add out-of-stock products
    outOfStockProducts.forEach(product => {
      productGrid.appendChild(product);
    });
  }
  
  updateURL() {
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', this.customSortValue);
    window.history.replaceState({}, '', url.toString());
  }
  
  setupMutationObserver() {
    // Watch for AJAX-loaded content
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new sort selectors were added
          const newSortSelectors = Array.from(mutation.addedNodes)
            .filter(node => node.querySelectorAll)
            .flatMap(node => Array.from(node.querySelectorAll('select[name="sort_by"]')));
          
          if (newSortSelectors.length > 0) {
            this.addCustomSortOption();
          }
          
          // Check if new products were added
          const productGridChanged = Array.from(mutation.addedNodes)
            .filter(node => node.classList && node.classList.contains('grid__item'));
          
          if (productGridChanged.length > 0 && this.isStockSortActive()) {
            setTimeout(() => this.sortByStock(), 10);
          }
        }
      });
    });
    
    // Start observing
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Listen for facet updates
    document.addEventListener('shopify:section:load', () => {
      this.addCustomSortOption();
      if (this.isStockSortActive()) {
        setTimeout(() => this.sortByStock(), 10);
      }
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const stockSort = new StockSort();
  
  // Also initialize when a fetch request completes (for AJAX filtering)
  const originalFetch = window.fetch;
  window.fetch = function() {
    return originalFetch.apply(this, arguments).then(response => {
      const stockSort = new StockSort();
      return response;
    });
  };
});