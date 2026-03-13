/**
 * Content script for pitchfork.com
 * Detects whether a paywall has dropped on an album review page.
 */
(function () {
  'use strict';

  const isAlbumReviewPage = () => /^\/reviews\/albums\/[^/]+\/?$/.test(window.location.pathname);

  /**
   * Read the displayed Pitchfork score from the page (used for 0.0 paywall signal).
   * Parses the text inside the container whose class begins with ScoreCircle.
   * @returns {number | null}
   */
  function getPitchforkScore() {
    if (!isAlbumReviewPage()) return null;
    const el = document.querySelector('[class*="ScoreCircle"]');
    if (!el) return null;
    return parseScoreText((el.textContent || '').trim());
  }

  function parseScoreText(text) {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim();
    const m = cleaned.match(/^(10\.0|10|\d\.\d)$/) || cleaned.match(/\b(10\.0|10|\d\.\d)\b/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return n >= 0 && n <= 10 ? n : null;
  }

  /**
   * Detect whether the current album review page is behind a paywall.
   * Uses the floating paywall bar and a displayed score of 0.0 as signals.
   */
  function isPaywalled() {
    if (document.querySelector('[class*="InContentBarrierFloatingBarLink"]')) return true;
    if (getPitchforkScore() === 0) return true;
    return false;
  }

  /**
   * Whether a node represents an ad (skip when building HTML).
   * @param {string} tag
   * @param {unknown} attrs
   * @returns {boolean}
   */
  function isAdNode(tag, attrs) {
    if (typeof tag !== 'string') return false;
    if (tag.toLowerCase().includes('ad')) return true;
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs) && 'position' in attrs) {
      const p = attrs.position;
      if (typeof p === 'string' && p.toLowerCase().includes('ad')) return true;
    }
    return false;
  }

  /**
   * Escape text for HTML text nodes.
   * @param {string} s
   * @returns {string}
   */
  function escapeText(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape an attribute value for HTML.
   * @param {string} s
   * @returns {string}
   */
  function escapeAttr(s) {
    return escapeText(s).replace(/"/g, '&quot;');
  }

  /**
   * Reconstruct HTML from review.body array format.
   * Format: [tagName, optionalAttrs?, ...children] where children are strings or arrays.
   * Skips nodes that indicate content is an ad.
   * @param {unknown} node
   * @returns {string}
   */
  function bodyArrayToHtml(node) {
    if (typeof node === 'string') return escapeText(node);
    if (!Array.isArray(node) || node.length === 0) return '';
    const tag = node[0];
    if (typeof tag !== 'string') return '';
    let attrs = {};
    let children = node.slice(1);
    if (children.length > 0 && typeof children[0] === 'object' && children[0] !== null && !Array.isArray(children[0])) {
      attrs = /** @type {Record<string, unknown>} */ (children[0]);
      children = children.slice(1);
    }
    if (isAdNode(tag, attrs)) return '';
    const attrStr = Object.entries(attrs)
      .filter(([k]) => k !== 'isExternal')
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ');
    const open = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
    const childHtml = children.map(bodyArrayToHtml).join('');
    return `${open}${childHtml}</${tag}>`;
  }

  /**
   * Fetch the JSON version of the current review (same URL with format=json).
   * @returns {Promise<unknown>}
   */
  function fetchReviewJson() {
    const url = new URL(window.location.href);
    url.searchParams.set('format', 'json');
    return fetch(url.toString()).then((r) => {
      if (!r.ok) return Promise.reject(new Error(r.statusText));
      return r.text().then((text) => {
        const trimmed = text.trim();
        if (!trimmed || trimmed.startsWith('<')) {
          console.warn('[Forklift] Response is not JSON (likely HTML). First 200 chars:', trimmed.slice(0, 200));
          return Promise.reject(new Error('Server returned non-JSON response'));
        }
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          console.warn('[Forklift] JSON parse failed. First 200 chars:', trimmed.slice(0, 200));
          throw e;
        }
      });
    });
  }

  /**
   * Update the page markup with the review score (text + filter: none).
   * Finds the element with a class beginning with ScoreBoxWrapper, then the
   * deepest child node inside it, and updates that node's contents with the score.
   * @param {string | number} score
   */
  function updatePageWithScore(score) {
    if (score == null) return;
    const wrapper = document.querySelector('[class*="ScoreBoxWrapper"]');
    if (!wrapper) return;
    let el = wrapper;
    while (el.lastElementChild) el = el.lastElementChild;
    el.textContent = String(score);
    el.style.filter = 'blur(0px)';
  }

  /**
   * Enhance a paywalled review page by fetching the JSON review, reconstructing
   * HTML from review.body (array), and replacing BodyWrapper content.
   */


  function enhancePaywalledPage() {
  fetchReviewJson()
    .then((data) => {
      const body = data && data.review && data.review.body;
      if (!Array.isArray(body)) {
        console.warn('[Forklift] review.body is not an array');
        return;
      }
      const html = bodyArrayToHtml(body);
      const bodyWrapper = document.querySelector('[data-testid="BodyWrapper"]');
      if (!bodyWrapper) {
        console.warn('[Forklift] BodyWrapper not found');
        return;
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      bodyWrapper.replaceChildren(...doc.body.childNodes);

      const score = data?.review?.headerProps?.musicRating?.score;
      updatePageWithScore(score);
    })
    .catch((err) => console.warn('[Forklift] Failed to fetch review JSON', err));
}

  if (!isAlbumReviewPage()) return;

  function hasPaywallBar(root) {
    if (!root || root.nodeType !== 1) return false;
    const el = root;
    return (el.matches && el.matches('[class*="InContentBarrierFloatingBar"]')) || !!el.querySelector('[class*="InContentBarrierFloatingBar"]');
  }

  function runPaywallCheck() {
    const paywalled = isPaywalled();
    if (paywalled) enhancePaywalledPage();
  }

  if (hasPaywallBar(document.body)) {
    runPaywallCheck();
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (hasPaywallBar(node)) {
          observer.disconnect();
          runPaywallCheck();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
