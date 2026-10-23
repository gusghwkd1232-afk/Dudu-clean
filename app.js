(() => {
  "use strict";

  const config = window.CATALOG_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const state = {
    products: [],
    filtered: [],
    page: 1,
    pageSize: Number(config.pageSize) > 0 ? Number(config.pageSize) : 24,
    query: "",
    category: "",
    sort: "name",
    currentProduct: null
  };

  const elements = {
    companyName: $("#company-name"),
    companyTagline: $("#company-tagline"),
    footerCompanyName: $("#footer-company-name"),
    footerContactText: $("#footer-contact-text"),
    search: $("#search-input"),
    category: $("#category-select"),
    sort: $("#sort-select"),
    reset: $("#reset-button"),
    grid: $("#product-grid"),
    summary: $("#results-summary"),
    empty: $("#empty-state"),
    emptyReset: $("#empty-reset-button"),
    prev: $("#prev-button"),
    next: $("#next-button"),
    pageIndicator: $("#page-indicator"),
    productDialog: $("#product-dialog"),
    dialogContent: $("#dialog-content"),
    dialogClose: $("#dialog-close"),
    inquiryDialog: $("#inquiry-dialog"),
    inquiryClose: $("#inquiry-close"),
    inquiryDescription: $("#inquiry-description"),
    inquiryProduct: $("#inquiry-product"),
    inquiryActions: $("#inquiry-actions"),
    inquiryFallback: $("#inquiry-fallback"),
    copyInquiry: $("#copy-inquiry-button"),
    copyStatus: $("#copy-status"),
    headerContact: $("#header-contact-link"),
    mainContact: $("#contact-main-link")
  };

  const clean = (value) => String(value ?? "").trim();
  const normalize = (value) => clean(value).toLocaleLowerCase("ko-KR");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function safeImagePath(path) {
    const value = clean(path);
    if (!value) return config.placeholderImage || "images/placeholder.svg";
    // Allow local relative paths and HTTPS image URLs only.
    if (/^https:\/\//i.test(value)) return value;
    if (/^(javascript|data|file):/i.test(value) || value.startsWith("//") || value.includes("..")) {
      return config.placeholderImage || "images/placeholder.svg";
    }
    return value;
  }

  // CSV parser supports quoted fields, commas, and newlines inside quoted fields.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ",") {
        row.push(field); field = "";
      } else if (char === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map((header, index) =>
      (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim()
    );
    return rows
      .filter((values) => values.some((value) => clean(value) !== ""))
      .map((values) => {
        const item = {};
        headers.forEach((header, index) => { item[header] = values[index] ?? ""; });
        return item;
      });
  }

  function normalizeProduct(raw) {
    const product = {};
    [
      "product_id", "name", "category", "brand", "specification", "package_unit",
      "description", "usage", "image", "keywords", "status"
    ].forEach((key) => { product[key] = clean(raw[key]); });
    product.image = safeImagePath(product.image);
    product.status = normalize(product.status || "active");
    return product;
  }

  function setCompanyDetails() {
    const company = clean(config.companyName) || "청소용품 카탈로그";
    if (elements.companyName) elements.companyName.textContent = company;
    if (elements.footerCompanyName) elements.footerCompanyName.textContent = company;
    if (elements.companyTagline) elements.companyTagline.textContent = clean(config.tagline);
    if (elements.footerContactText) {
      elements.footerContactText.textContent = config.phone || config.email
        ? `문의: ${[config.phone, config.email].filter(Boolean).join(" · ")}`
        : "제품별 가격 및 구매 조건은 별도 문의 바랍니다.";
    }
    const hasContact = Boolean(config.phone || config.email || config.kakaoUrl);
    [elements.headerContact, elements.mainContact].forEach((link) => {
      if (!link) return;
      link.textContent = hasContact ? "문의하기" : "문의 안내";
      link.href = "#contact";
      if (hasContact) {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          openGeneralContact();
        });
      }
    });
  }

  function openGeneralContact() {
    openInquiry(null);
  }

  function setCategories() {
    const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko"));
    elements.category.innerHTML = '<option value="">전체 카테고리</option>' +
      categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  }

  function searchText(product) {
    return [
      product.product_id, product.name, product.category, product.brand,
      product.specification, product.package_unit, product.description,
      product.usage, product.keywords
    ].join(" ");
  }

  function applyFilters() {
    const query = normalize(state.query);
    state.filtered = state.products.filter((product) => {
      const matchesQuery = !query || normalize(searchText(product)).includes(query);
      const matchesCategory = !state.category || product.category === state.category;
      return matchesQuery && matchesCategory;
    });
    state.filtered.sort((a, b) => {
      if (state.sort === "code") return a.product_id.localeCompare(b.product_id, "ko", { numeric: true });
      if (state.sort === "category") {
        return a.category.localeCompare(b.category, "ko") || a.name.localeCompare(b.name, "ko");
      }
      return a.name.localeCompare(b.name, "ko");
    });
    state.page = 1;
    render();
  }

  function imageElement(product, className = "product-image") {
    const img = document.createElement("img");
    img.className = className;
    img.src = product.image;
    img.alt = product.name ? `${product.name} 제품 사진` : "제품 사진";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      img.onerror = null;
      img.src = config.placeholderImage || "images/placeholder.svg";
    };
    return img;
  }

  function render() {
    const total = state.filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * state.pageSize;
    const pageProducts = state.filtered.slice(start, start + state.pageSize);

    elements.grid.replaceChildren();
    elements.grid.setAttribute("aria-busy", "false");
    elements.empty.hidden = total !== 0;
    elements.grid.hidden = total === 0;
    elements.summary.textContent = `${total.toLocaleString("ko-KR")}개 제품`;
    elements.pageIndicator.textContent = `${state.page} / ${pageCount}`;
    elements.prev.disabled = state.page <= 1;
    elements.next.disabled = state.page >= pageCount;

    pageProducts.forEach((product) => {
      const card = document.createElement("article");
      card.className = "product-card";
      const imageWrap = document.createElement("div");
      imageWrap.className = "product-image-wrap";
      imageWrap.appendChild(imageElement(product));
      const pill = document.createElement("span");
      pill.className = "category-pill";
      pill.textContent = product.category || "기타";
      imageWrap.appendChild(pill);

      const body = document.createElement("div");
      body.className = "product-body";
      body.innerHTML = `
        <p class="product-code">${escapeHtml(product.product_id || "코드 미등록")}</p>
        <h3 class="product-name">${escapeHtml(product.name || "제품명 미등록")}</h3>
        <p class="product-spec">${escapeHtml(product.specification || "규격 문의")} ${product.package_unit ? `· ${escapeHtml(product.package_unit)}` : ""}</p>
        <p class="product-description">${escapeHtml(product.description || product.usage || "자세한 제품 정보는 문의해 주세요.")}</p>
        <div class="card-actions">
          <button class="button button-outline detail-button" type="button">상세 보기</button>
          <button class="button button-primary inquiry-button" type="button">가격 문의</button>
        </div>`;
      body.querySelector(".detail-button").addEventListener("click", () => openProduct(product));
      body.querySelector(".inquiry-button").addEventListener("click", () => openInquiry(product));
      card.append(imageWrap, body);
      elements.grid.appendChild(card);
    });
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "정보 준비 중")}</dd></div>`;
  }

  function openProduct(product) {
    state.currentProduct = product;
    elements.dialogContent.replaceChildren();
    const layout = document.createElement("div");
    layout.className = "detail-layout";
    const imageWrap = document.createElement("div");
    imageWrap.className = "detail-image-wrap";
    imageWrap.appendChild(imageElement(product, "detail-image"));
    const copy = document.createElement("div");
    copy.className = "detail-copy";
    copy.innerHTML = `
      <p class="eyebrow">${escapeHtml(product.category || "PRODUCT")}</p>
      <p class="product-code">${escapeHtml(product.product_id)}</p>
      <h2 id="dialog-product-name">${escapeHtml(product.name || "제품명 미등록")}</h2>
      <p class="detail-description">${escapeHtml(product.description || "상세 설명은 문의해 주세요.")}</p>
      <dl class="detail-list">
        ${detailRow("브랜드", product.brand)}
        ${detailRow("규격·용량", product.specification)}
        ${detailRow("포장 단위", product.package_unit)}
        ${detailRow("사용 용도", product.usage)}
      </dl>
      <div class="detail-actions">
        <button id="detail-inquiry-button" class="button button-primary" type="button">가격 문의</button>
        <button id="detail-close-button" class="button button-outline" type="button">닫기</button>
      </div>`;
    layout.append(imageWrap, copy);
    elements.dialogContent.appendChild(layout);
    copy.querySelector("#detail-inquiry-button").addEventListener("click", () => {
      elements.productDialog.close();
      openInquiry(product);
    });
    copy.querySelector("#detail-close-button").addEventListener("click", () => elements.productDialog.close());
    if (typeof elements.productDialog.showModal === "function") elements.productDialog.showModal();
    else alert(`${product.name}\n${product.description || ""}`);
  }

  function inquiryText(product) {
    if (!product) return "청소용품 카탈로그 제품 및 구매 관련 문의를 드립니다.";
    return [
      "안녕하세요. 아래 제품의 가격 및 구매 조건을 문의드립니다.",
      `제품명: ${product.name}`,
      `제품 코드: ${product.product_id}`,
      `규격: ${product.specification || "미기재"}`,
      `포장 단위: ${product.package_unit || "미기재"}`,
      "수량 및 공급 조건 안내 부탁드립니다."
    ].join("\n");
  }

  function openInquiry(product) {
    state.currentProduct = product || null;
    elements.inquiryActions.replaceChildren();
    elements.copyStatus.textContent = "";
    elements.inquiryProduct.textContent = product
      ? `${product.name}\n제품 코드: ${product.product_id}\n규격: ${product.specification || "미기재"}`
      : "청소용품 제품 및 구매 관련 문의";
    elements.inquiryDescription.textContent = product
      ? "이 제품의 가격, 재고 및 구매 조건을 문의할 수 있습니다."
      : "아래 등록된 연락 방법을 이용해 문의해 주세요.";

    let actionCount = 0;
    if (clean(config.phone)) {
      const phone = document.createElement("a");
      phone.className = "button button-primary";
      phone.href = `tel:${clean(config.phone).replace(/[^\d+]/g, "")}`;
      phone.textContent = `전화 문의 · ${clean(config.phone)}`;
      elements.inquiryActions.appendChild(phone);
      actionCount++;
    }
    if (clean(config.email)) {
      const email = document.createElement("a");
      email.className = "button button-outline";
      email.href = `mailto:${encodeURIComponent(clean(config.email))}?subject=${encodeURIComponent(`[제품 문의] ${product ? product.name : "청소용품 문의"}`)}&body=${encodeURIComponent(inquiryText(product))}`;
      email.textContent = "이메일로 문의";
      elements.inquiryActions.appendChild(email);
      actionCount++;
    }
    if (clean(config.kakaoUrl) && /^https:\/\/.+/i.test(config.kakaoUrl)) {
      const kakao = document.createElement("a");
      kakao.className = "button button-outline";
      kakao.href = config.kakaoUrl;
      kakao.target = "_blank";
      kakao.rel = "noopener noreferrer";
      kakao.textContent = "카카오톡 문의";
      elements.inquiryActions.appendChild(kakao);
      actionCount++;
    }
    elements.inquiryFallback.textContent = actionCount
      ? "문의할 때 제품명과 제품 코드를 함께 알려주시면 더 빠르게 안내할 수 있습니다."
      : "아직 회사 연락처가 설정되지 않았습니다. assets/config.js에 전화번호, 이메일 또는 카카오톡 채널 주소를 등록해 주세요.";
    if (typeof elements.inquiryDialog.showModal === "function") elements.inquiryDialog.showModal();
    else alert(inquiryText(product));
  }

  async function copyInquiryText() {
    const text = inquiryText(state.currentProduct);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy failed");
      }
      elements.copyStatus.textContent = "문의 내용이 복사되었습니다.";
    } catch {
      elements.copyStatus.textContent = "자동 복사가 지원되지 않습니다. 아래 내용을 직접 복사해 주세요.";
      elements.inquiryProduct.textContent = text;
    }
  }

  function resetFilters() {
    state.query = "";
    state.category = "";
    state.sort = "name";
    elements.search.value = "";
    elements.category.value = "";
    elements.sort.value = "name";
    applyFilters();
  }

  async function loadProducts() {
    try {
      const response = await fetch(config.csvPath || "products.csv", { cache: "no-cache" });
      if (!response.ok) throw new Error(`CSV load failed: ${response.status}`);
      const text = await response.text();
      const allProducts = parseCSV(text).map(normalizeProduct);
      const seen = new Set();
      const duplicateIds = [];
      state.products = allProducts.filter((product) => {
        if (product.status !== "active") return false;
        if (!product.product_id || !product.name) return false;
        if (seen.has(product.product_id)) { duplicateIds.push(product.product_id); return false; }
        seen.add(product.product_id);
        return true;
      });
      if (duplicateIds.length) console.warn("중복 제품 코드는 첫 번째 항목만 표시했습니다:", duplicateIds);
      setCategories();
      applyFilters();
    } catch (error) {
      console.error(error);
      elements.grid.setAttribute("aria-busy", "false");
      elements.grid.hidden = true;
      elements.empty.hidden = false;
      elements.empty.querySelector("h3").textContent = "제품 목록을 불러오지 못했습니다.";
      elements.empty.querySelector("p").textContent = "파일 경로를 확인해 주세요. 로컬에서는 웹 서버로 실행해야 CSV를 읽을 수 있습니다.";
      elements.summary.textContent = "데이터 로딩 오류";
    }
  }

  elements.search.addEventListener("input", () => { state.query = elements.search.value; applyFilters(); });
  elements.category.addEventListener("change", () => { state.category = elements.category.value; applyFilters(); });
  elements.sort.addEventListener("change", () => { state.sort = elements.sort.value; applyFilters(); });
  elements.reset.addEventListener("click", resetFilters);
  elements.emptyReset.addEventListener("click", resetFilters);
  elements.prev.addEventListener("click", () => { if (state.page > 1) { state.page--; render(); window.scrollTo({ top: $("#catalog-title").offsetTop - 20, behavior: "smooth" }); } });
  elements.next.addEventListener("click", () => {
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < pages) { state.page++; render(); window.scrollTo({ top: $("#catalog-title").offsetTop - 20, behavior: "smooth" }); }
  });
  elements.dialogClose.addEventListener("click", () => elements.productDialog.close());
  elements.inquiryClose.addEventListener("click", () => elements.inquiryDialog.close());
  elements.copyInquiry.addEventListener("click", copyInquiryText);
  [elements.productDialog, elements.inquiryDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  setCompanyDetails();
  loadProducts();
})();
