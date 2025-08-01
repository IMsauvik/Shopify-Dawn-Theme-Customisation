class CartDrawer extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;
    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });
    this.addEventListener('transitionend', () => {
      const containerToTrapFocusOn = this.classList.contains('is-empty') ? this.querySelector('.drawer__inner-empty') : document.getElementById('CartDrawer');
      const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
      trapFocus(containerToTrapFocusOn, focusElement);
    }, { once: true });
    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');
    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }
    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });
    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') && this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector ? document.querySelector(section.selector) : document.getElementById(section.id);
      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });
    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      const cartDrawerItems = document.querySelector('cart-drawer-items');
      if (cartDrawerItems && cartDrawerItems.setupEventListeners) {
        cartDrawerItems.setupEventListeners();
      }
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartItems extends HTMLElement {
  constructor() {
    super();
  }

  renderContents(parsedState) {
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector 
        ? document.querySelector(section.selector) 
        : document.getElementById(section.id);
      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(
        parsedState.sections[section.id], 
        section.selector
      );
    });
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: 'main-cart-items',
        selector: '.js-contents'
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section'
      }
    ];
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  setActiveElement(element) {
    this.activeElement = element;
  }

  async updateCart(formData) {
    try {
      const sections = this.getSectionsToRender().map((section) => section.section || section.id);
      
      const body = JSON.stringify({
        updates: Object.fromEntries(formData.entries()),
        sections: sections,
        sections_url: window.location.pathname,
      });

      const response = await fetch(`${routes.cart_change_url}`, { 
        ...fetchConfig(), 
        ...{ body } 
      });

      if (!response.ok) {
        throw new Error(`Cart update failed: ${response.status}`);
      }

      const responseData = await response.json();
      
      if (responseData.sections) {
        this.renderContents({ sections: responseData.sections });
      }

      document.dispatchEvent(new CustomEvent('cart:updated', {
        detail: { cartData: responseData }
      }));

      return responseData;
    } catch (error) {
      console.error('Error updating cart:', error);
      throw error;
    }
  }

  setupEventListeners() {
    document.addEventListener('change', async (e) => {
      if (e.target.matches('input[name="updates[]"], .quantity__input')) {
        const form = e.target.closest('form');
        if (form && form.id === 'CartDrawer-Form') {
          try {
            const formData = new FormData(form);
            await this.updateCart(formData);
          } catch (error) {
            console.error('Error updating cart quantity:', error);
          }
        }
      }
    });

    document.addEventListener('click', async (e) => {
      if (e.target.matches('.cart-remove-button, [data-cart-remove]')) {
        e.preventDefault();
        const variantId = e.target.dataset.variantId;
        if (variantId) {
          try {
            const formData = new FormData();
            formData.append(`updates[${variantId}]`, '0');
            await this.updateCart(formData);
          } catch (error) {
            console.error('Error removing cart item:', error);
          }
        }
      }
    });
  }
}

customElements.define('cart-items', CartItems);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);

document.addEventListener('DOMContentLoaded', () => {
  const cartDrawerItems = document.querySelector('cart-drawer-items');
  if (cartDrawerItems) {
    cartDrawerItems.setupEventListeners();
  }
});
