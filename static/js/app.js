// --- Estado Global ---
const state = {
  token: localStorage.getItem("gestiosmart_token"),
  email: localStorage.getItem("gestiosmart_email"),
  businessType: localStorage.getItem("gestiosmart_business_type") || "textil",
  categories: [],
  products: [],
  sales: [],
  cart: [],
  suppliers: [],
  currentAccounts: [],
  fixedCosts: [],
  cashTransactions: [],
  influencers: [],
  marketingExpenses: [],
  extras: { estampados: [], packagings: [], bordados: [] },
  stockIntakes: [],
  
  selectedProductForSize: null,
  activeTab: "sales",
  
  // Dashboard states
  panelPeriod: "mes", // 'hoy', 'semana', 'mes'
  panelMonth: "",      // Mes seleccionado (ej. 'Junio')
  
  // Fixed Costs View Month
  viewCostsMonth: "",
  
  // Chart.js instances
  evolutionChart: null,
  categoriesChart: null,
  fixedCostsDonutChart: null,

  // Notification dismissed state
  dismissedNotifications: {
    stock: false,
    cobranzas: false,
    cuentas: false
  }
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  
  // Fetch Firebase config and initialize client SDK
  try {
    const res = await fetch("/api/firebase-config");
    if (res.ok) {
      const config = await res.json();
      firebase.initializeApp(config);
    }
  } catch (err) {
    console.error("Error al inicializar Firebase client SDK:", err);
  }
  
  checkAuth();
});

// --- Toast Notifications ---
function showToast(message, isError = false) {
  const toast = document.getElementById("idx-toast");
  toast.innerText = message;
  toast.className = "idx-toast active" + (isError ? " error" : " success");
  
  setTimeout(() => {
    toast.className = "idx-toast";
  }, 3000);
}

// --- Autenticación ---
function checkAuth() {
  const authSection = document.getElementById("auth-section");
  const appSection = document.getElementById("app-section");
  const verifyScreen = document.getElementById("verify-email-screen");
  const paywallScreen = document.getElementById("paywall-screen");
  
  if (state.token) {
    authSection.style.display = "none";
    // We let refreshState determine app section visibility
    state.businessType = localStorage.getItem("gestiosmart_business_type") || "textil";
    document.getElementById("user-display-email").innerText = state.email;
    applyBusinessTypeUIUpdates();
    initApp();
  } else {
    authSection.style.display = "flex";
    appSection.style.display = "none";
    if (verifyScreen) verifyScreen.style.display = "none";
    if (paywallScreen) paywallScreen.style.display = "none";
    toggleResetPasswordView(false);
  }
}

function applyBusinessTypeUIUpdates() {
  const isComercio = state.businessType === "comercio";
  
  // 1. Sidebar/Topbar Badge
  const typeDisplay = document.getElementById("user-display-business-type");
  if (typeDisplay) {
    typeDisplay.innerText = isComercio ? "Comercio" : "Textil";
    const parent = typeDisplay.parentElement;
    if (parent) {
      if (isComercio) {
        parent.style.background = "rgba(59, 130, 246, 0.1)";
        parent.style.borderColor = "rgba(59, 130, 246, 0.2)";
        typeDisplay.style.color = "var(--accent-blue)";
      } else {
        parent.style.background = "rgba(239, 71, 111, 0.1)";
        parent.style.borderColor = "rgba(239, 71, 111, 0.2)";
        typeDisplay.style.color = "var(--accent-red)";
      }
    }
  }
  
  // 2. Compras (Stock Intake) containers
  const intakeTalles = document.getElementById("intake-talles-container");
  const intakeSimple = document.getElementById("intake-simple-qty-container");
  if (isComercio) {
    if (intakeTalles) intakeTalles.style.display = "none";
    if (intakeSimple) intakeSimple.style.display = "block";
  } else {
    if (intakeTalles) intakeTalles.style.display = "block";
    if (intakeSimple) intakeSimple.style.display = "none";
  }
  


  // 4. Marketing Delivery label
  const mktDeliverySizeLabel = document.querySelector("label[for='mkt-delivery-size-select']");
  if (mktDeliverySizeLabel) {
    mktDeliverySizeLabel.innerText = isComercio ? "Variante *" : "Talle *";
  }
}

function translateError(msg) {
  if (!msg || typeof msg !== "string") return "Ocurrió un error inesperado.";
  
  const upperMsg = msg.toUpperCase();
  
  if (upperMsg.includes("EMAIL_EXISTS")) {
    return "El correo electrónico ya está registrado.";
  }
  if (upperMsg.includes("INVALID_LOGIN_CREDENTIALS") || upperMsg.includes("INVALID_PASSWORD") || upperMsg.includes("EMAIL_NOT_FOUND")) {
    return "El correo o la contraseña son incorrectos.";
  }
  if (upperMsg.includes("WEAK_PASSWORD")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (upperMsg.includes("INVALID_EMAIL")) {
    return "El formato del correo electrónico es inválido.";
  }
  if (upperMsg.includes("USER_DISABLED")) {
    return "Esta cuenta de usuario ha sido inhabilitada.";
  }
  if (upperMsg.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
    return "Demasiados intentos fallidos. Por favor, intentá más tarde.";
  }
  
  return msg;
}

function toggleAuthView(showRegister) {
  const loginForm = document.getElementById("login-container");
  const registerForm = document.getElementById("register-container");
  const resetForm = document.getElementById("reset-password-container");
  
  if (resetForm) resetForm.style.display = "none";
  
  if (showRegister) {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
  } else {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
  }
}

function toggleResetPasswordView(showReset) {
  const loginForm = document.getElementById("login-container");
  const registerForm = document.getElementById("register-container");
  const resetForm = document.getElementById("reset-password-container");
  
  // Clear messages
  const resetError = document.getElementById("reset-error");
  const resetSuccess = document.getElementById("reset-success");
  if (resetError) resetError.style.display = "none";
  if (resetSuccess) resetSuccess.style.display = "none";
  
  const resetEmailInput = document.getElementById("reset-email");
  if (resetEmailInput) resetEmailInput.value = "";
  
  if (showReset) {
    loginForm.style.display = "none";
    registerForm.style.display = "none";
    if (resetForm) resetForm.style.display = "block";
  } else {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    if (resetForm) resetForm.style.display = "none";
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const email = document.getElementById("reset-email").value;
  const errorDiv = document.getElementById("reset-error");
  const successDiv = document.getElementById("reset-success");
  
  errorDiv.style.display = "none";
  successDiv.style.display = "none";
  
  try {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al enviar el correo de recuperación");
    
    successDiv.innerText = "Te enviamos un correo con las instrucciones para restablecer tu contraseña. Revisá tu bandeja de entrada o Spam.";
    successDiv.style.display = "block";
  } catch (error) {
    errorDiv.innerText = translateError(error.message);
    errorDiv.style.display = "block";
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorDiv = document.getElementById("login-error");
  errorDiv.style.display = "none";
  
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al iniciar sesión");
    
    state.token = data.token;
    state.email = data.email;
    const bizType = document.getElementById("login-business-type").value || "textil";
    state.businessType = bizType;
    localStorage.setItem("gestiosmart_token", data.token);
    localStorage.setItem("gestiosmart_email", data.email);
    localStorage.setItem("gestiosmart_business_type", bizType);
    
    showToast("¡Sesión iniciada!");
    checkAuth();
  } catch (error) {
    errorDiv.innerText = translateError(error.message);
    errorDiv.style.display = "block";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const errorDiv = document.getElementById("register-error");
  errorDiv.style.display = "none";
  
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al registrarse");
    
    state.token = data.token;
    state.email = data.email;
    const bizType = document.getElementById("register-business-type").value || "textil";
    state.businessType = bizType;
    localStorage.setItem("gestiosmart_token", data.token);
    localStorage.setItem("gestiosmart_email", data.email);
    localStorage.setItem("gestiosmart_business_type", bizType);
    
    showToast("Registro exitoso. Verificá tu correo.");
    checkAuth();
  } catch (error) {
    errorDiv.innerText = translateError(error.message);
    errorDiv.style.display = "block";
  }
}

function handleLogout() {
  state.token = null;
  state.email = null;
  localStorage.removeItem("gestiosmart_token");
  localStorage.removeItem("gestiosmart_email");
  showToast("Sesión cerrada");
  checkAuth();
}

// --- Importación y Configuración Excel / Multi-negocio ---
let parsedImportProducts = [];

function triggerExcelImport() {
  document.getElementById("excel-import-input").click();
}

function closeExcelImportModal() {
  const modal = document.getElementById("excel-import-modal");
  if (modal) modal.classList.remove("active");
  document.getElementById("excel-import-input").value = "";
  parsedImportProducts = [];
}

function downloadExcelTemplate() {
  const isComercio = state.businessType === "comercio";
  const headers = isComercio 
    ? [["SKU", "Nombre", "Categoría", "Costo", "Precio Venta", "Stock", "Variante"]]
    : [["SKU", "Nombre", "Categoría", "Costo", "Precio Venta", "Stock", "Talle", "Color"]];
  const sampleData = isComercio
    ? [
        ["PROD-001", "Coca Cola 1.5L", "Bebidas", "1200", "1800", "24", "Único"],
        ["PROD-002", "Alfajor de Chocolate", "Kiosco", "400", "650", "50", "Único"]
      ]
    : [
        ["REM-NEGRA-M", "Remera Algodón Negra M", "Remeras", "3000", "6000", "15", "M", "Negro"]
      ];
  
  const sheetData = headers.concat(sampleData);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Productos");
  XLSX.writeFile(wb, "Plantilla_Importar_Productos.xlsx");
}

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      
      if (rows.length === 0) {
        showToast("El archivo de Excel está vacío.", true);
        return;
      }
      
      parsedImportProducts = [];
      
      rows.forEach(row => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          cleanRow[key.toLowerCase().trim()] = row[key];
        });
        
        const sku = String(cleanRow["sku"] || cleanRow["código"] || cleanRow["codigo"] || "").trim();
        const name = String(cleanRow["nombre"] || cleanRow["descripción"] || cleanRow["descripcion"] || cleanRow["producto"] || "").trim();
        const category = String(cleanRow["categoría"] || cleanRow["categoria"] || cleanRow["rubro"] || "General").trim();
        
        const costStr = String(cleanRow["costo"] || cleanRow["costo unitario"] || cleanRow["precio de costo"] || "0");
        const cost = parseFloat(costStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        const priceStr = String(cleanRow["precio"] || cleanRow["precio venta"] || cleanRow["precio de venta"] || cleanRow["venta"] || "0");
        const price = parseFloat(priceStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        const stockStr = String(cleanRow["stock"] || cleanRow["cantidad"] || cleanRow["unidades"] || "0");
        const stock = parseInt(stockStr.replace(/[^0-9]/g, "")) || 0;
        
        let size = String(cleanRow["talle"] || cleanRow["talla"] || cleanRow["medida"] || "Único").trim();
        let color = String(cleanRow["color"] || cleanRow["tono"] || cleanRow["variante"] || "Único").trim();
        let skuVal = sku;
        if (state.businessType === "comercio") {
          size = "Único";
          if (skuVal && !skuVal.endsWith("-U")) {
            skuVal = `${skuVal}-U`;
          }
        }
        
        const marginStr = String(cleanRow["margen"] || cleanRow["margen %"] || "");
        let margin = parseFloat(marginStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        if (price > 0 && cost > 0 && !marginStr) {
          margin = ((price / cost) - 1) * 100;
        }
        
        if (skuVal && name) {
          const baseSku = state.businessType === "comercio"
            ? (skuVal.endsWith("-U") ? skuVal.slice(0, -2) : skuVal)
            : (skuVal.split("-")[0] || skuVal);
            
          parsedImportProducts.push({
            id: Date.now() + Math.random(),
            baseSku: baseSku,
            sku: skuVal,
            name: name,
            category: category,
            size: size,
            color: color,
            stock: stock,
            baseCost: cost,
            margin: Math.round(margin * 10) / 10,
            cost: cost,
            extras: {}
          });
        }
      });
      
      if (parsedImportProducts.length === 0) {
        showToast("No se encontraron productos válidos en el Excel (se requiere Código/SKU y Nombre).", true);
        return;
      }
      
      const tbody = document.getElementById("excel-preview-tbody");
      tbody.innerHTML = "";
      const previewRows = parsedImportProducts.slice(0, 5);
      previewRows.forEach(p => {
        const tr = document.createElement("tr");
        const price = p.baseCost * (1 + p.margin / 100);
        tr.innerHTML = `
          <td style="font-family: monospace;">${p.sku}</td>
          <td style="font-weight: 700; color: #fff;">${p.name}</td>
          <td>${p.category}</td>
          <td style="text-align: right;">$ ${Math.round(p.baseCost).toLocaleString()}</td>
          <td style="text-align: right; color: var(--accent-emerald); font-weight: 700;">$ ${Math.round(price).toLocaleString()}</td>
          <td style="text-align: right; font-weight: 700;">${p.stock}</td>
        `;
        tbody.appendChild(tr);
      });
      
      document.getElementById("excel-import-summary").innerText = `Total de productos detectados para importar: ${parsedImportProducts.length} variante(s).`;
      
      document.getElementById("excel-preview-area").style.display = "block";
      document.getElementById("excel-confirm-btn").removeAttribute("disabled");
      document.getElementById("excel-import-modal").classList.add("active");
      
    } catch (err) {
      console.error(err);
      showToast("Error al procesar el archivo de Excel.", true);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmExcelImport() {
  if (parsedImportProducts.length === 0) return;
  
  const confirmBtn = document.getElementById("excel-confirm-btn");
  confirmBtn.setAttribute("disabled", "true");
  confirmBtn.innerText = "Procesando...";
  
  try {
    const batchSize = 50;
    for (let i = 0; i < parsedImportProducts.length; i += batchSize) {
      const batch = parsedImportProducts.slice(i, i + batchSize);
      showToast(`Importando lote ${Math.floor(i / batchSize) + 1}...`);
      await apiRequest("/api/products", "POST", batch);
    }
    
    showToast(`Se importaron ${parsedImportProducts.length} productos con éxito`);
    closeExcelImportModal();
    refreshState();
  } catch (error) {
    showToast("Error en la importación masiva: " + error.message, true);
    confirmBtn.removeAttribute("disabled");
    confirmBtn.innerText = "Importar Productos";
  }
}

async function updateBusinessType(type) {
  try {
    showToast("Actualizando tipo de negocio...");
    
    const profileDoc = {
      sku: "user_profile",
      name: "User Profile",
      cost: 0.0,
      stock: 0,
      createdAt: Math.floor(Date.now() / 1000),
      trialDays: 15,
      subscriptionStatus: "active",
      businessType: type
    };
    
    await apiRequest("/api/products", "POST", profileDoc);
    showToast("Negocio actualizado. Recargando...");
    await refreshState();
  } catch (err) {
    showToast("Error al guardar tipo de negocio: " + err.message, true);
  }
}

// --- API Request Helper ---
async function apiRequest(url, method = "GET", body = null) {
  const headers = {
    "Authorization": `Bearer ${state.token}`,
    "X-Business-Type": state.businessType || "textil"
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, options);
  const data = await res.json();
  
  if (res.status === 401) {
    handleLogout();
    throw new Error("Sesión expirada.");
  }
  
  if (!res.ok) {
    throw new Error(data.error || "Error en la petición.");
  }
  return data;
}

// --- Carga Inicial ---
async function initApp() {
  try {
    // Definir mes por defecto
    const currentMonthIndex = new Date().getMonth();
    state.panelMonth = MONTHS[currentMonthIndex];
    state.viewCostsMonth = MONTHS[currentMonthIndex];
    
    // Cargar selectores de meses en HTML
    populateMonthSelectors();
    
    await refreshState();
    switchTab("sales");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function refreshState() {
  // Mostrar estados de carga con spinners de FontAwesome
  const posGrid = document.getElementById("pos-products-grid");
  const invBody = document.getElementById("inventory-table-body");
  const costsBody = document.getElementById("fixed-costs-table-body");
  
  if (posGrid) {
    posGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-gray);">
        <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 14px; color: var(--accent-blue);"></i>
        <p style="font-size: 0.85rem; font-weight: 600; letter-spacing: 0.5px;">Cargando datos...</p>
      </div>
    `;
  }
  if (invBody) {
    invBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 60px 20px; color: var(--text-gray);">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 14px; color: var(--accent-blue);"></i>
          <p style="font-size: 0.85rem; font-weight: 600; letter-spacing: 0.5px;">Cargando datos...</p>
        </td>
      </tr>
    `;
  }
  if (costsBody) {
    costsBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 60px 20px; color: var(--text-gray);">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 14px; color: var(--accent-blue);"></i>
          <p style="font-size: 0.85rem; font-weight: 600; letter-spacing: 0.5px;">Cargando datos...</p>
        </td>
      </tr>
    `;
  }

  try {
    const data = await apiRequest("/api/all-state");
    
    const verifyScreen = document.getElementById("verify-email-screen");
    const paywallScreen = document.getElementById("paywall-screen");
    const appSection = document.getElementById("app-section");
    const authSection = document.getElementById("auth-section");
    const trialBadge = document.getElementById("trial-badge-container");
    const trialText = document.getElementById("trial-badge-text");

    // 1. Check Email Verification
    if (data.emailVerified === false) {
      if (authSection) authSection.style.display = "none";
      if (appSection) appSection.style.display = "none";
      if (paywallScreen) paywallScreen.style.display = "none";
      if (verifyScreen) verifyScreen.style.display = "flex";
      return;
    }

    // 2. Check Trial Expiration
    if (data.trialExpired === true) {
      if (authSection) authSection.style.display = "none";
      if (appSection) appSection.style.display = "none";
      if (verifyScreen) verifyScreen.style.display = "none";
      if (paywallScreen) paywallScreen.style.display = "flex";
      
      // Update WhatsApp link dynamic prefilled message
      const waBtn = document.getElementById("paywall-wa-btn");
      if (waBtn) {
        const adminPhone = "542914445566"; // Simulated Admin WhatsApp Phone Number
        const msg = encodeURIComponent(`Hola! Quiero renovar mi suscripción de GestioSmart para el correo: ${state.email}`);
        waBtn.href = `https://wa.me/542914445566?text=${msg}`;
      }
      return;
    }

    // 3. Normal view (desbloqueado)
    if (verifyScreen) verifyScreen.style.display = "none";
    if (paywallScreen) paywallScreen.style.display = "none";
    if (appSection) appSection.style.display = "flex";
    if (authSection) authSection.style.display = "none";

    // 4. Update Trial Countdown Badge
    if (trialBadge && trialText) {
      if (data.subscriptionStatus === "trial" && data.daysLeft !== undefined) {
        trialBadge.style.display = "flex";
        trialText.innerText = `Prueba: ${data.daysLeft} ${data.daysLeft === 1 ? 'día' : 'días'} restante${data.daysLeft === 1 ? '' : 's'}`;
      } else {
        trialBadge.style.display = "none";
      }
    }

    state.categories = data.categories || [];
    state.products = data.products || [];
    state.sales = data.sales || [];
    state.suppliers = data.suppliers || [];
    state.currentAccounts = data.currentAccounts || [];
    state.fixedCosts = data.fixedCosts || [];
    state.cashTransactions = data.cashTransactions || [];
    state.influencers = data.influencers || [];
    state.marketingExpenses = data.marketingExpenses || [];
    state.extras = data.extras || {};
    state.stockIntakes = data.stockIntakes || [];
    
    let bizType = data.businessType || localStorage.getItem("gestiosmart_business_type") || "textil";
    if (bizType === "clothing") bizType = "textil";
    if (bizType === "kiosk") bizType = "comercio";
    state.businessType = bizType;
    
    applyBusinessTypeUIUpdates();
    
    document.querySelectorAll(".menu-list .menu-item").forEach(item => {
      item.style.display = "block";
    });
  } catch (error) {
    console.error("Error loading states:", error);
    showToast("Error al sincronizar con la base de datos", true);
  } finally {
    // Inicializar formulario de ingreso de stock cada vez que se refresca el estado
    setupStockIntakeForm();
    renderAll();
  }
}

function populateMonthSelectors() {
  const panelSel = document.getElementById("panel-month-select");
  const costSel = document.getElementById("costs-month-select");
  const periodMonthSel = document.getElementById("cost-period-month");
  
  [panelSel, costSel, periodMonthSel].forEach(select => {
    if (select) {
      select.innerHTML = "";
      MONTHS.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.innerText = m;
        select.appendChild(opt);
      });
    }
  });
  
  // Seleccionar mes actual
  if (panelSel) panelSel.value = state.panelMonth;
  if (costSel) costSel.value = state.viewCostsMonth;
  if (periodMonthSel) periodMonthSel.value = state.viewCostsMonth;
}

// --- Controladores de Renderizado ---
function renderAll() {
  renderPanel();
  renderSalesPOS();
  renderInventory();
  renderSuppliers();
  renderSupplierAccounts();
  renderCollections();
  renderCashTransactions();
  renderFixedCosts();
  renderMarketing();
  renderExtrasConfig();
  renderStockIntakes();
  updateNotifications();
}

// --- 1. PANEL DE CONTROL (Dashboard) ---
function setPanelPeriod(p) {
  state.panelPeriod = p;
  document.querySelectorAll(".period-pill-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`period-${p}`).classList.add("active");
  
  const monthSelector = document.getElementById("panel-month-select");
  if (p === "mes") {
    monthSelector.style.display = "block";
  } else {
    monthSelector.style.display = "none";
  }
  
  renderPanel();
}

function renderPanel() {
  const monthSelect = document.getElementById("panel-month-select");
  state.panelMonth = monthSelect.value;
  
  const now = new Date();
  
  // Filtrar ventas del periodo
  const filteredSales = state.sales.filter(sale => {
    const saleDate = new Date(sale.date);
    if (state.panelPeriod === "hoy") {
      return saleDate.toDateString() === now.toDateString();
    }
    if (state.panelPeriod === "semana") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return saleDate >= sevenDaysAgo;
    }
    if (state.panelPeriod === "mes") {
      return MONTHS[saleDate.getMonth()] === state.panelMonth && saleDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // Facturación Bruta (Ventas comerciales)
  const totalSalesValue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  
  // Unidades Despachadas
  const totalItemsSold = filteredSales.reduce((sum, s) => {
    return sum + (s.items ? s.items.reduce((itemSum, item) => itemSum + (parseInt(item.quantity) || 0), 0) : 0);
  }, 0);

  // Ticket Promedio
  const averageTicket = filteredSales.length === 0 ? 0 : totalSalesValue / filteredSales.length;

  // Resultado Operativo: Ventas - Costo Físico de Prendas Vendidas
  const totalOperativo = filteredSales.reduce((sum, sale) => {
    const saleCost = sale.items ? sale.items.reduce((itemSum, item) => {
      const itemCost = parseFloat(item.product.cost) || 0;
      return itemSum + (itemCost * (parseInt(item.quantity) || 0));
    }, 0) : 0;
    return sum + (sale.total - saleCost);
  }, 0);

  // Costos Fijos Mensuales del mes actual (Gastos Fijos)
  const currentMonthCosts = state.fixedCosts.filter(c => c.period.includes(state.panelMonth));
  const totalCosts = currentMonthCosts.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  // Resultado Neto: Operativo - Costos Fijos
  const netResult = totalOperativo - totalCosts;

  // Actualizar KPIs en el HTML
  document.getElementById("panel-stat-revenue").innerText = `$ ${Math.round(totalSalesValue).toLocaleString()}`;
  document.getElementById("panel-stat-ticket").innerText = `$ ${Math.round(averageTicket).toLocaleString()}`;
  document.getElementById("panel-stat-units").innerText = totalItemsSold;
  document.getElementById("panel-stat-operativo").innerText = `$ ${Math.round(totalOperativo).toLocaleString()}`;
  document.getElementById("panel-stat-costs").innerText = `$ ${Math.round(totalCosts).toLocaleString()}`;
  document.getElementById("panel-stat-costs-month").innerText = `Mes de ${state.panelMonth}`;
  
  const netEl = document.getElementById("panel-stat-neto");
  const roundedNet = Math.round(netResult);
  if (roundedNet >= 0) {
    netEl.innerText = `$ ${roundedNet.toLocaleString()}`;
  } else {
    netEl.innerText = `-$ ${Math.abs(roundedNet).toLocaleString()}`;
  }
  netEl.style.color = netResult >= 0 ? "#10b981" : "#ef4444";

  // Renderizar Gráficos y Stock Crítico
  renderPanelCharts(filteredSales);
  renderPanelStockCritico();
}

function renderPanelCharts(filteredSales) {
  // Gráfico 1: Evolución de Ventas (Líneas)
  const evolutionCtx = document.getElementById("chart-evolution").getContext("2d");
  
  const salesMap = {};
  if (state.panelPeriod === "mes") {
    // Agrupar por semanas del mes
    ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5"].forEach(w => salesMap[w] = 0);
    filteredSales.forEach(s => {
      const day = new Date(s.date).getDate();
      const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
      salesMap[`Sem ${weekIndex + 1}`] += s.total;
    });
  } else {
    // Últimos 7 días
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      salesMap[label] = 0;
    }
    filteredSales.forEach(s => {
      const label = new Date(s.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      if (label in salesMap) {
        salesMap[label] += s.total;
      }
    });
  }

  const evolutionLabels = Object.keys(salesMap);
  const evolutionData = Object.values(salesMap);

  if (state.evolutionChart) state.evolutionChart.destroy();
  state.evolutionChart = new Chart(evolutionCtx, {
    type: 'line',
    data: {
      labels: evolutionLabels,
      datasets: [{
        label: 'Ventas ($)',
        data: evolutionData,
        borderColor: '#e5383b',
        backgroundColor: 'rgba(229, 56, 59, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#e5383b',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      }
    }
  });

  // Gráfico 2: Top Categorías (Barras Horizontales)
  const categoriesCtx = document.getElementById("chart-categories").getContext("2d");
  
  const categoryCounts = {};
  state.sales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const cat = item.product.category || "Otros";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + (parseInt(item.quantity) || 0);
      });
    }
  });

  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const categoryLabels = sortedCategories.map(c => c[0]);
  const categoryData = sortedCategories.map(c => c[1]);

  if (state.categoriesChart) state.categoriesChart.destroy();
  state.categoriesChart = new Chart(categoriesCtx, {
    type: 'bar',
    data: {
      labels: categoryLabels,
      datasets: [{
        label: 'Unidades Vendidas',
        data: categoryData,
        backgroundColor: ['#e5383b', '#ca6702', '#0a9396', '#005f73', '#e9d8a6'],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
      }
    }
  });
}

function getProductMinStock(p, salesByProduct) {
  const soldIn30 = salesByProduct[p.sku] || 0;
  const vmd = soldIn30 / 30;
  
  const te = (p.leadTime !== undefined && p.leadTime !== null && p.leadTime !== "") ? parseInt(p.leadTime) : 15;
  
  let ss = 0;
  if (p.securityStock !== undefined && p.securityStock !== null && p.securityStock !== "") {
    ss = parseInt(p.securityStock);
  } else {
    let ssDays = 7;
    if (soldIn30 >= 30 && soldIn30 <= 90) ssDays = 10;
    else if (soldIn30 > 90) ssDays = 15;
    ss = vmd * ssDays;
  }
  
  const pp = Math.ceil((vmd * te) + ss);
  const hasCustomConfig = (p.leadTime !== undefined && p.leadTime !== null && p.leadTime !== "") ||
                          (p.securityStock !== undefined && p.securityStock !== null && p.securityStock !== "");
  
  return pp === 0 ? (hasCustomConfig ? pp : 5) : pp;
}

function renderPanelStockCritico() {
  const container = document.getElementById("panel-stock-critico-list");
  container.innerHTML = "";

  // Calcular stock mínimo / punto de pedido PP para cada producto (excluyendo auxiliares)
  // Obtener ventas del último mes para calcular VMD
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = state.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
  
  const salesByProduct = {};
  recentSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const pSku = item.product.sku;
        salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
      });
    }
  });

  const criticalItems = state.products.map(p => {
    return {
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      minStock: getProductMinStock(p, salesByProduct)
    };
  }).filter(p => p.stock <= p.minStock);

  if (criticalItems.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 24px; text-align: center; color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px;">Todo el stock está en niveles óptimos.</div>`;
    return;
  }

  criticalItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "idx-card";
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    card.style.padding = "16px";
    card.style.borderColor = "rgba(229, 56, 59, 0.2)";
    card.style.background = "rgba(229, 56, 59, 0.03)";
    
    card.innerHTML = `
      <div>
        <h4 style="font-size: 0.8rem; font-weight: 800; color: #fff;">${item.name}</h4>
        <p style="font-size: 0.65rem; color: var(--text-gray); font-family: monospace; margin-top: 4px;">SKU: ${item.sku}</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 1.1rem; font-weight: 900; color: var(--accent-red);">${item.stock} un.</span>
        <p style="font-size: 0.55rem; color: var(--text-gray); text-transform: uppercase; font-weight: 700; margin-top: 2px;">Min: ${item.minStock}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

function formatExcelDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = date.getDate();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[date.getMonth()];
  return `${day}-${month}`;
}

function exportPanelToExcel() {
  const now = new Date();
  
  // Filtrar las ventas según el periodo activo del panel (excluyendo canjes)
  const filteredSales = state.sales.filter(sale => {
    if (sale.method === "Canje") return false;
    
    const saleDate = new Date(sale.date);
    if (state.panelPeriod === "hoy") {
      return saleDate.toDateString() === now.toDateString();
    }
    if (state.panelPeriod === "semana") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return saleDate >= sevenDaysAgo;
    }
    if (state.panelPeriod === "mes") {
      return MONTHS[saleDate.getMonth()] === state.panelMonth && saleDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // 1. Hoja: Panel
  const panelData = [];
  filteredSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const cost = parseFloat(item.product.cost) || 0;
        const margin = parseFloat(item.product.margin) || 0;
        const price = cost * (1 + margin / 100);
        
        const units = parseInt(item.quantity) || 0;
        const ventasT = price * units;
        const costoO = cost * units;
        const resultadoOp = ventasT - costoO;
        
        panelData.push({
          "Tiempo": formatExcelDate(sale.date),
          "Producto": item.product.name,
          "Variante": `${item.product.color || "Único"} - ${item.size}`,
          "Ventas T": Math.round(ventasT),
          "Unidades": units,
          "Costo O": Math.round(costoO),
          "Resultado Op": Math.round(resultadoOp)
        });
      });
    }
  });

  const wsPanel = XLSX.utils.json_to_sheet(panelData);
  
  // Agregar indicador de filtro al costado en la primera fila (Columnas I y J)
  wsPanel['I1'] = { t: 's', v: 'Filtro' };
  wsPanel['J1'] = { t: 's', v: state.panelMonth || 'Todos' };

  // 2. Hoja: Stock Critico
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = state.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
  const salesByProduct = {};
  recentSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const pSku = item.product.sku;
        salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
      });
    }
  });

  const criticalItems = state.products.map(p => {
    const minStock = getProductMinStock(p, salesByProduct);
    return {
      "SKU": p.sku,
      "Producto": p.name,
      "Color": p.color || "Único",
      "Talle": p.size || "",
      "Categoría": p.category || "",
      "Stock Actual": parseInt(p.stock) || 0,
      "Punto de Pedido (Mínimo)": minStock
    };
  }).filter(p => p["Stock Actual"] <= p["Punto de Pedido (Mínimo)"]);

  const wsStock = XLSX.utils.json_to_sheet(criticalItems);

  // 3. Hoja: Explicación Stock Crítico
  const explanationRows = [
    ["Guía de Stock Crítico (Punto de Pedido)"],
    [],
    ["¿Qué es el Stock Crítico?"],
    ["Es la cantidad mínima de unidades que debes tener de un producto antes de realizar un nuevo pedido de reposición al proveedor."],
    ["Esto te ayuda a evitar el quiebre de stock (quedarte sin productos para vender) mientras el proveedor prepara y entrega tu pedido."],
    [],
    ["Fórmula de Cálculo:"],
    ["Stock Crítico = (Venta Media Diaria × Tiempo de Entrega (Días)) + Stock de Seguridad"],
    [],
    ["Ejemplo Sencillo (Venta de Alfajores):"],
    ["- Venta Media Diaria: 2 unidades/día (promedio vendido por día)"],
    ["- Tiempo de Entrega del Proveedor: 5 días (tiempo en traer el pedido)"],
    ["- Stock de Seguridad: 4 unidades (colchón extra por demoras)"],
    [],
    ["Cálculo:"],
    ["(2 × 5) + 4 = 14 unidades"],
    [],
    ["Conclusión:"],
    ["En el momento en que tu stock de alfajores llegue a 14 unidades, debes realizar un nuevo pedido."]
  ];
  const wsExplanation = XLSX.utils.aoa_to_sheet(explanationRows);

  // Crear libro y añadir las tres hojas
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPanel, "Panel");
  XLSX.utils.book_append_sheet(wb, wsStock, "Stock Critico");
  XLSX.utils.book_append_sheet(wb, wsExplanation, "Explicacion Stock Critico");
  XLSX.writeFile(wb, `Reporte_Panel_${state.panelMonth}.xlsx`);
}

// --- 2. VENTAS (POS) ---
function renderSalesPOS() {
  try {
    const container = document.getElementById("pos-products-grid");
    if (!container) return;
    
    const searchInputEl = document.getElementById("pos-search-input");
    const searchInput = (searchInputEl ? searchInputEl.value : "").toLowerCase();
    
    // Categoría seleccionada
    const activePill = document.querySelector("#pos-categories-pills .pos-category-btn.active");
    const selectedCat = activePill ? activePill.dataset.category : "Todos";
    
    container.innerHTML = "";

    // Filtrar productos reales (excluyendo auxiliares e ingresos de mercadería)
    const actualProducts = state.products.filter(p => p.sku && 
                                                      !p.sku.startsWith("supplier_") && 
                                                      !p.sku.startsWith("fixedcost_") && 
                                                      !p.sku.startsWith("account_") && 
                                                      !p.sku.startsWith("cashtransaction_") && 
                                                      !p.sku.startsWith("influencer_") && 
                                                      !p.sku.startsWith("marketingexpense_") && 
                                                      !p.sku.startsWith("stockintake_") && 
                                                      p.sku !== "extras_config" && 
                                                      p.sku !== "categories_config");

    // Agrupar variantes por baseSku para mostrar una sola tarjeta por modelo
    const baseProductsMap = {};
    actualProducts.forEach(p => {
      const name = p.name || "";
      const sku = p.sku || "";
      const category = p.category || "";
      
      const matchesSearch = name.toLowerCase().includes(searchInput) || 
                            sku.toLowerCase().includes(searchInput) || 
                            category.toLowerCase().includes(searchInput);
      const matchesCat = selectedCat === "Todos" || category === selectedCat;
      
      if (matchesSearch && matchesCat) {
        const baseSku = p.baseSku || sku.split('-').slice(0, -1).join('-') || sku;
        if (!baseProductsMap[baseSku]) {
          baseProductsMap[baseSku] = {
            baseSku: baseSku,
            name: name,
            category: category,
            color: p.color || "Único",
            margin: parseFloat(p.margin) || 0,
            baseCost: parseFloat(p.baseCost || p.cost) || 0,
            cost: parseFloat(p.cost) || 0,
            variants: []
          };
        }
        baseProductsMap[baseSku].variants.push(p);
      }
    });

    const uniqueBaseProducts = Object.values(baseProductsMap);

    if (uniqueBaseProducts.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-gray); font-size: 0.8rem; padding: 40px;">${state.businessType === "comercio" ? "No se encontraron productos." : "No se encontraron prendas."}</div>`;
      renderPOSCategoryPills(selectedCat);
      return;
    }

    uniqueBaseProducts.forEach(bp => {
      // Sumar el stock de todas sus variantes
      const totalStock = bp.variants.reduce((acc, curr) => acc + (parseInt(curr.stock) || 0), 0);
      // Calcular el precio (usando la primera variante como referencia)
      const ref = bp.variants[0];
      const cost = parseFloat(ref.cost) || 0;
      const margin = parseFloat(ref.margin) || 0;
      const price = cost * (1 + margin / 100);

      const card = document.createElement("div");
      card.className = "pos-product-card";
      card.onclick = () => handlePOSProductClick(bp);
      
      card.innerHTML = `
        <div>
          <h3 class="pos-product-name">${bp.name}</h3>
          <p class="pos-product-category">${bp.category} | ${bp.color}</p>
        </div>
        <div class="pos-product-footer">
          <span class="pos-product-price">$ ${Math.round(price).toLocaleString()}</span>
          <button class="pos-product-plus-btn">${totalStock > 0 ? '+' : '✕'}</button>
        </div>
      `;
      container.appendChild(card);
    });

    // Renderizar píldoras de categorías si es la primera vez o cambiaron
    renderPOSCategoryPills(selectedCat);
    renderPOSCart();
  } catch (error) {
    console.error("Error in renderSalesPOS:", error);
    showToast("Error renderizando ventas: " + error.message, true);
  }
}

function renderPOSCategoryPills(selectedCat) {
  const container = document.getElementById("pos-categories-pills");
  if (!container) return;
  container.innerHTML = "";

  const allCats = ["Todos", ...state.categories];
  allCats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "pos-category-btn" + (cat === selectedCat ? " active" : "");
    btn.dataset.category = cat;
    btn.innerText = cat;
    btn.onclick = (e) => {
      document.querySelectorAll("#pos-categories-pills .pos-category-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderSalesPOS();
    };
    container.appendChild(btn);
  });
}

function handlePOSProductClick(bp) {
  const totalStock = bp.variants.reduce((acc, curr) => acc + curr.stock, 0);
  if (totalStock <= 0) {
    showToast(state.businessType === "comercio" ? "Producto sin stock disponible." : "Prenda sin stock disponible.", true);
    return;
  }

  // Filtrar variantes con stock real
  const availableVariants = bp.variants.filter(v => v.stock > 0);
  
  if (availableVariants.length > 1) {
    // Abrir modal de selección de talle
    openSizeSelectionModal(bp, availableVariants);
  } else if (availableVariants.length === 1) {
    // Agregar directo
    addVariantToCart(availableVariants[0]);
  }
}

function openSizeSelectionModal(bp, variants) {
  state.selectedProductForSize = bp;
  document.getElementById("size-modal-product-name").innerText = bp.name;
  document.getElementById("size-modal-product-color").innerText = bp.color;
  
  const grid = document.getElementById("size-modal-options-grid");
  grid.innerHTML = "";
  
  variants.forEach(v => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.style.padding = "12px";
    btn.style.fontWeight = "800";
    btn.innerText = v.size;
    btn.onclick = () => {
      addVariantToCart(v);
      closeSizeModal();
    };
    grid.appendChild(btn);
  });

  document.getElementById("size-modal").className = "modal-backdrop active";
}

function closeSizeModal() {
  document.getElementById("size-modal").className = "modal-backdrop";
  state.selectedProductForSize = null;
}

function addVariantToCart(variant) {
  const existingIndex = state.cart.findIndex(item => item.product.sku === variant.sku);
  
  if (existingIndex > -1) {
    const currentQty = state.cart[existingIndex].quantity;
    if (currentQty + 1 > variant.stock) {
      showToast(`Solo quedan ${variant.stock} unidades en stock.`, true);
      return;
    }
    state.cart[existingIndex].quantity += 1;
  } else {
    state.cart.push({
      product: variant,
      size: variant.size,
      quantity: 1
    });
  }
  
  showToast("Producto agregado");
  renderPOSCart();
}

function updatePOSCartQty(sku, delta) {
  const idx = state.cart.findIndex(item => item.product.sku === sku);
  if (idx === -1) return;
  
  const item = state.cart[idx];
  const newQty = item.quantity + delta;
  
  if (newQty < 1) {
    state.cart.splice(idx, 1);
  } else {
    if (newQty > item.product.stock) {
      showToast(`Solo quedan ${item.product.stock} unidades en stock.`, true);
      return;
    }
    state.cart[idx].quantity = newQty;
  }
  renderPOSCart();
}

function setPOSCartExactQty(sku, val) {
  const idx = state.cart.findIndex(item => item.product.sku === sku);
  if (idx === -1) return;
  
  const item = state.cart[idx];
  if (val === "") {
    item.quantity = ""; // Permitir limpiar temporalmente en el input
    renderPOSCart(false); // Renderizar sin recalcular totales temporalmente
    return;
  }
  
  let newQty = parseInt(val) || 1;
  newQty = Math.max(1, newQty);
  
  if (newQty > item.product.stock) {
    showToast(`Solo quedan ${item.product.stock} unidades en stock.`, true);
    item.quantity = item.product.stock;
  } else {
    item.quantity = newQty;
  }
  renderPOSCart();
}

function removePOSCartItem(sku) {
  state.cart = state.cart.filter(item => item.product.sku !== sku);
  renderPOSCart();
}

function renderPOSCart(recalc = true) {
  const container = document.getElementById("pos-cart-items-container");
  container.innerHTML = "";

  const countBadge = document.getElementById("pos-cart-count-badge");
  const cobrarBtn = document.getElementById("pos-cobrar-btn");
  
  const totalItemsCount = state.cart.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
  countBadge.innerText = `${totalItemsCount} items`;

  if (state.cart.length === 0) {
    container.innerHTML = `<div class="pos-cart-empty"><p>El carrito está vacío</p></div>`;
    document.getElementById("pos-cart-total-val").innerText = "$ 0";
    cobrarBtn.disabled = true;
    return;
  }

  cobrarBtn.disabled = false;

  let total = 0;
  state.cart.forEach(item => {
    const price = item.product.cost * (1 + item.product.margin / 100);
    const itemTotal = price * (parseInt(item.quantity) || 0);
    total += itemTotal;

    const el = document.createElement("div");
    el.className = "pos-cart-item";
    el.innerHTML = `
      <div class="pos-cart-item-info">
        <h4 class="pos-cart-item-name">${item.product.name}</h4>
        <p class="pos-cart-item-variant">${item.size} | ${item.product.color}</p>
        <p class="pos-cart-item-price">$ ${Math.round(price).toLocaleString()}</p>
      </div>
      <div class="pos-cart-item-actions">
        <button class="pos-cart-item-delete" onclick="removePOSCartItem('${item.product.sku}')">✕</button>
        <div class="pos-qty-control">
          <button class="pos-qty-btn" onclick="updatePOSCartQty('${item.product.sku}', -1)">-</button>
          <input type="number" class="pos-qty-input" value="${item.quantity}" oninput="setPOSCartExactQty('${item.product.sku}', this.value)" onblur="if(this.value==='') setPOSCartExactQty('${item.product.sku}', '1')">
          <button class="pos-qty-btn" onclick="updatePOSCartQty('${item.product.sku}', 1)">+</button>
        </div>
        <span class="pos-qty-stock-alert">Stock: ${item.product.stock}</span>
      </div>
    `;
    container.appendChild(el);
  });

  if (recalc) {
    document.getElementById("pos-cart-total-val").innerText = `$ ${Math.round(total).toLocaleString()}`;
    document.getElementById("pos-cart-total-val").dataset.total = total;
  }
}

// POS Checkout Modal Flow
function openCheckoutModal() {
  const total = parseFloat(document.getElementById("pos-cart-total-val").dataset.total) || 0;
  document.getElementById("checkout-total-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
  document.getElementById("checkout-finance-total-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
  
  // Rellenar clientes en datalist de Cobranzas
  const datalist = document.getElementById("chk-client-list");
  datalist.innerHTML = "";
  state.currentAccounts.filter(a => a.type === "cliente").forEach(acc => {
    const opt = document.createElement("option");
    opt.value = acc.entityName;
    datalist.appendChild(opt);
  });

  // Mostrar step 1 por defecto
  document.getElementById("checkout-step-method").style.display = "block";
  document.getElementById("checkout-step-finance").style.display = "none";
  document.getElementById("checkout-step-success").style.display = "none";

  document.getElementById("checkout-modal").className = "modal-backdrop active";
}

function closeCheckoutModal() {
  document.getElementById("checkout-modal").className = "modal-backdrop";
}

async function confirmPayment(method) {
  const total = parseFloat(document.getElementById("pos-cart-total-val").dataset.total) || 0;
  const totalUnits = state.cart.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

  if (method === "Financiado") {
    // Avanzar a step 2
    document.getElementById("checkout-step-method").style.display = "none";
    document.getElementById("checkout-step-finance").style.display = "block";
    document.getElementById("checkout-units-display").innerText = `${totalUnits} u.`;
    document.getElementById("checkout-debt-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
    
    // Resetear form
    document.getElementById("chk-client-name").value = "";
    document.getElementById("chk-client-phone").value = "";
    document.getElementById("chk-client-address").value = "";
    document.getElementById("chk-client-paid").value = "";
    return;
  }

  // Registrar venta directa
  const salePayload = {
    date: new Date().toISOString(),
    total: total,
    method: method,
    items: state.cart.map(item => ({
      product: item.product,
      size: item.size,
      quantity: parseInt(item.quantity) || 1
    }))
  };

  try {
    await apiRequest("/api/sales", "POST", salePayload);
    
    // Avanzar a step 3 (éxito)
    document.getElementById("checkout-step-method").style.display = "none";
    document.getElementById("checkout-step-success").style.display = "block";
    
    state.cart = [];
    setTimeout(() => {
      closeCheckoutModal();
      refreshState();
    }, 1500);
  } catch (error) {
    showToast(error.message, true);
  }
}

function autoFillClientInfo() {
  const name = document.getElementById("chk-client-name").value.trim().toLowerCase();
  const match = state.currentAccounts.find(a => a.type === "cliente" && a.entityName.toLowerCase() === name);
  if (match) {
    document.getElementById("chk-client-phone").value = match.phone || "";
    document.getElementById("chk-client-address").value = match.address || "";
  }
}

function formatCheckoutPaidAmount() {
  const input = document.getElementById("chk-client-paid");
  const raw = input.value.replace(/\D/g, "");
  const total = parseFloat(document.getElementById("pos-cart-total-val").dataset.total) || 0;
  
  const paid = parseFloat(raw) || 0;
  if (paid > total) {
    showToast(`El monto pagado no puede superar el total de la venta ($${total.toLocaleString()})`, true);
    input.value = "";
    document.getElementById("checkout-debt-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
    return;
  }
  
  input.value = raw ? "$ " + parseInt(raw).toLocaleString("es-AR") : "";
  const debt = total - paid;
  document.getElementById("checkout-debt-display").innerText = `$ ${Math.round(debt).toLocaleString()}`;
}

async function submitCheckoutFinance() {
  const name = document.getElementById("chk-client-name").value.trim();
  const phone = document.getElementById("chk-client-phone").value.trim();
  const address = document.getElementById("chk-client-address").value.trim();
  const paidRaw = document.getElementById("chk-client-paid").value.replace(/\D/g, "");
  
  if (!name) {
    showToast("Nombre del cliente requerido", true);
    return;
  }

  const total = parseFloat(document.getElementById("pos-cart-total-val").dataset.total) || 0;
  const paidAmount = parseFloat(paidRaw) || 0;
  const debtAmount = total - paidAmount;

  try {
    // 1. Crear o actualizar cuenta corriente de cliente
    let account = state.currentAccounts.find(a => a.type === "cliente" && a.entityName.toLowerCase() === name.toLowerCase());
    let accId = account ? account.id : null;

    if (!account) {
      // Registrar nueva cuenta corriente en backend
      account = await apiRequest("/api/current-accounts", "POST", {
        entityName: name,
        type: "cliente",
        phone: phone,
        address: address
      });
      accId = account.id;
    }

    // 2. Registrar venta de tipo Cta. Corriente
    const methodStr = `Cta. corriente (${paidAmount > 0 ? '$'+Math.round(paidAmount).toLocaleString()+' Pago' : 'Total'})`;
    const salePayload = {
      date: new Date().toISOString(),
      total: total,
      method: methodStr,
      items: state.cart.map(item => ({
        product: item.product,
        size: item.size,
        quantity: parseInt(item.quantity) || 1
      }))
    };

    // Submit venta
    const registeredSale = await apiRequest("/api/sales", "POST", salePayload);
    const saleId = registeredSale.id || `V-${Math.floor(Math.random()*10000)}`;

    // 3. Registrar la transacción en la cuenta corriente de cliente
    await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", {
      description: `Venta Cta. corriente ${saleId}`,
      amount: debtAmount,
      payment: paidAmount, // registrar entrega parcial si existe
      date: salePayload.date
    });

    // Éxito
    document.getElementById("checkout-step-finance").style.display = "none";
    document.getElementById("checkout-step-success").style.display = "block";
    
    state.cart = [];
    setTimeout(() => {
      closeCheckoutModal();
      refreshState();
    }, 1500);
  } catch (error) {
    showToast(error.message, true);
  }
}

// Sales History Modal
function openSalesHistoryModal() {
  const modal = document.getElementById("sales-history-modal");
  const list = document.getElementById("sales-history-list");
  const empty = document.getElementById("sales-history-empty");
  
  list.innerHTML = "";
  
  if (state.sales.length === 0) {
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    state.sales.forEach(sale => {
      const itemsText = sale.items ? sale.items.map(item => `${item.quantity} un x ${item.product.name} (${item.size})`).join("<br>") : "";
      const dateStr = new Date(sale.date).toLocaleDateString('es-AR') + " " + new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      const el = document.createElement("div");
      el.style.borderBottom = "1px solid var(--border-color)";
      el.style.paddingBottom = "16px";
      el.style.marginBottom = "16px";
      
      let badgeClass = "badge-emerald";
      if (sale.method.startsWith("Cta. corriente")) badgeClass = "badge-blue";
      else if (sale.method === "Canje") badgeClass = "badge-gray";
      
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <span style="font-size: 1.1rem; font-weight: 900; color: #fff;">$ ${Math.round(sale.total).toLocaleString()}</span>
            <span class="badge ${badgeClass}" style="margin-left: 8px;">${sale.method}</span>
          </div>
          <span style="font-size: 0.7rem; color: var(--text-gray); font-family: monospace;">ID: ${sale.id}</span>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-gray); margin-bottom: 12px;">📅 ${dateStr}</p>
        <div style="background: var(--bg-input); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.75rem; line-height: 1.5; color: var(--text-gray-light);">
          ${itemsText}
        </div>
      `;
      list.appendChild(el);
    });
  }

  modal.className = "modal-backdrop active";
}

function closeSalesHistoryModal() {
  document.getElementById("sales-history-modal").className = "modal-backdrop";
}

function exportSalesHistory() {
  const formatted = state.sales.flatMap(s => 
    s.items ? s.items.map(item => {
      const price = item.product.cost * (1 + item.product.margin / 100);
      return {
        ID_Venta: s.id,
        Fecha: new Date(s.date).toLocaleDateString(),
        Metodo: s.method,
        Producto: item.product.name,
        Categoria: item.product.category,
        Talle: item.size,
        Color: item.product.color,
        Cantidad: item.quantity,
        PrecioUnitario: Math.round(price),
        TotalVenta: Math.round(s.total)
      };
    }) : []
  );

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");
  XLSX.writeFile(wb, "Historial_Ventas.xlsx");
}

// --- 3. INVENTARIO ---
function renderInventory() {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;
  
  const searchInputEl = document.getElementById("inventory-search-input");
  const searchInput = (searchInputEl ? searchInputEl.value : "").toLowerCase();
  const filterCatEl = document.getElementById("inventory-category-filter");
  const filterCat = filterCatEl ? filterCatEl.value : "Todas las Categorías";
  
  tbody.innerHTML = "";

  // Calcular ventas de los últimos 30 días para stock crítico dinámico
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = state.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
  const salesByProduct = {};
  recentSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const pSku = item.product.sku;
        salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
      });
    }
  });

  // Filtrar productos reales
  const actualProducts = state.products.filter(p => p.sku &&
                                                    !p.sku.startsWith("supplier_") && 
                                                    !p.sku.startsWith("fixedcost_") && 
                                                    !p.sku.startsWith("account_") && 
                                                    !p.sku.startsWith("cashtransaction_") && 
                                                    !p.sku.startsWith("influencer_") && 
                                                    !p.sku.startsWith("marketingexpense_") && 
                                                    !p.sku.startsWith("stockintake_") && 
                                                    p.sku !== "extras_config" && 
                                                    p.sku !== "categories_config");

  const filtered = actualProducts.filter(p => {
    const name = p.name || "";
    const sku = p.sku || "";
    const category = p.category || "";
    const matchesSearch = name.toLowerCase().includes(searchInput) || 
                          sku.toLowerCase().includes(searchInput) || 
                          category.toLowerCase().includes(searchInput);
    const matchesCat = filterCat === "Todas las Categorías" || category === filterCat;
    return matchesSearch && matchesCat;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay productos registrados.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const cost = parseFloat(p.cost) || 0;
    const margin = parseFloat(p.margin) || 0;
    const price = cost * (1 + margin / 100);
    const tr = document.createElement("tr");
    
    const minStock = getProductMinStock(p, salesByProduct);
    const isCritical = (parseInt(p.stock) || 0) <= minStock;
    const colorClass = isCritical ? '#f87171' : '#10b981';
    
    tr.innerHTML = `
      <td style="font-weight: 700;">
        <div style="font-size: 0.85rem; color: #fff;">${p.name || ""}</div>
        <div style="font-size: 0.65rem; color: var(--text-gray); font-family: monospace; margin-top: 2px;">${p.sku || ""}</div>
      </td>
      <td>
        <span class="badge badge-gray">${p.category || ""}</span>
      </td>
      <td>
        <div style="font-size: 0.8rem;">${p.color || "Único"}</div>
        ${state.businessType === "comercio" ? "" : `<div style="font-size: 0.65rem; color: var(--text-gray); margin-top: 2px;">Talle: ${p.size || ""}</div>`}
      </td>
      <td style="text-align: right; font-weight: 700; color: ${colorClass};">
        ${parseInt(p.stock) || 0} un.
      </td>
      <td style="text-align: right; font-weight: 700; color: ${colorClass};">
        ${minStock} un.
      </td>
      <td style="text-align: right; color: var(--text-gray);">$ ${Math.round(cost).toLocaleString()}</td>
      <td style="text-align: right; font-weight: 700; color: #10b981;">$ ${Math.round(price).toLocaleString()}</td>
      <td style="text-align: right; color: var(--text-gray-light);">
        <span style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
          ${margin}%
        </span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-action" onclick="openEditProductModal('${p.sku}')">✏️</button>
          <button class="btn-action btn-delete" onclick="deleteProduct('${p.sku}')">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Rellenar filtros de categorías en inventario
  populateInventoryCategorySelect(filterCat);
}

function populateInventoryCategorySelect(filterCat) {
  const select = document.getElementById("inventory-category-filter");
  const prevVal = select.value;
  select.innerHTML = `<option value="Todas las Categorías">Todas las Categorías</option>`;
  state.categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.innerText = c;
    select.appendChild(opt);
  });
  if (state.categories.includes(prevVal)) {
    select.value = prevVal;
  } else {
    select.value = "Todas las Categorías";
  }
}

// Product Modal (Add/Edit)
function openCreateProductModal() {
  document.getElementById("modal-product-title").innerText = "Nuevo Producto";
  document.getElementById("prod-sku").value = "";
  document.getElementById("prod-sku").readOnly = false;
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-color").value = "";
  document.getElementById("prod-cost-input").value = "";
  document.getElementById("prod-margin").value = 50;
  
  // Limpiar stock dinámico
  document.getElementById("prod-te").value = "";
  document.getElementById("prod-ss").value = "";
  
  // Limpiar stocks de talles
  ['S', 'M', 'L', 'XL', 'XXL', 'Unico'].forEach(sz => {
    document.getElementById(`stock-${sz}`).value = "";
    document.getElementById(`stock-${sz}`).readOnly = false;
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-color-label").innerText = isComercio ? "Variante" : "Color";
  document.getElementById("prod-color").placeholder = isComercio ? "Ej. Chocolate, Pack x3, etc." : "Ej. Negro";
  
  document.getElementById("prod-stock-simple").value = "";
  document.getElementById("prod-stock-simple").readOnly = false;
  
  const talleCard = document.getElementById("product-talles-card");
  const simpleStockContainer = document.getElementById("product-simple-stock-container");
  if (isComercio) {
    if (talleCard) talleCard.style.display = "none";
    if (simpleStockContainer) simpleStockContainer.style.display = "block";
  } else {
    if (talleCard) talleCard.style.display = "block";
    if (simpleStockContainer) simpleStockContainer.style.display = "none";
  }

  // Rellenar categorías
  populateProductFormCategories("");
  
  // Rellenar adicionales selectors (vacío para nuevo producto)
  populateExtrasSelectors({});

  recalculateProductPrice();
  
  document.getElementById("product-modal").className = "modal-overlay active";
}

function openEditProductModal(sku) {
  const p = state.products.find(prod => prod.sku === sku);
  if (!p) return;

  document.getElementById("modal-product-title").innerText = "Editar Variante";
  document.getElementById("prod-sku").value = p.sku;
  document.getElementById("prod-sku").readOnly = true; // no se edita SKU ya guardado
  document.getElementById("prod-name").value = p.name;
  document.getElementById("prod-color").value = p.color;
  document.getElementById("prod-cost-input").value = Math.round(p.baseCost || p.cost).toLocaleString("es-AR");
  document.getElementById("prod-margin").value = p.margin;
  
  // Cargar stock dinámico
  document.getElementById("prod-te").value = (p.leadTime !== undefined && p.leadTime !== null) ? p.leadTime : "";
  document.getElementById("prod-ss").value = (p.securityStock !== undefined && p.securityStock !== null) ? p.securityStock : "";

  // Bloquear otros talles, solo permitir stock del talle de la variante
  ['S', 'M', 'L', 'XL', 'XXL', 'Unico'].forEach(sz => {
    const input = document.getElementById(`stock-${sz}`);
    if (sz === p.size.replace("Único", "Unico")) {
      input.value = p.stock;
      input.readOnly = false;
    } else {
      input.value = "";
      input.readOnly = true;
    }
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-color-label").innerText = isComercio ? "Variante" : "Color";
  document.getElementById("prod-color").placeholder = isComercio ? "Ej. Chocolate, Pack x3, etc." : "Ej. Negro";
  
  const talleCard = document.getElementById("product-talles-card");
  const simpleStockContainer = document.getElementById("product-simple-stock-container");
  if (isComercio) {
    if (talleCard) talleCard.style.display = "none";
    if (simpleStockContainer) simpleStockContainer.style.display = "block";
    document.getElementById("prod-stock-simple").value = p.stock;
    document.getElementById("prod-stock-simple").readOnly = false;
  } else {
    if (talleCard) talleCard.style.display = "block";
    if (simpleStockContainer) simpleStockContainer.style.display = "none";
  }

  populateProductFormCategories(p.category);
  
  // Rellenar adicionales selectors con la configuración del producto (con fallback compatible)
  const selectedExtras = p.extras || {
    estampados: p.estampadoId || "",
    packagings: p.packagingId || "",
    bordados: p.bordadoId || ""
  };
  populateExtrasSelectors(selectedExtras);
  
  recalculateProductPrice();

  document.getElementById("product-modal").className = "modal-overlay active";
}

function closeProductModal() {
  document.getElementById("product-modal").className = "modal-overlay";
}

function populateProductFormCategories(selected) {
  const select = document.getElementById("prod-category");
  select.innerHTML = "";
  state.categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.innerText = c;
    select.appendChild(opt);
  });
  if (selected && state.categories.includes(selected)) {
    select.value = selected;
  }
}

function populateExtrasSelectors(selectedExtras = {}) {
  const container = document.getElementById("product-extras-container");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(state.extras).forEach(catKey => {
    const title = getCategoryTitle(catKey);
    const options = state.extras[catKey] || [];

    const wrapper = document.createElement("div");

    const label = document.createElement("label");
    label.className = "form-label";
    label.style.fontSize = "0.75rem";
    label.innerText = title;

    const select = document.createElement("select");
    select.id = `prod-extra-${catKey}`;
    select.className = "form-select";
    select.onchange = recalculateProductPrice;

    // Opción default "Sin..."
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.innerText = `Sin ${title.toLowerCase()} ($0)`;
    select.appendChild(optNone);

    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.innerText = `${opt.name} (+ $${opt.cost})`;
      select.appendChild(o);
    });

    // Establecer selección
    const selectedVal = selectedExtras[catKey] || "";
    select.value = selectedVal;

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  });
}

function recalculateProductPrice() {
  const baseCost = parseFloat(document.getElementById("prod-cost-input").value.replace(/\D/g, "")) || 0;
  const margin = parseFloat(document.getElementById("prod-margin").value) || 0;
  
  // Sumar costos de los adicionales seleccionados
  let totalExtrasCost = 0;
  Object.keys(state.extras).forEach(catKey => {
    const el = document.getElementById(`prod-extra-${catKey}`);
    if (el) {
      const val = el.value;
      if (val) {
        const option = state.extras[catKey].find(o => o.id === val);
        if (option) {
          totalExtrasCost += option.cost;
        }
      }
    }
  });

  const totalCost = baseCost + totalExtrasCost;
  const price = totalCost * (1 + margin / 100);

  document.getElementById("prod-total-cost-display").innerText = `$ ${Math.round(totalCost).toLocaleString()}`;
  document.getElementById("prod-price-preview").innerText = `$ ${Math.round(price).toLocaleString()}`;
}

async function saveProductForm(e) {
  e.preventDefault();
  const name = document.getElementById("prod-name").value;
  const baseSku = document.getElementById("prod-sku").value.trim().toUpperCase();
  const category = document.getElementById("prod-category").value;
  const color = document.getElementById("prod-color").value;
  const cost = parseFloat(document.getElementById("prod-cost-input").value.replace(/\D/g, "")) || 0;
  const margin = parseFloat(document.getElementById("prod-margin").value);
  
  // Recolectar adicionales seleccionados
  const extras = {};
  let totalExtrasCost = 0;
  Object.keys(state.extras).forEach(catKey => {
    const el = document.getElementById(`prod-extra-${catKey}`);
    if (el) {
      const val = el.value || null;
      extras[catKey] = val;
      if (val) {
        const option = state.extras[catKey].find(o => o.id === val);
        if (option) {
          totalExtrasCost += option.cost;
        }
      }
    }
  });
  
  const totalCost = cost + totalExtrasCost;
  
  // Parsea stock crítico dinámico
  const leadTimeVal = document.getElementById("prod-te").value.trim();
  const leadTime = leadTimeVal !== "" ? parseInt(leadTimeVal) || 0 : null;
  const securityStockVal = document.getElementById("prod-ss").value.trim();
  const securityStock = securityStockVal !== "" ? parseInt(securityStockVal) || 0 : null;

  // Recolectar stock por talles
  const sizeStocks = {};
  let variantCount = 0;
  
  if (state.businessType === "comercio") {
    const inputVal = document.getElementById("prod-stock-simple").value;
    if (inputVal !== "") {
      sizeStocks["Único"] = parseInt(inputVal) || 0;
      variantCount++;
    } else {
      sizeStocks["Único"] = 0;
      variantCount++;
    }
  } else {
    const talleMapping = { 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL', 'XXL': 'XXL', 'Unico': 'Único' };
    for (const [idKey, szVal] of Object.entries(talleMapping)) {
      const inputVal = document.getElementById(`stock-${idKey}`).value;
      if (inputVal !== "") {
        sizeStocks[szVal] = parseInt(inputVal);
        variantCount++;
      }
    }
    if (variantCount === 0) {
      showToast("Por favor, ingresa stock para al menos un talle.", true);
      return;
    }
  }

  // Preparar variantes en lote
  const batchPayload = [];
  
  const title = document.getElementById("modal-product-title").innerText;
  const isEditing = title.startsWith("Editar");
  
  if (isEditing) {
    // Editar talle individual
    const size = Object.keys(sizeStocks)[0];
    const stock = sizeStocks[size];
    
    const payload = {
      id: Date.now(),
      baseSku: baseSku.split("-")[0] || baseSku,
      sku: baseSku, // el baseSku ya contiene el sufijo del talle en edición
      name: name,
      category: category,
      size: size,
      color: color,
      stock: stock,
      baseCost: cost,
      margin: margin,
      cost: totalCost,
      extras: extras,
      estampadoId: extras.estampados || null,
      bordadoId: extras.bordados || null,
      packagingId: extras.packagings || null,
      leadTime: leadTime,
      securityStock: securityStock
    };
    batchPayload.push(payload);
  } else {
    // Crear variantes
    for (const [size, stock] of Object.entries(sizeStocks)) {
      const payload = {
        id: Date.now() + Math.random(),
        baseSku: baseSku,
        sku: `${baseSku}-${size.replace("Único", "U")}`,
        name: name,
        category: category,
        size: size,
        color: color,
        stock: stock,
        baseCost: cost,
        margin: margin,
        cost: totalCost,
        extras: extras,
        estampadoId: extras.estampados || null,
        bordadoId: extras.bordados || null,
        packagingId: extras.packagings || null,
        leadTime: leadTime,
        securityStock: securityStock
      };
      batchPayload.push(payload);
    }
  }

  try {
    showToast("Guardando producto...");
    await apiRequest("/api/products", "POST", batchPayload);
    showToast("Producto guardado exitosamente");
    closeProductModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function deleteProduct(sku) {
  showConfirmModal(`¿Estás seguro de eliminar el producto con SKU ${sku}?`, async () => {
    try {
      await apiRequest(`/api/products/${sku}`, "DELETE");
      showToast("Producto eliminado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function exportInventoryToExcel() {
  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSales = state.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
  const salesByProduct = {};
  recentSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const pSku = item.product.sku;
        salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
      });
    }
  });

  const formatted = state.products.filter(p => p.sku && 
                                              !p.sku.startsWith("supplier_") && 
                                              !p.sku.startsWith("fixedcost_") && 
                                              !p.sku.startsWith("account_") && 
                                              !p.sku.startsWith("cashtransaction_") && 
                                              !p.sku.startsWith("influencer_") && 
                                              !p.sku.startsWith("marketingexpense_") && 
                                              !p.sku.startsWith("stockintake_") && 
                                              p.sku !== "extras_config" && 
                                              p.sku !== "categories_config")
    .map(p => {
      const price = p.cost * (1 + p.margin / 100);
      const minStock = getProductMinStock(p, salesByProduct);
      return {
        SKU: p.sku,
        Nombre: p.name,
        Categoria: p.category,
        Color: p.color,
        Talle: p.size,
        "Stock Actual": parseInt(p.stock) || 0,
        "Unidades de Stock Critico": minStock,
        CostoTotal: Math.round(p.cost),
        PrecioVenta: Math.round(price),
        Margen: p.margin
      };
    });

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  XLSX.writeFile(wb, "Inventario_Completo.xlsx");
}

// Categories Management Modal
function openCategoriesModal() {
  const list = document.getElementById("categories-list-container");
  list.innerHTML = "";

  state.categories.forEach(cat => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.justifyContent = "space-between";
    el.style.alignItems = "center";
    el.style.background = "var(--bg-input)";
    el.style.padding = "8px 12px";
    el.style.borderRadius = "8px";
    el.style.border = "1px solid var(--border-color)";
    
    el.innerHTML = `
      <span style="font-size: 0.8rem; font-weight: 700;">${cat}</span>
      <button class="btn-action btn-delete" style="width:24px; height:24px;" onclick="submitDeleteCategory('${cat}')">🗑️</button>
    `;
    list.appendChild(el);
  });

  document.getElementById("new-category-input").value = "";
  document.getElementById("categories-modal").className = "modal-backdrop active";
}

function closeCategoriesModal() {
  document.getElementById("categories-modal").className = "modal-backdrop";
}

async function submitAddCategory() {
  const input = document.getElementById("new-category-input");
  const val = input.value.trim();
  if (!val) return;

  if (state.categories.includes(val)) {
    showToast("La categoría ya existe", true);
    return;
  }

  const updated = [...state.categories, val];
  try {
    await apiRequest("/api/categories", "POST", { categories: updated });
    showToast("Categoría agregada");
    refreshState();
    openCategoriesModal(); // refrescar modal
  } catch (error) {
    showToast(error.message, true);
  }
}

function submitDeleteCategory(cat) {
  showConfirmModal(`¿Eliminar la categoría "${cat}"?`, async () => {
    const updated = state.categories.filter(c => c !== cat);
    try {
      await apiRequest("/api/categories", "POST", { categories: updated });
      showToast("Categoría eliminada");
      refreshState();
      openCategoriesModal();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// --- 4. PROVEEDORES (Compras) ---
// --- Custom Confirm Modal Helpers ---
function closeConfirmModal() {
  const modal = document.getElementById("idx-confirm-modal");
  if (modal) modal.classList.remove("active");
}

function showConfirmModal(message, onConfirm, title = "Confirmar Acción", danger = true) {
  const modal = document.getElementById("idx-confirm-modal");
  const titleEl = document.getElementById("confirm-modal-title");
  const messageEl = document.getElementById("confirm-modal-message");
  const confirmBtn = document.getElementById("confirm-modal-confirm");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  
  if (!modal) return;
  
  titleEl.innerText = title;
  messageEl.innerText = message;
  confirmBtn.innerText = danger ? "Eliminar" : "Confirmar";
  
  if (danger) {
    confirmBtn.className = "btn btn-primary";
  } else {
    confirmBtn.className = "btn btn-emerald";
  }
  
  modal.classList.add("active");
  
  // Clonar botones para limpiar event listeners previos
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener("click", () => {
    modal.classList.remove("active");
    if (onConfirm) onConfirm();
  });
  
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  newCancelBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

// --- 4. PROVEEDORES (Compras) ---
function renderSuppliers() {
  const container = document.getElementById("suppliers-list");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (state.suppliers.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No hay proveedores registrados.</p>`;
    return;
  }
  
  state.suppliers.forEach(s => {
    const card = document.createElement("div");
    card.className = "supplier-card";
    
    const categoriesBadge = s.categories 
      ? s.categories.map(c => `<span class="badge badge-gray" style="text-transform: uppercase;">${c}</span>`).join(" ") 
      : "";
    const productsText = s.products ? s.products.join(", ") : "Sin catálogo";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(229, 56, 59, 0.08); display: flex; align-items: center; justify-content: center; color: var(--accent-red); font-size: 1.2rem;">
            <i class="fas fa-box"></i>
          </div>
          <div>
            <h4 style="font-size: 0.9rem; font-weight: 800; color: var(--text-white);">${s.name}</h4>
            <p style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-phone" style="font-size: 0.65rem;"></i> ${s.phone}
            </p>
          </div>
        </div>
        <div class="actions-cell" style="display: flex; gap: 6px;">
          <button class="btn-action" style="padding: 6px;" onclick="openEditSupplierModal('${s.id}')">✏️</button>
          <button class="btn-action btn-delete" style="padding: 6px;" onclick="deleteSupplier('${s.id}')">🗑️</button>
        </div>
      </div>
      
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
        ${categoriesBadge}
      </div>
      
      <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 4px; display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-gray);">
        <i class="fas fa-tags" style="color: var(--text-muted); font-size: 0.7rem;"></i>
        <span>${productsText}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function openSupplierModal() {
  document.getElementById("modal-supplier-title").innerText = "Nuevo Proveedor";
  document.getElementById("supplier-id-input").value = "";
  document.getElementById("supplier-name").value = "";
  document.getElementById("supplier-phone").value = "";
  document.getElementById("supplier-categories").value = "";
  document.getElementById("supplier-products").value = "";
  
  document.getElementById("supplier-modal").className = "modal-backdrop active";
}

function openEditSupplierModal(sId) {
  const s = state.suppliers.find(sup => sup.id === sId || sup.id == sId);
  if (!s) return;

  document.getElementById("modal-supplier-title").innerText = "Editar Proveedor";
  document.getElementById("supplier-id-input").value = s.id;
  document.getElementById("supplier-name").value = s.name;
  document.getElementById("supplier-phone").value = s.phone;
  document.getElementById("supplier-categories").value = s.categories ? s.categories.join(", ") : "";
  document.getElementById("supplier-products").value = s.products ? s.products.join(", ") : "";
  
  document.getElementById("supplier-modal").className = "modal-backdrop active";
}

function closeSupplierModal() {
  document.getElementById("supplier-modal").className = "modal-backdrop";
}

async function saveSupplierForm(e) {
  e.preventDefault();
  const sId = document.getElementById("supplier-id-input").value;
  const name = document.getElementById("supplier-name").value;
  const phone = document.getElementById("supplier-phone").value;
  const categoriesStr = document.getElementById("supplier-categories").value;
  const productsStr = document.getElementById("supplier-products").value;

  const categories = categoriesStr.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const products = productsStr.split(",").map(p => p.trim()).filter(Boolean);

  const payload = { name, phone, categories, products };
  if (sId) payload.id = parseInt(sId) || sId;

  try {
    await apiRequest("/api/suppliers", "POST", payload);
    showToast("Proveedor guardado");
    closeSupplierModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function deleteSupplier(sId) {
  showConfirmModal("¿Deseas eliminar este proveedor del directorio?", async () => {
    try {
      await apiRequest(`/api/suppliers/${sId}`, "DELETE");
      showToast("Proveedor eliminado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// --- Stock Intake Form Setup & Submission ---
function setupStockIntakeForm() {
  const searchInput = document.getElementById("intake-product-search");
  const resultsDiv = document.getElementById("intake-search-results");
  const hiddenSkuInput = document.getElementById("intake-product-sku");
  const supplierSelect = document.getElementById("intake-supplier-select");
  const dateInput = document.getElementById("intake-date");
  
  if (!searchInput) return;
  
  // Cargar fecha actual
  if (!dateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  
  populateIntakeSuppliers();
  populateIntakeExtras();
  
  // Listeners para recálculos
  const inputsToRecalc = [
    "intake-materia-prima", "intake-margin",
    "intake-estampado-select", "intake-packaging-select", "intake-bordado-select"
  ];
  inputsToRecalc.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // Limpiar listeners viejos si existen
      el.removeEventListener("input", recalculateIntakeCosts);
      el.removeEventListener("change", recalculateIntakeCosts);
      
      if (el.tagName === "SELECT") {
        el.addEventListener("change", recalculateIntakeCosts);
      } else {
        el.addEventListener("input", recalculateIntakeCosts);
      }
    }
  });
  
  // Autocomplete search
  searchInput.removeEventListener("input", handleProductSearchInput);
  searchInput.addEventListener("input", handleProductSearchInput);
  
  // Ocultar resultados al hacer clic afuera
  document.addEventListener("click", (e) => {
    if (e.target !== searchInput && e.target !== resultsDiv) {
      resultsDiv.style.display = "none";
    }
  });
}

function clearIntakePreviews() {
  ['S', 'M', 'L', 'XL', 'XXL', 'U'].forEach(key => {
    const el = document.getElementById(`intake-stock-${key}`);
    if (el) {
      el.style.display = "none";
      el.innerText = "Stock: 0";
    }
  });
  const elSimple = document.getElementById("intake-stock-simple-display");
  if (elSimple) {
    elSimple.style.display = "none";
    elSimple.innerText = "Stock Actual: 0";
  }
  const matPrima = document.getElementById("intake-materia-prima-current");
  if (matPrima) {
    matPrima.style.display = "none";
  }
}

function handleProductSearchInput() {
  const searchInput = document.getElementById("intake-product-search");
  const resultsDiv = document.getElementById("intake-search-results");
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    resultsDiv.style.display = "none";
    document.getElementById("intake-product-sku").value = "";
    clearIntakePreviews();
    return;
  }
  
  // Agrupar variantes por SKU base para evitar duplicados en la lista de búsqueda
  const uniqueProducts = [];
  const seen = new Set();
  
  const actualProducts = state.products.filter(p => !p.sku.startsWith("supplier_") && 
                                                    !p.sku.startsWith("fixedcost_") && 
                                                    !p.sku.startsWith("account_") && 
                                                    !p.sku.startsWith("cashtransaction_") && 
                                                    !p.sku.startsWith("influencer_") && 
                                                    !p.sku.startsWith("marketingexpense_") && 
                                                    p.sku !== "extras_config" && 
                                                    p.sku !== "categories_config");
  
  actualProducts.forEach(p => {
    const baseKey = p.baseSku || p.sku.split('-').slice(0, -1).join('-');
    if (!seen.has(baseKey)) {
      seen.add(baseKey);
      uniqueProducts.push(p);
    }
  });
  
  const filtered = uniqueProducts.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.sku.toLowerCase().includes(query) ||
    (p.baseSku && p.baseSku.toLowerCase().includes(query))
  );
  
  if (filtered.length === 0) {
    resultsDiv.innerHTML = `<div class="autocomplete-item" style="color: var(--text-muted);">No se encontraron productos</div>`;
    resultsDiv.style.display = "block";
    return;
  }
  
  resultsDiv.innerHTML = filtered.map(p => {
    const baseSku = p.baseSku || p.sku.split('-').slice(0, -1).join('-');
    return `
      <div class="autocomplete-item" onclick="selectIntakeProduct('${p.sku}')">
        <strong>${p.name}</strong> <span style="font-size: 0.7rem; color: var(--text-gray);">(${baseSku})</span>
      </div>
    `;
  }).join("");
  resultsDiv.style.display = "block";
}

function selectIntakeProduct(sku) {
  const p = state.products.find(prod => prod.sku === sku);
  if (!p) return;
  
  document.getElementById("intake-product-search").value = p.name;
  document.getElementById("intake-product-sku").value = p.sku;
  document.getElementById("intake-search-results").style.display = "none";
  
  // Rellenar costo base y margen
  document.getElementById("intake-materia-prima").value = p.baseCost || p.cost || 0;
  document.getElementById("intake-margin").value = p.margin || 0;
  
  // Seleccionar adicionales si existen
  populateIntakeExtras(p);
  
  // Rellenar stock actual por talles
  const baseSku = p.baseSku || p.sku.split('-').slice(0, -1).join('-');
  const variants = state.products.filter(prod => {
    const pBase = prod.baseSku || prod.sku.split('-').slice(0, -1).join('-');
    return pBase.toLowerCase() === baseSku.toLowerCase();
  });
  
  if (state.businessType === "comercio") {
    const variant = variants.find(v => v.size === "Único");
    const stock = variant ? parseInt(variant.stock) || 0 : 0;
    const elSimple = document.getElementById("intake-stock-simple-display");
    if (elSimple) {
      elSimple.innerText = `Stock Actual: ${stock}`;
      elSimple.style.display = "inline-block";
    }
  } else {
    const szMapping = {
      'S': 'S',
      'M': 'M',
      'L': 'L',
      'XL': 'XL',
      'XXL': 'XXL',
      'U': 'Único'
    };
    Object.entries(szMapping).forEach(([key, sizeName]) => {
      const variant = variants.find(v => v.size === sizeName);
      const stock = variant ? parseInt(variant.stock) || 0 : 0;
      const el = document.getElementById(`intake-stock-${key}`);
      if (el) {
        el.innerText = `Stock: ${stock}`;
        el.style.display = "inline-block";
      }
    });
  }
  
  // Mostrar Materia Prima actual
  const currentBaseCost = p.baseCost || p.cost || 0;
  document.getElementById("intake-materia-prima-current-val").innerText = `$ ${Math.round(currentBaseCost).toLocaleString("es-AR")}`;
  document.getElementById("intake-materia-prima-current").style.display = "flex";
  
  recalculateIntakeCosts();
}

function recalculateIntakeCosts() {
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value) || 0;
  const margin = parseFloat(document.getElementById("intake-margin").value) || 0;
  
  let totalExtrasCost = 0;
  Object.keys(state.extras).forEach(catKey => {
    const el = document.getElementById(`intake-extra-select-${catKey}`);
    if (el) {
      const val = el.value;
      if (val && val !== "0") {
        totalExtrasCost += getExtraCost(catKey, val);
      }
    }
  });
  
  const totalCost = baseCost + totalExtrasCost;
  const salePrice = totalCost * (1 + margin / 100);
  
  document.getElementById("intake-total-cost-preview").innerText = `$ ${Math.round(totalCost).toLocaleString()}`;
  document.getElementById("intake-sale-price-preview").innerText = `$ ${Math.round(salePrice).toLocaleString()}`;
}

function getExtraCost(category, id) {
  if (id === "0" || !id) return 0;
  const item = state.extras[category].find(x => x.id === id);
  return item ? parseFloat(item.cost) || 0 : 0;
}

function populateIntakeSuppliers() {
  const select = document.getElementById("intake-supplier-select");
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">Seleccionar proveedor..</option>';
  
  state.suppliers.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.innerText = s.name;
    select.appendChild(opt);
  });
  
  select.value = currentVal;
}

function populateIntakeExtras(product = null) {
  const container = document.getElementById("intake-extras-container");
  if (!container) return;

  // Save current selections
  const currentSelections = {};
  container.querySelectorAll("select").forEach(sel => {
    const key = sel.id.replace("intake-extra-select-", "");
    currentSelections[key] = sel.value;
  });

  container.innerHTML = "";

  Object.keys(state.extras).forEach(catKey => {
    const title = getCategoryTitle(catKey);
    const options = state.extras[catKey] || [];

    const formGroup = document.createElement("div");
    formGroup.className = "form-group";
    formGroup.style.marginBottom = "0";

    const label = document.createElement("label");
    label.className = "form-label";
    label.innerText = title;

    const select = document.createElement("select");
    select.id = `intake-extra-select-${catKey}`;
    select.className = "form-select";
    select.onchange = recalculateIntakeCosts;

    // Opción default "Sin..."
    const optNone = document.createElement("option");
    optNone.value = "0";
    optNone.innerText = `Sin ${title.toLowerCase()} ($0)`;
    select.appendChild(optNone);

    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.innerText = `${opt.name} (+$${opt.cost})`;
      select.appendChild(o);
    });

    // Establecer selección
    let selectedVal = currentSelections[catKey] || "0";
    if (product) {
      const prodExtras = product.extras || {
        estampados: product.estampadoId,
        packagings: product.packagingId,
        bordados: product.bordadoId
      };
      selectedVal = prodExtras[catKey] || "0";
    }
    select.value = selectedVal;

    formGroup.appendChild(label);
    formGroup.appendChild(select);
    container.appendChild(formGroup);
  });
}

async function handleStockIntakeSubmit(e) {
  e.preventDefault();
  
  const selectedSku = document.getElementById("intake-product-sku").value;
  const supplierName = document.getElementById("intake-supplier-select").value;
  const dateVal = document.getElementById("intake-date").value;
  
  if (!selectedSku) {
    showToast("Por favor, selecciona un producto a reponer.", true);
    return;
  }
  
  if (!supplierName) {
    showToast("Por favor, selecciona un proveedor.", true);
    return;
  }
  
  const selectedProduct = state.products.find(p => p.sku === selectedSku);
  if (!selectedProduct) {
    showToast("Producto seleccionado no encontrado en el inventario.", true);
    return;
  }
  
  const baseSku = selectedProduct.baseSku || 
    (selectedProduct.sku.includes('-') && ['S','M','L','XL','XXL','U'].includes(selectedProduct.sku.split('-').pop()) 
      ? selectedProduct.sku.split('-').slice(0, -1).join('-') 
      : selectedProduct.sku);

  let sizesInput = {};
  if (state.businessType === "comercio") {
    const qty = parseInt(document.getElementById("intake-qty-simple").value) || 0;
    sizesInput = { 'Único': qty };
  } else {
    sizesInput = {
      'S': parseInt(document.getElementById("intake-qty-S").value) || 0,
      'M': parseInt(document.getElementById("intake-qty-M").value) || 0,
      'L': parseInt(document.getElementById("intake-qty-L").value) || 0,
      'XL': parseInt(document.getElementById("intake-qty-XL").value) || 0,
      'XXL': parseInt(document.getElementById("intake-qty-XXL").value) || 0,
      'Único': parseInt(document.getElementById("intake-qty-U").value) || 0
    };
  }
  
  const sizesToUpdate = Object.entries(sizesInput).filter(([_, qty]) => qty > 0);
  if (sizesToUpdate.length === 0) {
    showToast(state.businessType === "comercio" ? "Por favor, ingresa una cantidad mayor a 0." : "Por favor, ingresa una cantidad mayor a 0 en al menos un talle.", true);
    return;
  }
  
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value) || 0;
  const margin = parseFloat(document.getElementById("intake-margin").value) || 0;
  
  // Recolectar adicionales seleccionados
  const extras = {};
  let totalExtrasCost = 0;
  Object.keys(state.extras).forEach(catKey => {
    const el = document.getElementById(`intake-extra-select-${catKey}`);
    if (el) {
      const val = el.value || "0";
      extras[catKey] = val !== "0" ? val : null;
      if (val !== "0") {
        totalExtrasCost += getExtraCost(catKey, val);
      }
    }
  });
  
  const unitCost = baseCost + totalExtrasCost;
  
  let totalQuantity = 0;
  const quantitiesMap = {};
  sizesToUpdate.forEach(([size, qty]) => {
    totalQuantity += qty;
    quantitiesMap[size] = qty;
  });
  
  const totalCost = unitCost * totalQuantity;
  
  try {
    showToast("Registrando ingreso de mercadería...");
    
    const batchPayload = [];
    
    for (const [size, qty] of sizesToUpdate) {
      let existing = state.products.find(p => 
        (p.baseSku === baseSku || p.sku.startsWith(baseSku)) && 
        p.size === size
      );
      
      if (existing) {
        const updatedVariant = {
          ...existing,
          stock: (existing.stock || 0) + qty,
          baseCost: baseCost,
          margin: margin,
          cost: unitCost,
          extras: extras,
          estampadoId: extras.estampados || null,
          packagingId: extras.packagings || null,
          bordadoId: extras.bordados || null
        };
        batchPayload.push(updatedVariant);
      } else {
        const sizeSkuSuffix = size === 'Único' ? 'U' : size;
        const newVariant = {
          id: Date.now() + Math.random(),
          baseSku: baseSku,
          sku: `${baseSku}-${sizeSkuSuffix}`,
          name: selectedProduct.name,
          category: selectedProduct.category,
          size: size,
          color: selectedProduct.color || 'Único',
          stock: qty,
          baseCost: baseCost,
          margin: margin,
          cost: unitCost,
          extras: extras,
          estampadoId: extras.estampados || null,
          packagingId: extras.packagings || null,
          bordadoId: extras.bordados || null
        };
        batchPayload.push(newVariant);
      }
    }
    
    // Guardar actualizaciones de stock
    await apiRequest("/api/products", "POST", batchPayload);
    
    // Guardar documento de transacción de ingreso
    const intakePayload = {
      productSku: baseSku,
      productName: selectedProduct.name,
      supplierName: supplierName,
      quantities: quantitiesMap,
      totalQuantity: totalQuantity,
      unitCost: unitCost,
      totalCost: totalCost,
      date: dateVal,
      timestamp: Date.now()
    };
    await apiRequest("/api/stock-intakes", "POST", intakePayload);
    
    // Registrar el egreso en Caja Diaria
    const cajaPayload = {
      description: `Compra de mercadería - ${supplierName}`,
      type: "expense",
      amount: totalCost,
      date: dateVal + "T12:00:00.000Z"
    };
    await apiRequest("/api/cash-transactions", "POST", cajaPayload);
    
    showToast("¡Stock e ingreso registrados con éxito!");
    
    // Limpiar inputs del formulario
    document.getElementById("stock-intake-form").reset();
    document.getElementById("intake-product-sku").value = "";
    document.getElementById("intake-total-cost-preview").innerText = "$0";
    document.getElementById("intake-sale-price-preview").innerText = "$0";
    clearIntakePreviews();
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById("intake-date").value = `${yyyy}-${mm}-${dd}`;
    
    await refreshState();
    
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderStockIntakes() {
  const container = document.getElementById("stock-intakes-list");
  if (!container) return;
  
  if (!state.stockIntakes || state.stockIntakes.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No hay movimientos recientes.</p>`;
    return;
  }
  
  container.innerHTML = state.stockIntakes.map(item => {
    const qtyStr = Object.entries(item.quantities || {})
      .filter(([_, qty]) => qty > 0)
      .map(([size, qty]) => `${qty} un. (${size})`)
      .join(", ");
      
    let dateStr = item.date;
    try {
      const parts = item.date.split('-');
      if (parts.length === 3) {
        dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch(e) {}
    
    return `
      <div class="idx-card" style="padding: 14px; background: var(--bg-input); border-color: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-white);">${item.productName}</h4>
            <p style="font-size: 0.7rem; color: var(--text-gray); margin-top: 2px;">Proveedor: <strong>${item.supplierName}</strong></p>
          </div>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 4px;">
          <span style="font-size: 0.75rem; color: var(--text-gray);">${qtyStr}</span>
          <span style="font-size: 0.85rem; font-weight: 900; color: var(--accent-emerald);">$ ${(item.totalCost || 0).toLocaleString()}</span>
        </div>
      </div>
    `;
  }).join("");
}


// --- 5. CUENTAS CORRIENTES (Cuentas a Pagar & Cobranzas) ---
// --- 5. CUENTAS CORRIENTES (Cuentas a Pagar & Cobranzas) ---
function renderSupplierAccounts() {
  const container = document.getElementById("supplier-accounts-list");
  if (!container) return;
  container.innerHTML = "";

  const searchVal = (document.getElementById("supplier-accounts-search")?.value || "").toLowerCase();
  const proveedors = state.currentAccounts.filter(a => a.type === "proveedor" && a.entityName.toLowerCase().includes(searchVal));

  // Calcular total de deuda adeudada a proveedores
  const total = proveedors.reduce((sum, acc) => sum + (acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0), 0);
  const kpiVal = document.getElementById("supplier-accounts-kpi-val");
  if (kpiVal) kpiVal.innerText = `$ ${Math.round(total).toLocaleString()}`;

  if (proveedors.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay cuentas de proveedores registradas.</div>`;
    return;
  }

  proveedors.forEach(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
    
    let txRows = "";
    if (!acc.transactions || acc.transactions.length === 0) {
      txRows = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray); padding: 12px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
    } else {
      const sorted = [...acc.transactions].reverse();
      sorted.forEach(tx => {
        const dateStr = new Date(tx.date).toLocaleDateString('es-AR');
        txRows += `
          <tr>
            <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
            <td style="font-weight: 600;">${tx.description}</td>
            <td style="text-align: right; color: #f87171;">$ ${Math.round(tx.amount).toLocaleString()}</td>
            <td style="text-align: right; color: #10b981;">$ ${Math.round(tx.payment).toLocaleString()}</td>
          </tr>
        `;
      });
    }
    
    const card = document.createElement("div");
    card.className = "idx-card";
    card.style.padding = "20px";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "12px";
    card.style.background = "var(--bg-dark)";
    card.style.marginBottom = "8px";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">${acc.entityName}</h3>
            <button class="btn-action" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="editAccount('${acc.id}')">✏️</button>
            <button class="btn-action btn-delete" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="deleteAccount('${acc.id}')">🗑️</button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
            <span>📞 ${acc.phone || "-"}</span>
            <span>📍 ${acc.address || "-"}</span>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.6rem; font-weight: 800; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.5px; display: block;">SALDO ADEUDADO</span>
          <div style="font-size: 1.25rem; font-weight: 900; color: #f87171; margin-top: 2px; white-space: nowrap;">
            $ ${Math.round(balance).toLocaleString()}
          </div>
        </div>
      </div>

      <div class="table-wrapper" style="margin-bottom: 16px; max-height: 200px; overflow-y: auto;">
        <table class="idx-table">
          <thead>
            <tr>
              <th>FECHA</th>
              <th>CONCEPTO</th>
              <th style="text-align: right;">DEUDA</th>
              <th style="text-align: right;">PAGO</th>
            </tr>
          </thead>
          <tbody>
            ${txRows}
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-emerald" style="padding: 6px 14px; font-size: 0.75rem;" onclick="openAddPaymentModal('${acc.id}')">Pagar Deuda</button>
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.75rem;" onclick="openAddTransactionModal('${acc.id}')">Añadir Movimiento</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderCollections() {
  const container = document.getElementById("collections-list");
  if (!container) return;
  container.innerHTML = "";

  const searchVal = (document.getElementById("collections-search")?.value || "").toLowerCase();
  const clientes = state.currentAccounts.filter(a => a.type === "cliente" && a.entityName.toLowerCase().includes(searchVal));

  // Calcular total a cobrar de clientes
  const total = clientes.reduce((sum, acc) => sum + (acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0), 0);
  const kpiVal = document.getElementById("collections-kpi-val");
  if (kpiVal) kpiVal.innerText = `$ ${Math.round(total).toLocaleString()}`;

  if (clientes.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay cuentas corrientes de clientes registradas.</div>`;
    return;
  }

  clientes.forEach(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
    
    let txRows = "";
    if (!acc.transactions || acc.transactions.length === 0) {
      txRows = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray); padding: 12px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
    } else {
      const sorted = [...acc.transactions].reverse();
      sorted.forEach(tx => {
        const dateStr = new Date(tx.date).toLocaleDateString('es-AR');
        txRows += `
          <tr>
            <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
            <td style="font-weight: 600;">${tx.description}</td>
            <td style="text-align: right; color: #f87171;">$ ${Math.round(tx.amount).toLocaleString()}</td>
            <td style="text-align: right; color: #10b981;">$ ${Math.round(tx.payment).toLocaleString()}</td>
          </tr>
        `;
      });
    }
    
    const card = document.createElement("div");
    card.className = "idx-card";
    card.style.padding = "20px";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "12px";
    card.style.background = "var(--bg-dark)";
    card.style.marginBottom = "8px";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">${acc.entityName}</h3>
            <button class="btn-action" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="editAccount('${acc.id}')">✏️</button>
            <button class="btn-action btn-delete" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="deleteAccount('${acc.id}')">🗑️</button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
            <span>📞 ${acc.phone || "-"}</span>
            <span>📍 ${acc.address || "-"}</span>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.6rem; font-weight: 800; color: var(--text-gray); text-transform: uppercase; letter-spacing: 0.5px; display: block;">SALDO PENDIENTE</span>
          <div style="font-size: 1.25rem; font-weight: 900; color: #10b981; margin-top: 2px; white-space: nowrap;">
            $ ${Math.round(balance).toLocaleString()}
          </div>
        </div>
      </div>

      <div class="table-wrapper" style="margin-bottom: 16px; max-height: 200px; overflow-y: auto;">
        <table class="idx-table">
          <thead>
            <tr>
              <th>FECHA</th>
              <th>CONCEPTO</th>
              <th style="text-align: right;">DEUDA</th>
              <th style="text-align: right;">COBRO</th>
            </tr>
          </thead>
          <tbody>
            ${txRows}
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-emerald" style="padding: 6px 14px; font-size: 0.75rem;" onclick="openAddPaymentModal('${acc.id}')">Cobrar Deuda</button>
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.75rem;" onclick="openAddTransactionModal('${acc.id}')">Añadir Movimiento</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function openAccountModal(type) {
  document.getElementById("account-type-input").value = type;
  document.getElementById("account-id-input").value = "";
  document.getElementById("modal-account-title").innerText = type === "proveedor" ? "Registrar Cta. Proveedor" : "Registrar Cta. Cliente";
  document.getElementById("acc-entity-name").value = "";
  document.getElementById("acc-phone").value = "";
  document.getElementById("acc-address").value = "";
  
  document.getElementById("account-modal").className = "modal-backdrop active";
}

function closeAccountModal() {
  document.getElementById("account-modal").className = "modal-backdrop";
}

async function saveAccountForm(e) {
  e.preventDefault();
  const type = document.getElementById("account-type-input").value;
  const accId = document.getElementById("account-id-input").value;
  const entityName = document.getElementById("acc-entity-name").value;
  const phone = document.getElementById("acc-phone").value;
  const address = document.getElementById("acc-address").value;

  const payload = { entityName, type, phone, address };
  if (accId) payload.id = accId;

  try {
    await apiRequest("/api/current-accounts", "POST", payload);
    showToast(accId ? "Cuenta corriente actualizada" : "Cuenta corriente registrada");
    closeAccountModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function editAccount(accId) {
  const acc = state.currentAccounts.find(a => a.id === accId);
  if (!acc) return;
  document.getElementById("account-type-input").value = acc.type;
  document.getElementById("account-id-input").value = acc.id;
  document.getElementById("modal-account-title").innerText = acc.type === "proveedor" ? "Editar Cta. Proveedor" : "Editar Cta. Cliente";
  document.getElementById("acc-entity-name").value = acc.entityName;
  document.getElementById("acc-phone").value = acc.phone || "";
  document.getElementById("acc-address").value = acc.address || "";
  
  document.getElementById("account-modal").className = "modal-backdrop active";
}

function deleteAccount(accId) {
  showConfirmModal("¿Deseas eliminar esta cuenta corriente? Se perderán todos sus movimientos.", async () => {
    try {
      await apiRequest(`/api/current-accounts/${accId}`, "DELETE");
      showToast("Cuenta corriente eliminada");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openAddPaymentModal(accId) {
  openAccountDetailModal(accId);
  const acc = state.currentAccounts.find(a => a.id === accId);
  if (acc) {
    document.getElementById("tx-description").value = acc.type === "proveedor" ? "Pago parcial" : "Pago parcial";
    document.getElementById("tx-amount").value = "";
    document.getElementById("tx-payment").focus();
  }
}

function openAddTransactionModal(accId) {
  openAccountDetailModal(accId);
  document.getElementById("tx-description").value = "";
  document.getElementById("tx-payment").value = "";
  document.getElementById("tx-amount").focus();
}

function exportSupplierAccountsToExcel() {
  const proveedors = state.currentAccounts.filter(a => a.type === "proveedor");
  const data = proveedors.map(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
    return {
      Proveedor: acc.entityName,
      Teléfono: acc.phone || "",
      Dirección: acc.address || "",
      "Saldo Adeudado ($)": balance
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cuentas Proveedores");
  XLSX.writeFile(wb, "Cuentas_A_Pagar.xlsx");
}

function exportCollectionsToExcel() {
  const clientes = state.currentAccounts.filter(a => a.type === "cliente");
  const data = clientes.map(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
    return {
      Cliente: acc.entityName,
      Teléfono: acc.phone || "",
      Dirección: acc.address || "",
      "Saldo Pendiente ($)": balance
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cobranzas Clientes");
  XLSX.writeFile(wb, "Cobranzas.xlsx");
}

// Account Detail Statement Modal
function openAccountDetailModal(accId) {
  const acc = state.currentAccounts.find(a => a.id === accId);
  if (!acc) return;

  document.getElementById("account-tx-id-input").value = acc.id;
  document.getElementById("modal-account-detail-title").innerText = `Cta. Corriente: ${acc.entityName}`;
  document.getElementById("acc-detail-info").innerText = `${acc.phone || 'Sin Teléfono'} | ${acc.address || 'Sin Dirección'}`;
  
  document.getElementById("tx-description").value = "";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-payment").value = "";

  const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
  document.getElementById("acc-detail-balance").innerText = `$ ${Math.round(balance).toLocaleString()}`;

  // Etiquetas de columnas
  const labelAmt = document.getElementById("tx-amount-label");
  const labelPay = document.getElementById("tx-payment-label");
  const thAmt = document.getElementById("th-tx-amount");
  const thPay = document.getElementById("th-tx-payment");

  if (acc.type === "proveedor") {
    labelAmt.innerText = "Deuda ($)";
    labelPay.innerText = "Pago ($)";
    thAmt.innerText = "Cargado (Deuda)";
    thPay.innerText = "Entregado (Pago)";
    document.getElementById("acc-detail-balance-label").innerText = "Le debemos al proveedor";
    document.getElementById("acc-detail-balance").style.color = "#f87171";
  } else {
    labelAmt.innerText = "Deuda ($)";
    labelPay.innerText = "Pago ($)";
    thAmt.innerText = "Ventas (Deuda)";
    thPay.innerText = "Entregas (Pago)";
    document.getElementById("acc-detail-balance-label").innerText = "Nos debe el cliente";
    document.getElementById("acc-detail-balance").style.color = "#3b82f6";
  }

  // Rellenar transacciones
  const tbody = document.getElementById("account-tx-table-body");
  tbody.innerHTML = "";

  if (!acc.transactions || acc.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray); padding: 20px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
  } else {
    // Ordenar de más reciente a más antiguo
    const sorted = [...acc.transactions].reverse();
    sorted.forEach(tx => {
      const dateStr = new Date(tx.date).toLocaleDateString('es-AR') + " " + new Date(tx.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
        <td style="font-weight: 600;">${tx.description}</td>
        <td style="text-align: right; color: #f87171;">$ ${Math.round(tx.amount).toLocaleString()}</td>
        <td style="text-align: right; color: #10b981;">$ ${Math.round(tx.payment).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Reset form
  document.getElementById("tx-description").value = "";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-payment").value = "";

  document.getElementById("account-detail-modal").className = "modal-backdrop active";
}

function closeAccountDetailModal() {
  document.getElementById("account-detail-modal").className = "modal-backdrop";
}

async function saveAccountTransactionForm(e) {
  e.preventDefault();
  const accId = document.getElementById("account-tx-id-input").value;
  const description = document.getElementById("tx-description").value;
  const amount = parseFloat(document.getElementById("tx-amount").value.replace(/\D/g, "")) || 0;
  const payment = parseFloat(document.getElementById("tx-payment").value.replace(/\D/g, "")) || 0;

  if (amount === 0 && payment === 0) {
    showToast("Ingresá un monto mayor a $0 en deuda o pago.", true);
    return;
  }

  try {
    await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", { description, amount, payment });
    showToast("Transacción registrada");
    refreshState();
    
    // Dejar abierto el modal y refrescar la vista interna
    setTimeout(() => {
      openAccountDetailModal(accId);
    }, 100);
  } catch (error) {
    showToast(error.message, true);
  }
}

// --- 6. CAJA DIARIA ---
function renderCashTransactions() {
  const tbody = document.getElementById("cash-table-body");
  tbody.innerHTML = "";

  // Ordenar transacciones por fecha desc
  const sorted = [...state.cashTransactions].sort((a,b) => new Date(b.date) - new Date(a.date));

  let totalIncome = 0;
  let totalExpense = 0;

  sorted.forEach(tx => {
    const val = parseFloat(tx.amount) || 0;
    if (tx.type === "income") totalIncome += val;
    else totalExpense += val;
  });

  const net = totalIncome - totalExpense;
  const netBadge = document.getElementById("cash-neto-badge");
  netBadge.innerText = `Caja Neta: $ ${Math.round(net).toLocaleString()}`;
  netBadge.className = "badge " + (net >= 0 ? "badge-emerald" : "badge-red");

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay movimientos de caja registrados hoy.</td></tr>`;
    return;
  }

  sorted.forEach(tx => {
    const dateStr = new Date(tx.date).toLocaleDateString('es-AR') + " " + new Date(tx.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const val = parseFloat(tx.amount) || 0;
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
      <td style="font-weight: 600;">${tx.description}</td>
      <td>
        <span class="badge ${tx.type === 'income' ? 'badge-emerald' : 'badge-red'}">
          ${tx.type === 'income' ? 'Ingreso' : 'Egreso'}
        </span>
      </td>
      <td style="text-align: right; font-weight: 700; color: ${tx.type === 'income' ? '#10b981' : '#f87171'};">
        ${tx.type === 'income' ? '+' : '-'} $ ${Math.round(val).toLocaleString()}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openCashTransactionModal() {
  document.getElementById("caja-description").value = "";
  document.getElementById("caja-amount").value = "";
  document.getElementById("cash-tx-modal").className = "modal-backdrop active";
}

function closeCashTransactionModal() {
  document.getElementById("cash-tx-modal").className = "modal-backdrop";
}

async function saveCashTransactionForm(e) {
  e.preventDefault();
  const type = document.getElementById("caja-type").value;
  const description = document.getElementById("caja-description").value;
  const amount = parseFloat(document.getElementById("caja-amount").value.replace(/\D/g, "")) || 0;

  try {
    await apiRequest("/api/cash-transactions", "POST", { type, description, amount });
    showToast("Movimiento de caja guardado");
    closeCashTransactionModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

// --- 7. GASTOS MENSUALES ---
function renderFixedCosts() {
  // Mes seleccionado
  const monthSelect = document.getElementById("costs-month-select");
  state.viewCostsMonth = monthSelect.value;

  const currentMonthCosts = state.fixedCosts.filter(cost => cost.period.includes(state.viewCostsMonth));
  const total = currentMonthCosts.reduce((sum, cost) => sum + (parseFloat(cost.amount) || 0), 0);

  document.getElementById("costs-total-badge").innerText = `Gastos: $ ${Math.round(total).toLocaleString()}`;

  // Rellenar tabla
  const tbody = document.getElementById("fixed-costs-table-body");
  tbody.innerHTML = "";

  if (currentMonthCosts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray); padding: 24px; font-size: 0.75rem;">No hay gastos registrados en ${state.viewCostsMonth}.</td></tr>`;
  } else {
    currentMonthCosts.forEach(cost => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: #fff;">${cost.concept}</div>
          <div style="font-size: 0.65rem; color: var(--text-gray); margin-top: 2px;">📅 ${cost.period}</div>
        </td>
        <td>
          <span class="badge badge-gray">${cost.category}</span>
        </td>
        <td style="text-align: right; font-weight: 700; color: var(--accent-red);">
          - $ ${Math.round(cost.amount).toLocaleString()}
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-delete" style="width:24px; height:24px;" onclick="deleteFixedCost('${cost.id}')">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Renderizar gráfico de dona en Gastos
  renderFixedCostsDonutChart(currentMonthCosts, total);

  // Inicializar grid de categorías en el formulario de registro
  renderFixedCostsCategoryGrid();
}

const GASTOS_CATEGORIES = ['Servicios', 'Personal', 'Impuestos', 'Mantenimiento', 'Deuda', 'Otros'];
const GASTOS_SUBCATEGORIES = {
  Servicios: ['Luz', 'Agua', 'Gas', 'Internet', 'Teléfono', 'Electricidad', 'Alquiler'],
  Personal: ['Sueldos', 'Diseñador'],
  Impuestos: ['Monotributo', 'Ingresos Brutos', 'Tasa Municipal', 'Contador'],
  Mantenimiento: ['Limpieza', 'Reparaciones', 'Art. Oficina'],
  Deuda: ['Préstamo', 'Tarjeta de Crédito', 'Plan de Pago'],
  Otros: ['Varios', 'Seguro', 'Suscripciones']
};

let currentSelectedCategory = 'Servicios';
let currentSelectedConcept = 'Luz';
let currentPeriodType = 'MENSUAL'; // 'MENSUAL', 'QUINCENAL', 'SEMANAL'
let currentQuincena = '1ª';
let currentSemana = '1';

function renderFixedCostsCategoryGrid() {
  const container = document.getElementById("cost-category-grid");
  if (container.children.length > 0) return; // ya inicializado
  
  container.innerHTML = "";
  GASTOS_CATEGORIES.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn " + (cat === currentSelectedCategory ? "btn-primary" : "btn-secondary");
    btn.style.fontSize = "0.75rem";
    btn.style.padding = "8px 10px";
    btn.innerText = cat;
    btn.onclick = () => {
      currentSelectedCategory = cat;
      currentSelectedConcept = GASTOS_SUBCATEGORIES[cat][0];
      
      // Actualizar estilos activos en botones
      document.querySelectorAll("#cost-category-grid button").forEach(b => {
        b.className = "btn " + (b.innerText === cat ? "btn-primary" : "btn-secondary");
      });
      
      renderFixedCostsConceptPills();
    };
    container.appendChild(btn);
  });

  renderFixedCostsConceptPills();
  setPeriodType(currentPeriodType);
}

function renderFixedCostsConceptPills() {
  const container = document.getElementById("cost-concept-pills");
  container.innerHTML = "";

  const subs = GASTOS_SUBCATEGORIES[currentSelectedCategory];
  subs.forEach(sub => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pos-category-btn" + (sub === currentSelectedConcept ? " active" : "");
    btn.innerText = sub;
    btn.onclick = () => {
      currentSelectedConcept = sub;
      document.querySelectorAll("#cost-concept-pills button").forEach(b => {
        b.className = "pos-category-btn" + (b.innerText === sub ? " active" : "");
      });
      updateCostPeriodDisplay();
    };
    container.appendChild(btn);
  });
  
  updateCostPeriodDisplay();
}

function setPeriodType(type) {
  currentPeriodType = type;
  
  // Estilos
  ['mensual', 'quincenal', 'semanal'].forEach(t => {
    const btn = document.getElementById(`period-type-${t}`);
    if (btn) {
      btn.className = "btn " + (t.toUpperCase() === type ? "btn-primary" : "btn-secondary");
    }
  });

  const detailsContainer = document.getElementById("period-details-container");
  detailsContainer.innerHTML = "";

  if (type === "QUINCENAL") {
    detailsContainer.innerHTML = `
      <div class="grid-2">
        <button type="button" class="btn ${currentQuincena==='1ª'?'btn-primary':'btn-secondary'}" id="q-btn-1" style="font-size:0.7rem;" onclick="setQuincena('1ª')">1ª Quincena</button>
        <button type="button" class="btn ${currentQuincena==='2ª'?'btn-primary':'btn-secondary'}" id="q-btn-2" style="font-size:0.7rem;" onclick="setQuincena('2ª')">2ª Quincena</button>
      </div>
    `;
  } else if (type === "SEMANAL") {
    let btns = "";
    ['1','2','3','4','5'].forEach(s => {
      btns += `<button type="button" class="btn ${currentSemana===s?'btn-primary':'btn-secondary'}" id="sem-btn-${s}" style="font-size:0.65rem;" onclick="setSemana('${s}')">Sem ${s}</button>`;
    });
    detailsContainer.innerHTML = `<div class="grid-5">${btns}</div>`;
  }

  updateCostPeriodDisplay();
}

function setQuincena(q) {
  currentQuincena = q;
  document.getElementById("q-btn-1").className = "btn " + (q==='1ª'?'btn-primary':'btn-secondary');
  document.getElementById("q-btn-2").className = "btn " + (q==='2ª'?'btn-primary':'btn-secondary');
  updateCostPeriodDisplay();
}

function setSemana(s) {
  currentSemana = s;
  ['1','2','3','4','5'].forEach(sem => {
    document.getElementById(`sem-btn-${sem}`).className = "btn " + (sem===s?'btn-primary':'btn-secondary');
  });
  updateCostPeriodDisplay();
}

function updateCostPeriodDisplay() {
  const month = document.getElementById("cost-period-month").value;
  let display = month;
  if (currentPeriodType === "QUINCENAL") display = `${currentQuincena} Quincena ${month}`;
  else if (currentPeriodType === "SEMANAL") display = `Semana ${currentSemana} ${month}`;
  
  document.getElementById("cost-period-display").innerText = `${currentSelectedConcept} - ${display}`;
}

async function handleAddExpenseSubmit(e) {
  e.preventDefault();
  const amtInput = document.getElementById("cost-amount-input");
  const rawAmt = amtInput.value.replace(/\D/g, "");
  const amount = parseFloat(rawAmt) || 0;
  
  if (amount <= 0) {
    showToast("El monto debe ser mayor a 0", true);
    return;
  }

  const month = document.getElementById("cost-period-month").value;
  let finalPeriod = month;
  if (currentPeriodType === "QUINCENAL") finalPeriod = `${currentQuincena} Quincena ${month}`;
  else if (currentPeriodType === "SEMANAL") finalPeriod = `Semana ${currentSemana} ${month}`;

  const costPayload = {
    concept: currentSelectedConcept,
    period: finalPeriod,
    category: currentSelectedCategory,
    amount: amount,
    isPaid: false
  };

  try {
    await apiRequest("/api/fixed-costs", "POST", costPayload);
    showToast("Gasto agregado");
    amtInput.value = "";
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderFixedCostsDonutChart(costs, total) {
  const canvas = document.getElementById("canvas-fixed-costs-donut");
  const ctx = canvas.getContext("2d");
  
  // Agrupar totales por categoría
  const categoryTotals = {};
  costs.forEach(c => {
    categoryTotals[c.category] = (categoryTotals[c.category] || 0) + (parseFloat(c.amount) || 0);
  });

  const categories = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);
  
  // Encontrar categoría principal
  const sorted = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1]);
  const topCat = sorted[0] ? sorted[0][0] : "Servicios";

  document.getElementById("donut-top-category-name").innerText = topCat;
  document.getElementById("donut-info-description").innerHTML = `La mayor parte de tus costos fijos provienen de <strong>${topCat}</strong>.`;

  if (state.fixedCostsDonutChart) state.fixedCostsDonutChart.destroy();
  
  if (costs.length === 0) {
    // Dibujar circulo vacío
    state.fixedCostsDonutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ["Sin Gastos"],
        datasets: [{
          data: [1],
          backgroundColor: ["#1e293b"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  state.fixedCostsDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: data,
        backgroundColor: ['#e5383b', '#ca6702', '#0a9396', '#005f73', '#e9d8a6', '#8b5cf6'],
        borderWidth: 1,
        borderColor: '#0f172a'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function deleteFixedCost(cId) {
  showConfirmModal("¿Deseas eliminar este gasto mensual?", async () => {
    try {
      await apiRequest(`/api/fixed-costs/${cId}`, "DELETE");
      showToast("Gasto eliminado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function exportFixedCostsToExcel() {
  const currentMonthCosts = state.fixedCosts.filter(c => c.period.includes(state.viewCostsMonth));
  const formatted = currentMonthCosts.map(c => ({
    Concepto: c.concept,
    Periodo: c.period,
    Categoria: c.category,
    Monto: c.amount,
    Pagado: c.isPaid ? 'SÍ' : 'NO'
  }));

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos Fijos");
  XLSX.writeFile(wb, `Gastos_Mensuales_${state.viewCostsMonth}.xlsx`);
}

function exportStockIntakesToExcel() {
  if (!state.stockIntakes || state.stockIntakes.length === 0) {
    showToast("No hay movimientos de compras para exportar.", true);
    return;
  }
  
  const formatted = state.stockIntakes.map(item => {
    const qtyStr = Object.entries(item.quantities || {})
      .filter(([_, qty]) => qty > 0)
      .map(([size, qty]) => `${qty} un. (${size})`)
      .join(", ");
      
    return {
      Fecha: item.date || "",
      Producto: item.productName || "",
      SKU: item.productSku || "",
      Proveedor: item.supplierName || "",
      Cantidades: qtyStr,
      "Total Cantidad": item.totalQuantity || 0,
      "Costo Unitario": item.unitCost || 0,
      "Costo Total": item.totalCost || 0
    };
  });

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial_Compras");
  XLSX.writeFile(wb, "Historial_Compras.xlsx");
}

function exportCashTransactionsToExcel() {
  if (!state.cashTransactions || state.cashTransactions.length === 0) {
    showToast("No hay movimientos de caja para exportar.", true);
    return;
  }

  const sorted = [...state.cashTransactions].sort((a,b) => new Date(b.date) - new Date(a.date));

  const formatted = sorted.map(tx => {
    const val = parseFloat(tx.amount) || 0;
    const dateObj = new Date(tx.date);
    const dateStr = dateObj.toLocaleDateString('es-AR') + " " + dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return {
      "Fecha y Hora": dateStr,
      Concepto: tx.description || "",
      Tipo: tx.type === "income" ? "Ingreso" : "Egreso",
      Monto: val
    };
  });

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Caja_Diaria");
  XLSX.writeFile(wb, "Movimientos_Caja.xlsx");
}// --- 8. MARKETING ---
function switchMarketingSubTab(subTabId) {
  state.activeMarketingSubTab = subTabId;
  
  document.querySelectorAll("[id^='mkt-pill-']").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`mkt-pill-${subTabId}`);
  if (activeBtn) activeBtn.classList.add("active");
  
  document.querySelectorAll(".mkt-subtab-content").forEach(el => {
    el.style.display = "none";
  });
  const activeContent = document.getElementById(`mkt-${subTabId}-content`);
  if (activeContent) activeContent.style.display = "block";
  
  document.getElementById("btn-mkt-new-delivery").style.display = subTabId === "summary" ? "block" : "none";
  document.getElementById("btn-mkt-new-influencer").style.display = subTabId === "influencers" ? "block" : "none";
  document.getElementById("btn-mkt-new-campaign").style.display = subTabId === "campaigns" ? "block" : "none";
  
  renderMarketing();
}

function renderMarketing() {
  const currentSubTab = state.activeMarketingSubTab || "summary";
  
  if (currentSubTab === "summary") {
    const influencerExpenses = state.marketingExpenses.filter(e => e.type === "influencer");
    const totalInfluencersCost = influencerExpenses.reduce((sum, e) => sum + (parseFloat(e.totalCost) || 0), 0);
    const totalQtyDelivered = influencerExpenses.reduce((sum, e) => sum + (parseInt(e.quantity) || 0), 0);
    
    document.getElementById("mkt-summary-total-influencers").innerText = `$ ${Math.round(totalInfluencersCost).toLocaleString()}`;
    document.getElementById("mkt-summary-products-delivered").innerText = `Productos entregados: ${totalQtyDelivered}`;
    
    const costContainer = document.getElementById("mkt-influencers-cost-chart-container");
    if (influencerExpenses.length === 0) {
      costContainer.innerHTML = "No hay registros de influencers.";
    } else {
      const influencerCosts = {};
      influencerExpenses.forEach(e => {
        influencerCosts[e.influencer] = (influencerCosts[e.influencer] || 0) + (parseFloat(e.totalCost) || 0);
      });
      let listHtml = `<div style="width: 100%; display: flex; flex-direction: column; gap: 8px; max-height: 120px; overflow-y: auto; padding-right: 4px;">`;
      for (const [infName, infCost] of Object.entries(influencerCosts)) {
        listHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
            <span style="font-weight: 700; color: #fff;">${infName}</span>
            <span style="font-weight: 800; color: var(--accent-red);">$ ${Math.round(infCost).toLocaleString()}</span>
          </div>
        `;
      }
      listHtml += `</div>`;
      costContainer.innerHTML = listHtml;
    }
    
    const tbody = document.getElementById("mkt-deliveries-table-body");
    tbody.innerHTML = "";
    if (influencerExpenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-gray); padding: 24px; font-size: 0.75rem;">Aún no se ha entregado ropa a influencers.</td></tr>`;
    } else {
      const sorted = [...influencerExpenses].sort((a,b) => new Date(b.date) - new Date(a.date));
      sorted.forEach(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString('es-AR');
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
          <td style="font-weight: 700; color: #fff;">${exp.influencer}</td>
          <td>${exp.productName} (${exp.size})</td>
          <td style="text-align: center; font-weight: 700;">${exp.quantity}</td>
          <td style="text-align: right; font-weight: 900; color: var(--accent-red);">$ ${Math.round(exp.totalCost).toLocaleString()}</td>
          <td style="text-align: center;">
            <div class="actions-cell" style="display: inline-flex; gap: 6px; justify-content: center; width: 100%;">
              <button class="btn-action" style="width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;" onclick="editMarketingDelivery('${exp.id}')">✏️</button>
              <button class="btn-action btn-delete" style="width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;" onclick="deleteMarketingDelivery('${exp.id}')">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
  
  if (currentSubTab === "influencers") {
    const grid = document.getElementById("mkt-influencers-grid");
    grid.innerHTML = "";
    if (state.influencers.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay influencers registrados.</div>`;
    } else {
      state.influencers.forEach(inf => {
        const card = document.createElement("div");
        card.className = "idx-card";
        card.style.padding = "16px";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="font-size: 0.85rem; font-weight: 800; color: #fff;">${inf.name}</h4>
            <div style="display: flex; gap: 6px;">
              <button class="btn-action" style="width:24px; height:24px; border-color: rgba(255,255,255,0.05);" onclick="editInfluencer('${inf.id}')">✏️</button>
              <button class="btn-action btn-delete" style="width:24px; height:24px; border-color: rgba(255,255,255,0.05);" onclick="deleteInfluencer('${inf.id}')">🗑️</button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <i class="fab fa-instagram" style="color: #e1306c;"></i>
            <a href="https://instagram.com/${inf.instagram}" target="_blank" style="color: #e5383b; text-decoration: none; font-size: 0.8rem; font-weight: 600;">@${inf.instagram}</a>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; color: var(--text-gray); font-size: 0.8rem;">
            <i class="fas fa-phone-alt" style="color: var(--accent-emerald);"></i>
            <span>${inf.phone || "-"}</span>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }
  
  if (currentSubTab === "campaigns") {
    const adExpenses = state.marketingExpenses.filter(e => e.type === "ad");
    const totalAdsCost = adExpenses.reduce((sum, e) => sum + (parseFloat(e.totalCost) || 0), 0);
    
    document.getElementById("mkt-summary-total-ads").innerText = `$ ${Math.round(totalAdsCost).toLocaleString()}`;
    
    const platformContainer = document.getElementById("mkt-platforms-cost-chart-container");
    if (adExpenses.length === 0) {
      platformContainer.innerHTML = "No hay registros de publicidad.";
    } else {
      const platformCosts = {};
      adExpenses.forEach(e => {
        platformCosts[e.platform] = (platformCosts[e.platform] || 0) + (parseFloat(e.totalCost) || 0);
      });
      let listHtml = `<div style="width: 100%; display: flex; flex-direction: column; gap: 8px; max-height: 120px; overflow-y: auto; padding-right: 4px;">`;
      for (const [platform, pCost] of Object.entries(platformCosts)) {
        listHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
            <span style="font-weight: 700; color: #fff;">${platform}</span>
            <span style="font-weight: 800; color: var(--accent-emerald);">$ ${Math.round(pCost).toLocaleString()}</span>
          </div>
        `;
      }
      listHtml += `</div>`;
      platformContainer.innerHTML = listHtml;
    }
    
    const tbody = document.getElementById("mkt-campaigns-table-body");
    tbody.innerHTML = "";
    if (adExpenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray); padding: 24px; font-size: 0.75rem;">Aún no se ha registrado inversión en publicidad.</td></tr>`;
    } else {
      const sorted = [...adExpenses].sort((a,b) => new Date(b.date) - new Date(a.date));
      sorted.forEach(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString('es-AR');
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
          <td style="font-weight: 700; color: #fff;">${exp.platform}</td>
          <td>${exp.campaignName}</td>
          <td style="text-align: right; font-weight: 900; color: var(--accent-red);">$ ${Math.round(exp.totalCost).toLocaleString()}</td>
          <td style="text-align: center;">
            <div class="actions-cell" style="display: inline-flex; gap: 6px; justify-content: center; width: 100%;">
              <button class="btn-action" style="width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;" onclick="editMarketingCampaign('${exp.id}')">✏️</button>
              <button class="btn-action btn-delete" style="width:24px; height:24px; padding:0; display:flex; align-items:center; justify-content:center;" onclick="deleteMarketingCampaign('${exp.id}')">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

function openMarketingDeliveryModal() {
  document.getElementById("modal-delivery-title").innerText = "Registrar Entrega de Ropa";
  document.getElementById("mkt-delivery-id-input").value = "";

  const infSelect = document.getElementById("mkt-delivery-influencer-select");
  infSelect.innerHTML = `<option value="" disabled selected>Seleccione influencer...</option>`;
  state.influencers.forEach(inf => {
    const opt = document.createElement("option");
    opt.value = inf.id;
    opt.innerText = `${inf.name} (@${inf.instagram})`;
    infSelect.appendChild(opt);
  });

  const prodSelect = document.getElementById("mkt-delivery-product-select");
  prodSelect.innerHTML = `<option value="" disabled selected>Seleccione prenda...</option>`;
  const uniqueBases = Array.from(new Map(state.products.filter(p => p.sku && 
                                                                    !p.sku.startsWith("supplier_") && 
                                                                    !p.sku.startsWith("fixedcost_") && 
                                                                    !p.sku.startsWith("account_") && 
                                                                    !p.sku.startsWith("cashtransaction_") && 
                                                                    !p.sku.startsWith("influencer_") && 
                                                                    !p.sku.startsWith("marketingexpense_") && 
                                                                    !p.sku.startsWith("stockintake_") && 
                                                                    p.sku !== "extras_config" && 
                                                                    p.sku !== "categories_config").map(p => [p.baseSku, p])).values());
  
  uniqueBases.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.baseSku;
    opt.innerText = p.name;
    prodSelect.appendChild(opt);
  });

  document.getElementById("mkt-delivery-size-select").innerHTML = `<option value="" disabled selected>${state.businessType === "comercio" ? "Seleccione variante..." : "Seleccione talle..."}</option>`;
  document.getElementById("mkt-delivery-quantity").value = "1";
  document.getElementById("mkt-delivery-modal").className = "modal-backdrop active";
}

function closeMarketingDeliveryModal() {
  document.getElementById("mkt-delivery-modal").className = "modal-backdrop";
}

function updateMarketingDeliverySizes(selectedSku = null) {
  const baseSku = document.getElementById("mkt-delivery-product-select").value;
  const sizeSelect = document.getElementById("mkt-delivery-size-select");
  sizeSelect.innerHTML = "";

  const variants = state.products.filter(p => p.baseSku === baseSku && (p.stock > 0 || p.sku === selectedSku));
  if (variants.length === 0) {
    sizeSelect.innerHTML = `<option value="" disabled selected>Sin stock disponible</option>`;
    return;
  }
  variants.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.sku;
    opt.innerText = state.businessType === "comercio"
      ? `Stock: ${v.stock}`
      : `${v.size} (Stock: ${v.stock})`;
    if (v.sku === selectedSku) {
      opt.selected = true;
    }
    sizeSelect.appendChild(opt);
  });
}

async function handleMarketingDeliverySubmit(e) {
  e.preventDefault();
  const deliveryId = document.getElementById("mkt-delivery-id-input").value;
  const infId = document.getElementById("mkt-delivery-influencer-select").value;
  const sku = document.getElementById("mkt-delivery-size-select").value;
  const qty = parseInt(document.getElementById("mkt-delivery-quantity").value) || 1;

  if (!infId || !sku) {
    showToast(state.businessType === "comercio" ? "Seleccione el influencer y la variante." : "Seleccione el influencer y la variante de talle.", true);
    return;
  }

  const influencer = state.influencers.find(i => i.id === infId);
  const variant = state.products.find(p => p.sku === sku);
  
  const originalDelivery = deliveryId ? state.marketingExpenses.find(ex => ex.id === deliveryId) : null;
  const originalQty = (originalDelivery && originalDelivery.productSku === variant.sku) ? originalDelivery.quantity : 0;
  const availableStock = variant.stock + originalQty;

  if (availableStock < qty) {
    showToast(`Stock insuficiente. Solo quedan ${availableStock} unidades para esta entrega.`, true);
    return;
  }

  const payload = {
    type: "influencer",
    influencer: influencer.name,
    influencerId: infId,
    productSku: sku,
    productName: variant.name,
    size: variant.size,
    quantity: qty,
    unitCost: variant.cost,
    totalCost: variant.cost * qty
  };

  if (deliveryId) {
    payload.id = deliveryId;
    payload.date = originalDelivery ? originalDelivery.date : new Date().toISOString();
  } else {
    payload.date = new Date().toISOString();
  }

  try {
    showToast(deliveryId ? "Guardando cambios..." : "Registrando entrega...");
    await apiRequest("/api/marketing-expenses", "POST", payload);
    showToast(deliveryId ? "Entrega modificada exitosamente" : "Entrega a influencer registrada exitosamente");
    closeMarketingDeliveryModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function editMarketingDelivery(id) {
  const exp = state.marketingExpenses.find(e => e.id === id);
  if (!exp) return;

  const infSelect = document.getElementById("mkt-delivery-influencer-select");
  infSelect.innerHTML = `<option value="" disabled>Seleccione influencer...</option>`;
  state.influencers.forEach(inf => {
    const opt = document.createElement("option");
    opt.value = inf.id;
    opt.innerText = `${inf.name} (@${inf.instagram})`;
    if (inf.id === exp.influencerId || inf.name === exp.influencer) {
      opt.selected = true;
    }
    infSelect.appendChild(opt);
  });

  const prodSelect = document.getElementById("mkt-delivery-product-select");
  prodSelect.innerHTML = `<option value="" disabled>Seleccione prenda...</option>`;
  const uniqueBases = Array.from(new Map(state.products.filter(p => p.sku && 
                                                                    !p.sku.startsWith("supplier_") && 
                                                                    !p.sku.startsWith("fixedcost_") && 
                                                                    !p.sku.startsWith("account_") && 
                                                                    !p.sku.startsWith("cashtransaction_") && 
                                                                    !p.sku.startsWith("influencer_") && 
                                                                    !p.sku.startsWith("marketingexpense_") && 
                                                                    !p.sku.startsWith("stockintake_") && 
                                                                    p.sku !== "extras_config" && 
                                                                    p.sku !== "categories_config").map(p => [p.baseSku, p])).values());
  
  const deliveredVariant = state.products.find(p => p.sku === exp.productSku);
  const selectedBaseSku = deliveredVariant ? deliveredVariant.baseSku : null;

  uniqueBases.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.baseSku;
    opt.innerText = p.name;
    if (p.baseSku === selectedBaseSku) {
      opt.selected = true;
    }
    prodSelect.appendChild(opt);
  });

  // Forzar actualización de talles cargando la variante actual entregada aunque no tenga stock
  updateMarketingDeliverySizes(exp.productSku);

  document.getElementById("mkt-delivery-id-input").value = exp.id;
  document.getElementById("mkt-delivery-quantity").value = exp.quantity;
  document.getElementById("modal-delivery-title").innerText = "Editar Entrega de Ropa";
  document.getElementById("mkt-delivery-modal").className = "modal-backdrop active";
}

function deleteMarketingDelivery(id) {
  showConfirmModal("¿Deseas eliminar este registro de entrega? El stock de la prenda será restaurado.", async () => {
    try {
      await apiRequest(`/api/marketing-expenses/${id}`, "DELETE");
      showToast("Entrega eliminada y stock restaurado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openMarketingCampaignModal() {
  document.getElementById("modal-campaign-title").innerText = "Registrar Gasto Publicitario";
  document.getElementById("mkt-campaign-id-input").value = "";
  document.getElementById("mkt-campaign-name").value = "";
  document.getElementById("mkt-campaign-cost").value = "";
  document.getElementById("mkt-campaign-modal").className = "modal-backdrop active";
}

function closeMarketingCampaignModal() {
  document.getElementById("mkt-campaign-modal").className = "modal-backdrop";
}

async function handleMarketingCampaignSubmit(e) {
  e.preventDefault();
  const campaignId = document.getElementById("mkt-campaign-id-input").value;
  const platform = document.getElementById("mkt-campaign-platform").value;
  const campaignName = document.getElementById("mkt-campaign-name").value.trim();
  const costVal = parseFloat(document.getElementById("mkt-campaign-cost").value.replace(/\D/g, "")) || 0;
  
  if (costVal <= 0 || !campaignName) {
    showToast("Completar todos los campos del gasto publicitario.", true);
    return;
  }

  const originalCampaign = campaignId ? state.marketingExpenses.find(ex => ex.id === campaignId) : null;

  const payload = {
    type: "ad",
    platform: platform,
    campaignName: campaignName,
    totalCost: costVal
  };

  if (campaignId) {
    payload.id = campaignId;
    payload.date = originalCampaign ? originalCampaign.date : new Date().toISOString();
  } else {
    payload.date = new Date().toISOString();
  }

  try {
    showToast(campaignId ? "Guardando cambios..." : "Registrando campaña publicitaria...");
    await apiRequest("/api/marketing-expenses", "POST", payload);
    showToast(campaignId ? "Campaña modificada exitosamente" : "Gasto publicitario registrado exitosamente");
    closeMarketingCampaignModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function editMarketingCampaign(id) {
  const exp = state.marketingExpenses.find(e => e.id === id);
  if (!exp) return;

  document.getElementById("mkt-campaign-id-input").value = exp.id;
  document.getElementById("mkt-campaign-platform").value = exp.platform;
  document.getElementById("mkt-campaign-name").value = exp.campaignName;
  document.getElementById("mkt-campaign-cost").value = Math.round(exp.totalCost).toLocaleString("es-AR");
  document.getElementById("modal-campaign-title").innerText = "Editar Gasto Publicitario";
  document.getElementById("mkt-campaign-modal").className = "modal-backdrop active";
}

function deleteMarketingCampaign(id) {
  showConfirmModal("¿Deseas eliminar este registro de campaña publicitaria?", async () => {
    try {
      await apiRequest(`/api/marketing-expenses/${id}`, "DELETE");
      showToast("Gasto publicitario eliminado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// Influencer Modal
function openInfluencerModal() {
  document.getElementById("inf-id-input").value = "";
  document.getElementById("inf-name").value = "";
  document.getElementById("inf-instagram").value = "";
  document.getElementById("inf-phone").value = "";
  document.getElementById("modal-influencer-title").innerText = "Nuevo Influencer";
  document.getElementById("influencer-modal").className = "modal-backdrop active";
}

function closeInfluencerModal() {
  document.getElementById("influencer-modal").className = "modal-backdrop";
}

async function saveInfluencerForm(e) {
  e.preventDefault();
  const id = document.getElementById("inf-id-input").value;
  const name = document.getElementById("inf-name").value.trim();
  const instagram = document.getElementById("inf-instagram").value.replace("@", "").trim();
  const phone = document.getElementById("inf-phone").value.trim();

  const payload = { name, instagram, phone };
  if (id) {
    payload.id = id;
  }

  try {
    await apiRequest("/api/influencers", "POST", payload);
    showToast(id ? "Influencer modificado" : "Influencer agregado");
    closeInfluencerModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function editInfluencer(id) {
  const inf = state.influencers.find(i => i.id === id);
  if (!inf) return;
  document.getElementById("inf-id-input").value = inf.id;
  document.getElementById("inf-name").value = inf.name;
  document.getElementById("inf-instagram").value = inf.instagram;
  document.getElementById("inf-phone").value = inf.phone || "";
  document.getElementById("modal-influencer-title").innerText = "Editar Influencer";
  document.getElementById("influencer-modal").className = "modal-backdrop active";
}

function deleteInfluencer(id) {
  showConfirmModal("¿Deseas eliminar este influencer?", async () => {
    try {
      await apiRequest(`/api/influencers/${id}`, "DELETE");
      showToast("Influencer eliminado");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// --- 9. CONFIGURACION DE ADICIONALES ---
function renderExtrasConfig() {
  const container = document.getElementById("extras-categories-container");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(state.extras).forEach(catKey => {
    const title = getCategoryTitle(catKey);
    const options = state.extras[catKey] || [];

    const card = document.createElement("div");
    card.className = "idx-card";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.justifyContent = "space-between";

    // 1. Título e Historial
    let optionsHtml = "";
    if (options.length === 0) {
      optionsHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 15px 0;">No hay opciones creadas.</div>`;
    } else {
      options.forEach(opt => {
        optionsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.8rem; font-weight: 700; color: #fff;">${opt.name}</span>
              <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 700; margin-left: 8px;">$${Math.round(opt.cost).toLocaleString('es-AR')}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn-action" style="width:24px; height:24px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border-radius: 4px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); color: #3b82f6;" onclick="editExtraOption('${catKey}', '${opt.id}')">✏️</button>
              <button class="btn-action btn-delete" style="width:24px; height:24px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; border-radius: 4px;" onclick="deleteExtraOption('${catKey}', '${opt.id}')">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    // 2. Formulario Inline
    const deleteCategoryBtn = `
      <button type="button" class="btn btn-secondary" style="margin-top: 15px; width: 100%; border: 1px solid var(--accent-red); color: var(--accent-red); padding: 6px 12px; font-size: 0.75rem;" onclick="deleteExtraCategory('${catKey}')">Eliminar Categoría</button>
    `;

    card.innerHTML = `
      <div>
        <h3 style="font-size: 0.95rem; font-weight: 800; margin-bottom: 20px; color: var(--text-white); display: flex; justify-content: space-between; align-items: center;">
          <span>${title}</span>
        </h3>
        <div style="margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
          ${optionsHtml}
        </div>
      </div>
      <div>
        <form onsubmit="addExtraOption(event, '${catKey}')" style="border-top: 1px solid var(--border-color); padding-top: 15px; display: flex; flex-direction: column; gap: 8px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.65rem;">Nombre de la opción</label>
            <input type="text" id="new-opt-name-${catKey}" class="form-input" style="padding: 6px 10px; font-size: 0.8rem;" placeholder="Ej: Bolsa chica, Bolsa grande" required>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.65rem;">Costo ($)</label>
            <input type="number" id="new-opt-cost-${catKey}" class="form-input" style="padding: 6px 10px; font-size: 0.8rem;" placeholder="0" min="0" required>
          </div>
          <button type="submit" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 4px; width: 100%;">+ Agregar Opción</button>
        </form>
        ${deleteCategoryBtn}
      </div>
    `;

    container.appendChild(card);
  });
}

// --- 10. MODAL DE COSTOS FIJOS EN DASHBOARD ---
function openFixedCostsPanelModal() {
  const modal = document.getElementById("panel-costs-modal");
  const container = document.getElementById("panel-costs-modal-list");
  container.innerHTML = "";

  const currentMonthCosts = state.fixedCosts.filter(c => c.period.includes(state.panelMonth));

  if (currentMonthCosts.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-gray); font-size: 0.8rem;">No hay costos fijos registrados este mes.</div>`;
  } else {
    // Agrupar por categoría
    const categoriesMap = {};
    currentMonthCosts.forEach(c => {
      if (!categoriesMap[c.category]) categoriesMap[c.category] = [];
      categoriesMap[c.category].push(c);
    });

    for (const [cat, costsList] of Object.entries(categoriesMap)) {
      const catBox = document.createElement("div");
      catBox.style.marginBottom = "16px";
      
      let itemsHtml = "";
      costsList.forEach(cost => {
        const isPaid = cost.isPaid;
        itemsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 6px;">
            <div>
              <p style="font-size: 0.8rem; font-weight: 800; color: #fff;">${cost.concept}</p>
              <p style="font-size: 0.7rem; color: var(--text-gray); margin-top: 2px;">$ ${Math.round(cost.amount).toLocaleString()}</p>
            </div>
            <button class="btn ${isPaid ? 'btn-secondary' : 'btn-primary'}" style="padding: 6px 12px; font-size: 0.65rem;" onclick="submitPayFixedCost('${cost.id}')" ${isPaid ? 'disabled' : ''}>
              ${isPaid ? '✓ Pagado' : 'Pagar'}
            </button>
          </div>
        `;
      });

      catBox.innerHTML = `
        <h4 style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-gray); margin-bottom: 8px; letter-spacing: 0.5px;">${cat}</h4>
        ${itemsHtml}
      `;
      container.appendChild(catBox);
    }
  }

  document.getElementById("panel-costs-modal-title").innerText = `Costos Fijos - Mes de ${state.panelMonth}`;
  modal.className = "modal-backdrop active";
}

function closeFixedCostsPanelModal() {
  document.getElementById("panel-costs-modal").className = "modal-backdrop";
}

async function submitPayFixedCost(cId) {
  try {
    showToast("Procesando pago...");
    await apiRequest(`/api/fixed-costs/${cId}/pay`, "POST");
    showToast("Costo marcado como pagado y egresado de caja.");
    closeFixedCostsPanelModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

// --- Navegación y Pestañas ---
function switchTab(tabId) {
  // Desactivar links
  document.querySelectorAll(".menu-item").forEach(el => el.classList.remove("active"));
  // Activar link
  const activeLink = document.querySelector(`.menu-item[data-tab="${tabId}"]`);
  if (activeLink) activeLink.classList.add("active");
  
  // Desactivar contenido
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  // Activar contenido
  document.getElementById(`${tabId}-section`).classList.add("active");
  
  state.activeTab = tabId;
  
  // Acciones secundarias en cambio de tab
  if (tabId === "panel") renderPanel();
  if (tabId === "sales") renderSalesPOS();
  if (tabId === "fixed-costs") renderFixedCosts();
  if (tabId === "marketing") switchMarketingSubTab(state.activeMarketingSubTab || "summary");
}

// --- Asignación de Listeners ---
function setupEventListeners() {
  // Auth
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("register-form").addEventListener("submit", handleRegister);
  
  const resetForm = document.getElementById("reset-password-form");
  if (resetForm) {
    resetForm.addEventListener("submit", handleResetPassword);
  }
  
  // Menu links
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });

  // POS Search focus, etc.
  document.getElementById("pos-search-input").addEventListener("focus", () => {
    document.getElementById("pos-search-input").style.borderColor = "var(--accent-red)";
  });

  // Formulario Producto
  document.getElementById("prod-cost-input").addEventListener("input", recalculateProductPrice);
  document.getElementById("prod-margin").addEventListener("input", recalculateProductPrice);
  
  // Formulario Gastos
  document.getElementById("idx-cost-form").addEventListener("submit", handleAddExpenseSubmit);
  document.getElementById("cost-period-month").addEventListener("change", updateCostPeriodDisplay);
  
  // Formulario Marketing
  document.getElementById("mkt-delivery-form").addEventListener("submit", handleMarketingDeliverySubmit);
  document.getElementById("mkt-campaign-form").addEventListener("submit", handleMarketingCampaignSubmit);



  // Formatear todos los montos de entrada como separadores de miles
  const currencyInputs = [
    "cost-amount-input", "caja-amount", "tx-amount", "tx-payment", "prod-cost-input",
    "mkt-campaign-cost", "ext-est-minorista", "ext-est-mayorista", "ext-pack-chica",
    "ext-pack-mediana", "ext-pack-grande", "ext-bor-basico", "ext-bor-medio", "ext-bor-complejo"
  ];
  
  currencyInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", (e) => {
        const raw = e.target.value.replace(/\D/g, "");
        e.target.value = raw ? parseInt(raw).toLocaleString("es-AR") : "";
      });
    }
  });

  // Click fuera para cerrar dropdown de notificaciones
  window.addEventListener("click", () => {
    const dropdown = document.getElementById("notifications-dropdown");
    if (dropdown) dropdown.classList.remove("active");
  });
  const bellContainer = document.getElementById("bell-container");
  if (bellContainer) {
    bellContainer.addEventListener("click", (e) => e.stopPropagation());
  }
}

// --- Notificaciones ---
function toggleNotifications(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("notifications-dropdown");
  if (dropdown) dropdown.classList.toggle("active");
}

function dismissNotification(type) {
  state.dismissedNotifications[type] = true;
  updateNotifications();
}

function updateNotifications() {
  const badge = document.getElementById("notification-badge");
  const list = document.getElementById("notifications-list");
  if (!list) return;
  list.innerHTML = "";

  const activeAlerts = [];

  // 1. Stock Crítico
  if (!state.dismissedNotifications.stock) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentSales = state.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
    
    const salesByProduct = {};
    recentSales.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          const pSku = item.product.sku;
          salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
        });
      }
    });

    const criticalCount = state.products.filter(p => {
      return p.stock <= getProductMinStock(p, salesByProduct);
    }).length;

    if (criticalCount > 0) {
      activeAlerts.push({
        type: "stock",
        title: "Stock Crítico",
        icon: "fa-solid fa-triangle-exclamation",
        iconClass: "warning",
        text: `Tienes <strong>${criticalCount}</strong> productos en stock crítico que requieren reposición.`
      });
    }
  }

  // 2. Cobranzas Pendientes
  if (!state.dismissedNotifications.cobranzas) {
    const clientes = state.currentAccounts.filter(a => a.type === "cliente");
    const totalCobrar = clientes.reduce((sum, acc) => sum + (acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0), 0);
    if (totalCobrar > 0) {
      activeAlerts.push({
        type: "cobranzas",
        title: "Cobranzas Pendientes",
        icon: "fa-solid fa-coins",
        iconClass: "success",
        text: `Tienes saldo a cobrar a clientes por un total de <strong>$${Math.round(totalCobrar).toLocaleString('es-AR')}</strong>.`
      });
    }
  }

  // 3. Cuentas a Pagar
  if (!state.dismissedNotifications.cuentas) {
    const proveedors = state.currentAccounts.filter(a => a.type === "proveedor");
    const totalPagar = proveedors.reduce((sum, acc) => sum + (acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0), 0);
    if (totalPagar > 0) {
      activeAlerts.push({
        type: "cuentas",
        title: "Cuentas a Pagar",
        icon: "fa-solid fa-file-invoice-dollar",
        iconClass: "info",
        text: `Tienes saldo a pagar a proveedores por un total de <strong>$${Math.round(totalPagar).toLocaleString('es-AR')}</strong>.`
      });
    }
  }

  // Render notifications in dropdown
  if (activeAlerts.length === 0) {
    list.innerHTML = `<div class="no-notifications">No tienes notificaciones pendientes.</div>`;
    if (badge) badge.style.display = "none";
  } else {
    if (badge) badge.style.display = "block";
    activeAlerts.forEach(alert => {
      const item = document.createElement("div");
      item.className = "notification-item";
      item.innerHTML = `
        <div class="notification-icon-wrapper ${alert.iconClass}">
          <i class="${alert.icon}"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${alert.title}</div>
          <div class="notification-text">${alert.text}</div>
        </div>
        <button class="btn-dismiss-notification" onclick="dismissNotification('${alert.type}')" title="Descartar">
          ✕
        </button>
      `;
      list.appendChild(item);
    });
  }
}

// --- DYNAMIC ADICIONALES (EXTRAS) UTILITIES ---

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '_')           // Replace spaces with _
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '_')         // Replace multiple - with single _
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function getCategoryTitle(key) {
  if (key === "estampados") return "Estampados";
  if (key === "packagings") return "Packaging";
  if (key === "bordados") return "Bordados";
  if (key === "bolsas_caramelos") return "Bolsa de caramelos";
  if (key === "envoltorios_regalo") return "Envoltorio de regalo";
  if (key === "adicionales_kiosco") return "Otros adicionales";
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function openNewExtraCategoryModal() {
  document.getElementById("new-extra-category-input").value = "";
  document.getElementById("extra-category-modal").className = "modal-backdrop active";
}

function closeExtraCategoryModal() {
  document.getElementById("extra-category-modal").className = "modal-backdrop";
}

async function submitAddExtraCategory() {
  const input = document.getElementById("new-extra-category-input");
  const name = input.value.trim();
  if (!name) return;

  const key = slugify(name);
  if (!key) return;

  if (state.extras[key]) {
    showToast("Esta categoría ya existe", true);
    return;
  }

  // Agregar la categoría vacía
  state.extras[key] = [];

  try {
    showToast("Creando categoría...");
    await apiRequest("/api/extras", "POST", state.extras);
    showToast("Categoría de adicional creada");
    closeExtraCategoryModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function addExtraOption(e, categoryKey) {
  e.preventDefault();
  const nameInput = document.getElementById(`new-opt-name-${categoryKey}`);
  const costInput = document.getElementById(`new-opt-cost-${categoryKey}`);
  
  const name = nameInput.value.trim();
  const cost = parseFloat(costInput.value) || 0;
  
  if (!name) return;

  // Generar ID único para la opción
  const id = `${categoryKey.slice(0, 3)}-${slugify(name)}`;

  // Validar duplicados
  if (state.extras[categoryKey].some(opt => opt.id === id || opt.name.toLowerCase() === name.toLowerCase())) {
    showToast("Esta opción ya existe en esta categoría", true);
    return;
  }

  // Agregar opción
  state.extras[categoryKey].push({ id, name, cost });

  try {
    showToast("Guardando opción...");
    await apiRequest("/api/extras", "POST", state.extras);
    showToast("Opción agregada con éxito");
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteExtraOption(categoryKey, optionId) {
  showConfirmModal("¿Deseas eliminar esta opción?", async () => {
    state.extras[categoryKey] = state.extras[categoryKey].filter(opt => opt.id !== optionId);
    try {
      showToast("Eliminando opción...");
      await apiRequest("/api/extras", "POST", state.extras);
      showToast("Opción eliminada");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function editExtraOption(categoryKey, optionId) {
  const option = state.extras[categoryKey].find(opt => opt.id === optionId);
  if (!option) return;

  const currentPrice = option.cost;
  const newPriceStr = prompt(`Editar precio para "${option.name}":`, currentPrice);
  if (newPriceStr === null) return; // cancelado
  
  const newPrice = parseFloat(newPriceStr);
  if (isNaN(newPrice) || newPrice < 0) {
    showToast("Precio inválido", true);
    return;
  }

  // Actualizar precio
  option.cost = newPrice;

  try {
    showToast("Actualizando precio...");
    await apiRequest("/api/extras", "POST", state.extras);
    showToast("Precio actualizado con éxito");
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteExtraCategory(categoryKey) {
  showConfirmModal("¿Deseas eliminar por completo esta categoría de adicionales?", async () => {
    delete state.extras[categoryKey];
    try {
      showToast("Eliminando categoría...");
      await apiRequest("/api/extras", "POST", state.extras);
      showToast("Categoría eliminada");
      refreshState();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function logout() {
  handleLogout();
}

async function sendVerificationEmail() {
  try {
    showToast("Enviando correo...");
    const data = await apiRequest("/api/auth/send-verification", "POST");
    showToast("Correo de verificación enviado");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function simulatePayment() {
  try {
    showToast("Procesando pago simulado...");
    const data = await apiRequest("/api/auth/simulate-payment", "POST");
    showToast("¡Pago procesado con éxito!");
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loginWithGoogle() {
  try {
    showToast("Iniciando sesión con Google...");
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    const idToken = await result.user.getIdToken();
    const email = result.user.email;
    
    state.token = idToken;
    state.email = email;
    const bizType = document.getElementById("login-business-type")?.value || "textil";
    state.businessType = bizType;
    localStorage.setItem("gestiosmart_token", idToken);
    localStorage.setItem("gestiosmart_email", email);
    localStorage.setItem("gestiosmart_business_type", bizType);
    
    showToast("¡Sesión iniciada con Google!");
    checkAuth();
  } catch (error) {
    console.error("Google sign in error:", error);
    showToast(error.message || "Error al iniciar sesión con Google", true);
  }
}

