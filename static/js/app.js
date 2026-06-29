// --- Estado Global ---
const state = {
  token: localStorage.getItem("gestiosmart_token"),
  email: localStorage.getItem("gestiosmart_email"),
  businessType: localStorage.getItem("gestiosmart_business_type") || "textil",
  businessName: localStorage.getItem("gestiosmart_business_name") || "",
  userProfile: null,
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
    cuentas: false,
    missing_cost_margin: false
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
  const isComercio = state.businessType === "comercio";
  const instructionsEl = document.getElementById("excel-import-instructions");
  if (instructionsEl) {
    if (isComercio) {
      instructionsEl.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 15px; font-size: 0.8rem; line-height: 1.5; color: var(--text-gray-light);">
          ⚠️ <strong style="color: var(--accent-red);">¡Atención!</strong> Para que el archivo de Excel se lea correctamente, <strong>debe contener exactamente los siguientes encabezados como títulos de tabla</strong> (no importa mayúsculas, minúsculas o tildes, pero sí el contenido literal):
          <div style="background: var(--bg-input); font-family: monospace; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 0.75rem; color: #fff; border: 1px solid var(--border-color); line-height: 1.5; word-break: break-word;">
            <strong>SKU | Producto | Categoría | Variante | Costo Unitario | Margen (%) | Precio de Venta | Stock Actual | Tiempo de Entrega (días) | Stock de seguridad</strong>
          </div>
        </div>
      `;
    } else {
      instructionsEl.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 15px; font-size: 0.8rem; line-height: 1.5; color: var(--text-gray-light);">
          ⚠️ <strong style="color: var(--accent-red);">¡Atención!</strong> Para que el archivo de Excel se lea correctamente, <strong>debe contener exactamente los siguientes encabezados como títulos de tabla</strong> (no importa mayúsculas, minúsculas o tildes, pero sí el contenido literal):
          <div style="background: var(--bg-input); font-family: monospace; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 0.75rem; color: #fff; border: 1px solid var(--border-color); line-height: 1.5; word-break: break-word;">
            <strong>SKU | Producto | Categoría | Talle | Variante | Costo Unitario | Margen (%) | Precio de Venta | Stock Actual | Tiempo de Entrega (días) | Stock de seguridad</strong>
          </div>
        </div>
      `;
    }
  }

  // Limpiar vista previa y resetear input
  document.getElementById("excel-preview-area").style.display = "none";
  document.getElementById("excel-confirm-btn").setAttribute("disabled", "true");
  document.getElementById("excel-import-input").value = "";
  parsedImportProducts = [];

  // Mostrar el modal
  document.getElementById("excel-import-modal").classList.add("active");
}

function closeExcelImportModal() {
  const modal = document.getElementById("excel-import-modal");
  if (modal) modal.classList.remove("active");
  document.getElementById("excel-import-input").value = "";
  parsedImportProducts = [];
}

// --- PDF Remito Import logic ---
let parsedPdfData = null;

async function handlePdfImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== "application/pdf") {
    showToast("Por favor selecciona un archivo PDF.", true);
    event.target.value = '';
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  showToast("Procesando archivo PDF...");
  try {
    const res = await fetch('/api/import-remito', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'X-Business-Type': state.businessType || 'textil'
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Error al procesar el PDF.");
    }
    event.target.value = '';
    openPdfImportModal(data);
  } catch (err) {
    event.target.value = '';
    showToast(err.message, true);
  }
}

function openPdfImportModal(data) {
  parsedPdfData = data;
  
  // Populate supplier select
  const select = document.getElementById("pdf-import-supplier-select");
  select.innerHTML = "";
  
  let matchFound = false;
  state.suppliers.forEach(s => {
    const option = document.createElement("option");
    option.value = s.name;
    option.innerText = s.name;
    if (s.name.toLowerCase() === data.supplierName.toLowerCase()) {
      option.selected = true;
      matchFound = true;
    }
    select.appendChild(option);
  });
  
  if (!matchFound && data.supplierName) {
    const option = document.createElement("option");
    option.value = "__NEW__";
    option.innerText = `➕ Crear nuevo: ${data.supplierName}`;
    option.selected = true;
    select.appendChild(option);
  }
  
  // Pre-fill date
  document.getElementById("pdf-import-date").value = data.date || "";
  
  // Render products
  const prodTbody = document.getElementById("pdf-import-products-tbody");
  prodTbody.innerHTML = "";
  data.products.forEach(p => {
    const tr = document.createElement("tr");
    const total = p.quantity * p.unitCost;
    tr.innerHTML = `
      <td style="font-weight: 700; color: #fff;">${p.name}</td>
      <td>${p.color}</td>
      <td style="text-align: center;"><span class="badge badge-gray">${p.size}</span></td>
      <td style="text-align: right; font-weight: 600;">${p.quantity}</td>
      <td style="text-align: right;">$ ${Math.round(p.unitCost).toLocaleString("es-AR")}</td>
      <td style="text-align: right; font-weight: 700; color: var(--accent-emerald);">$ ${Math.round(total).toLocaleString("es-AR")}</td>
    `;
    prodTbody.appendChild(tr);
  });
  
  // Render extras
  const extrasTbody = document.getElementById("pdf-import-extras-tbody");
  extrasTbody.innerHTML = "";
  const containerDiv = document.getElementById("pdf-import-extras-container-div");
  if (data.extras && data.extras.length > 0) {
    containerDiv.style.display = "block";
    data.extras.forEach(e => {
      const tr = document.createElement("tr");
      const total = e.quantity * e.unitCost;
      tr.innerHTML = `
        <td style="font-weight: 700; color: #fff;">${e.name}</td>
        <td style="text-align: right; font-weight: 600;">${e.quantity}</td>
        <td style="text-align: right;">$ ${Math.round(e.unitCost).toLocaleString("es-AR")}</td>
        <td style="text-align: right; font-weight: 700; color: var(--accent-emerald);">$ ${Math.round(total).toLocaleString("es-AR")}</td>
      `;
      extrasTbody.appendChild(tr);
    });
  } else {
    containerDiv.style.display = "none";
  }
  
  // Calculate total invoice cost
  const prodTotal = data.products.reduce((sum, p) => sum + (p.quantity * p.unitCost), 0);
  const extraTotal = (data.extras || []).reduce((sum, e) => sum + (e.quantity * e.unitCost), 0);
  const totalCost = prodTotal + extraTotal;
  
  state.lastParsedPdfTotal = totalCost;
  
  // Pre-fill payment split
  updatePdfImportPaymentSplit('init');
  
  // Show modal
  document.getElementById("pdf-import-modal").classList.add("active");
}

function closePdfImportModal() {
  document.getElementById("pdf-import-modal").classList.remove("active");
  parsedPdfData = null;
  state.lastParsedPdfTotal = 0;
}

function updatePdfImportPaymentSplit(source = '') {
  const cashValInput = document.getElementById("pdf-import-pay-cash");
  const debtValInput = document.getElementById("pdf-import-pay-debt");
  if (!cashValInput || !debtValInput) return;
  
  const totalCost = state.lastParsedPdfTotal || 0;
  
  if (source === 'init') {
    cashValInput.value = totalCost ? Math.round(totalCost).toLocaleString("es-AR") : "0";
    debtValInput.value = "0";
    document.getElementById("pdf-import-total-label").innerText = `Total Factura: $ ${Math.round(totalCost).toLocaleString("es-AR")}`;
    return;
  }
  
  let cashVal = parseFloat(cashValInput.value.replace(/\D/g, ""));
  let debtVal = parseFloat(debtValInput.value.replace(/\D/g, ""));
  
  if (isNaN(cashVal)) cashVal = 0;
  if (isNaN(debtVal)) debtVal = 0;
  
  if (source === 'debt') {
    if (debtVal < 0) debtVal = 0;
    if (debtVal > totalCost) debtVal = totalCost;
    cashVal = Math.max(0, totalCost - debtVal);
  } else {
    // source === 'cash'
    if (cashVal < 0) cashVal = 0;
    if (cashVal > totalCost) cashVal = totalCost;
    debtVal = Math.max(0, totalCost - cashVal);
  }
  
  cashValInput.value = cashVal ? Math.round(cashVal).toLocaleString("es-AR") : "0";
  debtValInput.value = debtVal ? Math.round(debtVal).toLocaleString("es-AR") : "0";
  document.getElementById("pdf-import-total-label").innerText = `Total Factura: $ ${Math.round(totalCost).toLocaleString("es-AR")}`;
}

async function confirmPdfImport() {
  if (!parsedPdfData) return;
  
  const selectVal = document.getElementById("pdf-import-supplier-select").value;
  const dateVal = document.getElementById("pdf-import-date").value;
  
  if (!selectVal) {
    showToast("Por favor selecciona un proveedor.", true);
    return;
  }
  
  if (!dateVal) {
    showToast("Por favor selecciona una fecha.", true);
    return;
  }
  
  showToast("Importando remito...");
  try {
    // 1. Resolve Supplier
    let supplierName = parsedPdfData.supplierName;
    if (selectVal === "__NEW__") {
      showToast("Creando proveedor...");
      await apiRequest("/api/suppliers", "POST", {
        name: parsedPdfData.supplierName,
        phone: "",
        categories: [],
        products: [],
        address: "",
        description: "Creado automáticamente vía Importador de PDF"
      });
      supplierName = parsedPdfData.supplierName;
    } else {
      supplierName = selectVal;
    }
    
    // 2. Process Products and update stock
    // Group parsed products by name and color
    const groups = {};
    parsedPdfData.products.forEach(p => {
      const key = `${p.name.trim().toLowerCase()}|${p.color.trim().toLowerCase()}`;
      if (!groups[key]) {
        groups[key] = {
          name: p.name,
          color: p.color,
          items: []
        };
      }
      groups[key].items.push(p);
    });
    
    // For each product group, find matching inventory product and build update payload
    for (const key of Object.keys(groups)) {
      const group = groups[key];
      
      const matchingProduct = state.products.find(p => 
        p.name.trim().toLowerCase() === group.name.trim().toLowerCase() &&
        (p.color || '').trim().toLowerCase() === group.color.trim().toLowerCase()
      );
      
      if (!matchingProduct) {
        throw new Error(`El producto "${group.name} (${group.color})" no existe en tu inventario. Cárgalo primero en la pestaña de Inventario.`);
      }
      
      const baseSku = matchingProduct.baseSku || 
        (matchingProduct.sku.includes('-') && ['XS','S','M','L','XL','XXL','U'].includes(matchingProduct.sku.split('-').pop()) 
          ? matchingProduct.sku.split('-').slice(0, -1).join('-') 
          : matchingProduct.sku);
          
      const batchPayload = [];
      const quantitiesMap = {
        'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, 'XXL': 0, 'Único': 0
      };
      
      let totalQty = 0;
      let unitCost = 0;
      
      group.items.forEach(item => {
        quantitiesMap[item.size] = item.quantity;
        totalQty += item.quantity;
        unitCost = item.unitCost; // Use parsed materia prima price
      });
      
      // Update each size variant
      const sizesToUpdate = Object.entries(quantitiesMap).filter(([_, qty]) => qty > 0);
      for (const [size, qty] of sizesToUpdate) {
        let existing = state.products.find(p => 
          (p.baseSku === baseSku || p.sku.startsWith(baseSku)) && 
          p.size === size
        );
        
        if (existing) {
          const updatedVariant = {
            ...existing,
            stock: (existing.stock || 0) + qty,
            baseCost: unitCost,
            margin: existing.margin || 0,
            cost: unitCost + (parseFloat(existing.cost || 0) - parseFloat(existing.baseCost || 0)), // Maintain existing extras cost if any
            sku: existing.sku
          };
          batchPayload.push(updatedVariant);
        } else {
          const sizeSkuSuffix = size === 'Único' ? 'U' : size;
          const newVariant = {
            id: Date.now() + Math.random(),
            baseSku: baseSku,
            sku: `${baseSku}-${sizeSkuSuffix}`,
            name: matchingProduct.name,
            category: matchingProduct.category,
            size: size,
            color: matchingProduct.color || 'Único',
            stock: qty,
            baseCost: unitCost,
            margin: matchingProduct.margin || 0,
            cost: unitCost
          };
          batchPayload.push(newVariant);
        }
      }
      
      // Save updates to Firestore
      await apiRequest("/api/products", "POST", batchPayload);
      
      // Save stock intake record for product
      const intakePayload = {
        productSku: baseSku,
        productName: matchingProduct.name,
        supplierName: supplierName,
        quantities: quantitiesMap,
        totalQuantity: totalQty,
        unitCost: unitCost,
        totalCost: unitCost * totalQty,
        materiaPrima: unitCost,
        adicionales: 0,
        date: dateVal,
        timestamp: Date.now()
      };
      await apiRequest("/api/stock-intakes", "POST", intakePayload);
    }
    
    // 3. Process Extras and update extras stock
    if (parsedPdfData.extras && parsedPdfData.extras.length > 0) {
      for (const extra of parsedPdfData.extras) {
        let extraCategory = "packagings";
        if (!state.extras[extraCategory]) {
          extraCategory = Object.keys(state.extras)[0] || "packagings";
        }
        if (!state.extras[extraCategory]) {
          state.extras[extraCategory] = [];
        }
        
        let option = state.extras[extraCategory].find(o => o.name.toLowerCase() === extra.name.toLowerCase());
        if (!option) {
          option = {
            id: "extra_" + Date.now() + "_" + Math.floor(Math.random()*1000),
            name: extra.name,
            cost: extra.unitCost,
            stock: extra.quantity
          };
          state.extras[extraCategory].push(option);
        } else {
          option.stock = (option.stock || 0) + extra.quantity;
          option.cost = extra.unitCost;
        }
        
        // Save dynamic extras configuration
        await apiRequest("/api/extras", "POST", state.extras);
        
        // Save stock intake record for extra
        const extraIntakePayload = {
          productSku: option.id,
          productName: `Adicional: ${option.name}`,
          supplierName: supplierName,
          quantities: { 'Único': extra.quantity },
          totalQuantity: extra.quantity,
          unitCost: extra.unitCost,
          totalCost: extra.unitCost * extra.quantity,
          materiaPrima: 0,
          adicionales: 0,
          date: dateVal,
          timestamp: Date.now(),
          isExtra: true
        };
        await apiRequest("/api/stock-intakes", "POST", extraIntakePayload);
      }
    }
    
    // 4. Save Caja egreso / Cuentas a Pagar debt
    const cashAmount = parseFloat(document.getElementById("pdf-import-pay-cash").value.replace(/\D/g, "")) || 0;
    const debtAmount = parseFloat(document.getElementById("pdf-import-pay-debt").value.replace(/\D/g, "")) || 0;
    
    if (cashAmount > 0) {
      const cajaPayload = {
        description: `Compra de mercadería (Efectivo PDF) - ${supplierName}`,
        type: "expense",
        amount: cashAmount,
        date: dateVal + "T12:00:00.000Z"
      };
      await apiRequest("/api/cash-transactions", "POST", cajaPayload);
    }
    
    if (debtAmount > 0) {
      const supplierAccount = state.currentAccounts.find(a => a.type === "proveedor" && a.entityName.toLowerCase() === supplierName.toLowerCase());
      let accId = supplierAccount ? supplierAccount.id : null;
      if (!accId) {
        const newAcc = await apiRequest("/api/current-accounts", "POST", {
          entityName: supplierName,
          type: "proveedor",
          phone: "",
          address: ""
        });
        accId = newAcc.id;
      }
      await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", {
        description: `Compra de mercadería (A pagar PDF)`,
        amount: debtAmount,
        payment: 0,
        date: dateVal + "T12:00:00.000Z"
      });
    }
    
    showToast("¡Remito importado y stock actualizado con éxito!");
    closePdfImportModal();
    await refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function downloadExcelTemplate() {
  const isComercio = state.businessType === "comercio";
  const headers = isComercio 
    ? [["SKU", "Producto", "Categoría", "Variante", "Costo Unitario", "Margen (%)", "Precio de Venta", "Stock Actual", "Tiempo de Entrega (días)", "Stock de seguridad"]]
    : [["SKU", "Producto", "Categoría", "Talle", "Variante", "Costo Unitario", "Margen (%)", "Precio de Venta", "Stock Actual", "Tiempo de Entrega (días)", "Stock de seguridad"]];
  const sampleData = isComercio
    ? [
        ["PROD-001", "Coca Cola 1.5L", "Bebidas", "Único", "1200", "50", "1800", "24", "15", "5"],
        ["PROD-002", "Alfajor de Chocolate", "Kiosco", "Único", "400", "62.5", "650", "50", "15", "5"],
        ["PROD-003", "Yerba Mate 1Kg", "Almacén", "Único", "2500", "40", "3500", "30", "10", "8"],
        ["PROD-004", "Galletitas Dulces", "Almacén", "Único", "800", "50", "1200", "60", "10", "12"]
      ]
    : [
        ["REM-NEGRA-M", "Remera Algodón Negra", "Remeras", "M", "Negro", "3000", "100", "6000", "15", "5"],
        ["REM-NEGRA-S", "Remera Algodón Negra", "Remeras", "S", "Negro", "3000", "100", "6000", "15", "3"],
        ["JEAN-AZUL-42", "Pantalón Jean Azul", "Pantalones", "42", "Azul", "8000", "80", "14400", "20", "15", "4"],
        ["BUZO-GRIS-L", "Buzo Canguro Gris", "Abrigos", "L", "Gris Melange", "12000", "90", "22800", "8", "20", "2"]
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

  function normalizeHeader(str) {
    if (!str) return "";
    return str.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const firstSheetRow = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
      if (!firstSheetRow || firstSheetRow.length === 0) {
        showToast("El archivo de Excel no contiene encabezados.", true);
        return;
      }
      
      const normalizedSheetHeaders = firstSheetRow.map(h => normalizeHeader(h));
      const requiredHeadersTextil = [
        "sku",
        "producto",
        "categoria",
        "talle",
        "variante",
        "costo unitario",
        "margen (%)",
        "precio de venta",
        "stock actual",
        "tiempo de entrega (dias)",
        "stock de seguridad"
      ];
      const requiredHeadersComercio = [
        "sku",
        "producto",
        "categoria",
        "variante",
        "costo unitario",
        "margen (%)",
        "precio de venta",
        "stock actual",
        "tiempo de entrega (dias)",
        "stock de seguridad"
      ];
      
      const required = state.businessType === "comercio" ? requiredHeadersComercio : requiredHeadersTextil;
      const missingHeaders = required.filter(h => !normalizedSheetHeaders.includes(h));
      
      if (missingHeaders.length > 0) {
        const headerFriendlyMap = {
          "sku": "SKU",
          "producto": "Producto",
          "categoria": "Categoría",
          "talle": "Talle",
          "variante": "Variante",
          "costo unitario": "Costo Unitario",
          "margen (%)": "Margen (%)",
          "precio de venta": "Precio de Venta",
          "stock actual": "Stock Actual",
          "tiempo de entrega (dias)": "Tiempo de Entrega (días)",
          "stock de seguridad": "Stock de seguridad"
        };
        const missingFriendly = missingHeaders.map(h => headerFriendlyMap[h] || h);
        showToast(`El archivo no se puede leer. Faltan columnas: ${missingFriendly.join(", ")}`, true);
        return;
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      if (rows.length === 0) {
        showToast("El archivo de Excel está vacío.", true);
        return;
      }
      
      parsedImportProducts = [];
      
      const existingSkus = new Set(
        state.products
          .filter(p => p.sku)
          .map(p => p.sku.toLowerCase().trim())
      );
      const existingNames = new Set(
        state.products
          .filter(p => p.name)
          .map(p => cleanCompareText(p.name))
      );
      const importedSkusInBatch = new Set();
      let omittedCount = 0;
      
      rows.forEach(row => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          cleanRow[normalizeHeader(key)] = row[key];
        });
        
        const sku = String(cleanRow["sku"] || "").trim();
        const name = String(cleanRow["producto"] || "").trim();
        const category = String(cleanRow["categoria"] || "General").trim();
        
        const costStr = String(cleanRow["costo unitario"] || "");
        const cost = costStr !== "" ? (parseFloat(costStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0) : 0.0;
        
        const priceStr = String(cleanRow["precio de venta"] || "");
        const price = priceStr !== "" ? (parseFloat(priceStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0) : 0.0;
        
        const stockStr = String(cleanRow["stock actual"] || "");
        const stock = stockStr !== "" ? (parseInt(stockStr.replace(/[^0-9]/g, "")) || 0) : 0;
        
        let size = String(cleanRow["talle"] || "").trim();
        let color = String(cleanRow["variante"] || "").trim();
        
        const marginStr = String(cleanRow["margen (%)"] || "").trim();
        const hasPercentSign = marginStr.includes("%");
        let margin = parseFloat(marginStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        if (hasPercentSign) {
          // Si tiene %, es el valor directo (ej: 50% -> 50)
        } else if (margin > 0 && margin <= 1.0) {
          // Si vino como 0.5 (fracción de excel), multiplicamos por 100
          margin = margin * 100;
        }
        
        if (price > 0 && cost > 0 && !marginStr) {
          margin = ((price / cost) - 1) * 100;
        }

        const deliveryTimeStr = String(cleanRow["tiempo de entrega (dias)"] || "").trim();
        const leadTime = (deliveryTimeStr !== "") ? parseInt(deliveryTimeStr.replace(/[^0-9]/g, "")) : "";

        const securityStockStr = String(cleanRow["stock de seguridad"] || "").trim();
        const securityStock = (securityStockStr !== "") ? parseInt(securityStockStr.replace(/[^0-9]/g, "")) : "";
        
        let skuVal = sku;
        if (state.businessType === "comercio") {
          size = "Único";
          if (skuVal && !skuVal.endsWith("-U")) {
            skuVal = `${skuVal}-U`;
          }
        }
        
        if (skuVal && name) {
          const skuLower = skuVal.toLowerCase().trim();
          const nameClean = cleanCompareText(name);
          
          if (existingSkus.has(skuLower) || existingNames.has(nameClean)) {
            omittedCount++;
            return;
          }
          if (importedSkusInBatch.has(skuLower)) {
            omittedCount++;
            return;
          }
          
          importedSkusInBatch.add(skuLower);
          
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
            leadTime: leadTime,
            securityStock: securityStock,
            extras: {}
          });
        }
      });
      
      if (parsedImportProducts.length === 0) {
        showToast("No se encontraron productos válidos o nuevos para importar.", true);
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
      
      let summaryText = `Total de productos detectados para importar: ${parsedImportProducts.length} variante(s).`;
      if (omittedCount > 0) {
        summaryText += ` (${omittedCount} omitido(s) por SKU o Nombre ya existente).`;
      }
      document.getElementById("excel-import-summary").innerText = summaryText;
      document.getElementById("excel-preview-area").style.display = "block";
      document.getElementById("excel-confirm-btn").removeAttribute("disabled");
      
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
    // 1. Identificar y registrar nuevas categorías
    const existingCatsClean = state.categories.map(c => cleanCompareText(c));
    const newCategoriesToRegister = [];
    
    parsedImportProducts.forEach(p => {
      if (p.category) {
        const catClean = cleanCompareText(p.category);
        if (!existingCatsClean.includes(catClean)) {
          const alreadyAddedClean = newCategoriesToRegister.map(c => cleanCompareText(c));
          if (!alreadyAddedClean.includes(catClean)) {
            newCategoriesToRegister.push(p.category);
          }
        }
      }
    });
    
    if (newCategoriesToRegister.length > 0) {
      showToast(`Registrando ${newCategoriesToRegister.length} nueva(s) categoría(s)...`);
      const updatedCategories = [...state.categories, ...newCategoriesToRegister];
      await apiRequest("/api/categories", "POST", { categories: updatedCategories });
      state.categories = updatedCategories;
    }
    
    // 2. Importar productos en lotes
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
    state.products = (data.products || []).map(p => {
      if (p.size) {
        p.size = normalizeSize(p.size);
      }
      return p;
    });
    state.sales = data.sales || [];
    state.suppliers = data.suppliers || [];
    state.currentAccounts = data.currentAccounts || [];
    state.fixedCosts = data.fixedCosts || [];
    state.cashTransactions = data.cashTransactions || [];
    state.influencers = data.influencers || [];
    state.marketingExpenses = data.marketingExpenses || [];
    state.extras = data.extras || {};
    state.stockIntakes = data.stockIntakes || [];
    
    state.businessName = data.businessName || "";
    state.userProfile = data.userProfile || null;
    localStorage.setItem("gestiosmart_business_name", state.businessName);
    
    let bizType = data.businessType || localStorage.getItem("gestiosmart_business_type") || "textil";
    if (bizType === "clothing") bizType = "textil";
    if (bizType === "kiosk") bizType = "comercio";
    state.businessType = bizType;
    
    applyBusinessTypeUIUpdates();
    await syncSuppliersWithCurrentAccounts();
    await renderIntegrationsStatus();
    
    document.querySelectorAll(".menu-list .menu-item").forEach(item => {
      if (item.id === "sidebar-tiendanube-item") {
        if (state.email === "matiascuchettidiaz@gmail.com") {
          item.style.display = "block";
        } else {
          item.style.display = "none";
        }
      } else if (item.id === "sidebar-arca-item") {
        if (state.email === "klejavalentino@gmail.com" || state.email === "matiascuchettidiaz@gmail.com") {
          item.style.display = "block";
        } else {
          item.style.display = "none";
        }
      } else {
        item.style.display = "block";
      }
    });
  } catch (error) {
    console.error("Error loading states:", error);
    showToast("Error al sincronizar con la base de datos", true);
  } finally {
    // Inicializar formulario de ingreso de stock cada vez que se refresca el estado
    setupStockIntakeForm();
    checkBusinessNameSetup();
    renderAll();
  }
}

async function syncSuppliersWithCurrentAccounts() {
  if (!state.token) return;
  const suppliers = state.suppliers || [];
  const currentAccounts = state.currentAccounts || [];
  let hasChanges = false;
  
  // 1. Sincronizar de Proveedores a Cuentas a Pagar (Crear faltantes)
  for (const s of suppliers) {
    const exists = currentAccounts.some(acc => acc.type === "proveedor" && acc.entityName.toLowerCase() === s.name.toLowerCase());
    if (!exists) {
      const payload = {
        entityName: s.name,
        type: "proveedor",
        phone: s.phone || "",
        address: s.address || ""
      };
      try {
        console.log(`Sincronizando proveedor "${s.name}" a Cuentas a Pagar...`);
        await apiRequest("/api/current-accounts", "POST", payload);
        hasChanges = true;
      } catch (err) {
        console.error(`Error al sincronizar proveedor "${s.name}":`, err);
      }
    }
  }
  
  // 2. Eliminar cuentas corrientes de tipo "proveedor" que ya no existan en el directorio de proveedores
  const supplierNamesLower = suppliers.map(s => s.name.toLowerCase());
  for (const acc of currentAccounts) {
    if (acc.type === "proveedor") {
      const existsInSuppliers = supplierNamesLower.includes(acc.entityName.toLowerCase());
      if (!existsInSuppliers) {
        try {
          console.log(`Eliminando cuenta corriente del proveedor eliminado "${acc.entityName}"...`);
          await apiRequest(`/api/current-accounts/${acc.id}`, "DELETE");
          hasChanges = true;
        } catch (err) {
          console.error(`Error al eliminar cuenta corriente huérfana "${acc.entityName}":`, err);
        }
      }
    }
  }
  
  if (hasChanges) {
    try {
      const response = await apiRequest("/api/current-accounts", "GET");
      if (response) {
        state.currentAccounts = response;
      }
    } catch (e) {
      console.error("Failed to reload current accounts after sync", e);
    }
  }
}

function populateMonthSelectors() {
  const panelSel = document.getElementById("panel-month-select");
  const costSel = document.getElementById("costs-month-select");
  const periodMonthSel = document.getElementById("cost-period-month");
  const tnMonthSel = document.getElementById("tiendanube-month-select");
  
  [panelSel, costSel, periodMonthSel, tnMonthSel].forEach(select => {
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
  if (tnMonthSel) {
    if (!state.tiendanubeMonth) {
      state.tiendanubeMonth = state.panelMonth;
    }
    tnMonthSel.value = state.tiendanubeMonth;
  }
  const tnYearSel = document.getElementById("tiendanube-year-select");
  if (tnYearSel) {
    if (!state.tiendanubeYear) {
      state.tiendanubeYear = new Date().getFullYear().toString();
    }
    tnYearSel.value = state.tiendanubeYear;
  }
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
      const p = item.product || {};
      const extrasObj = p.extras || {};
      let itemExtraCost = 0;
      if (sale.extras) {
        Object.keys(sale.extras).forEach(catKey => {
          const extraId = sale.extras[catKey];
          if (extraId && extraId !== "0") {
            let hasStatic = false;
            if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
            else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
            else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

            if (!hasStatic) {
              const list = state.extras[catKey] || [];
              const found = list.find(o => o.id === extraId);
              if (found) {
                itemExtraCost += parseFloat(found.cost) || 0;
              }
            }
          }
        });
      }
      const itemCost = (parseFloat(p.cost) || 0) + itemExtraCost;
      return itemSum + (itemCost * (parseInt(item.quantity) || 0));
    }, 0) : 0;
    const saleRevenue = sale.total_neto !== undefined ? parseFloat(sale.total_neto) : sale.total;
    return sum + (saleRevenue - saleCost);
  }, 0);

  // Costos Fijos Mensuales del mes actual (Gastos Fijos)
  const currentMonthCosts = state.fixedCosts.filter(c => c.period.includes(state.panelMonth));
  const totalCosts = currentMonthCosts.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  // Resultado Neto: Operativo - Costos Fijos
  const netResult = totalOperativo - totalCosts;

  // Facturación Neta (restando comisiones de Tiendanube)
  const totalSalesNetValue = filteredSales.reduce((sum, s) => sum + (s.total_neto !== undefined ? parseFloat(s.total_neto) : s.total || 0), 0);

  // Actualizar KPIs en el HTML
  const revDesc = document.getElementById("panel-stat-revenue-desc");
  if (state.email === "matiascuchettidiaz@gmail.com") {
    document.getElementById("panel-stat-revenue").innerHTML = `
      <div style="font-size: 1.3rem; color: #fff;">$ ${Math.round(totalSalesValue).toLocaleString()}</div>
    `;
    if (revDesc) {
      revDesc.style.display = "block";
      revDesc.innerText = "Facturación Total";
    }
  } else {
    document.getElementById("panel-stat-revenue").innerText = `$ ${Math.round(totalSalesValue).toLocaleString()}`;
    if (revDesc) {
      revDesc.style.display = "block";
      revDesc.innerText = "Facturación Total";
    }
  }
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

  // Calcular desglose de canales (Local vs Tiendanube)
  let localRevenue = 0;
  let localUnits = 0;
  let localCost = 0;

  let tnRevenueGross = 0;
  let tnUnits = 0;
  let tnCost = 0;
  let tnFees = 0;
  let tnRevenueNet = 0;

  filteredSales.forEach(sale => {
    const origin = sale.origen || "local";
    
    // Calcular costo de la venta
    const saleCost = sale.items ? sale.items.reduce((itemSum, item) => {
      const p = item.product || {};
      const extrasObj = p.extras || {};
      let itemExtraCost = 0;
      if (sale.extras) {
        Object.keys(sale.extras).forEach(catKey => {
          const extraId = sale.extras[catKey];
          if (extraId && extraId !== "0") {
            let hasStatic = false;
            if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
            else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
            else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

            if (!hasStatic) {
              const list = state.extras[catKey] || [];
              const found = list.find(o => o.id === extraId);
              if (found) {
                itemExtraCost += parseFloat(found.cost) || 0;
              }
            }
          }
        });
      }
      const itemCost = (parseFloat(p.cost) || 0) + itemExtraCost;
      return itemSum + (itemCost * (parseInt(item.quantity) || 0));
    }, 0) : 0;

    const unitsSold = sale.items ? sale.items.reduce((itemSum, item) => itemSum + (parseInt(item.quantity) || 0), 0) : 0;

    if (origin === "tiendanube") {
      tnRevenueGross += (sale.total || 0);
      tnUnits += unitsSold;
      tnCost += saleCost;
      
      const fixedFee = sale.fee_fijo_tn !== undefined ? parseFloat(sale.fee_fijo_tn) : 300;
      const pctFee = sale.comision_pasarela_pago !== undefined ? parseFloat(sale.comision_pasarela_pago) : 5;
      const saleFees = fixedFee + (pctFee / 100 * (sale.total || 0));
      tnFees += saleFees;
      tnRevenueNet += (sale.total_neto !== undefined ? parseFloat(sale.total_neto) : (sale.total - saleFees));
    } else {
      localRevenue += (sale.total || 0);
      localUnits += unitsSold;
      localCost += saleCost;
    }
  });

  const localProfit = localRevenue - localCost;
  const tnProfit = tnRevenueNet - tnCost;

  // Actualizar elementos en el DOM
  const channelsBreakdownDiv = document.getElementById("dashboard-channels-breakdown");
  if (channelsBreakdownDiv) {
    if (state.email === "matiascuchettidiaz@gmail.com") {
      channelsBreakdownDiv.style.display = "block";
      
      const localRevEl = document.getElementById("channel-local-revenue");
      if (localRevEl) localRevEl.innerText = `$ ${Math.round(localRevenue).toLocaleString()}`;
      
      const localUnitsEl = document.getElementById("channel-local-units");
      if (localUnitsEl) localUnitsEl.innerText = `${localUnits} u.`;
      
      const localCostEl = document.getElementById("channel-local-cost");
      if (localCostEl) localCostEl.innerText = `$ ${Math.round(localCost).toLocaleString()}`;
      
      const localProfitEl = document.getElementById("channel-local-profit");
      if (localProfitEl) localProfitEl.innerText = `$ ${Math.round(localProfit).toLocaleString()}`;

      const tnRevEl = document.getElementById("channel-tn-revenue-gross");
      if (tnRevEl) tnRevEl.innerText = `$ ${Math.round(tnRevenueGross).toLocaleString()}`;
      
      const tnUnitsEl = document.getElementById("channel-tn-units");
      if (tnUnitsEl) tnUnitsEl.innerText = `${tnUnits} u.`;
      
      const tnFeesEl = document.getElementById("channel-tn-fees");
      if (tnFeesEl) tnFeesEl.innerText = `$ ${Math.round(tnFees).toLocaleString()}`;
      
      const tnProfitEl = document.getElementById("channel-tn-profit");
      if (tnProfitEl) tnProfitEl.innerText = `$ ${Math.round(tnProfit).toLocaleString()}`;
    } else {
      channelsBreakdownDiv.style.display = "none";
    }
  }

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
        const p = item.product || {};
        const extrasObj = p.extras || {};
        let itemExtraCost = 0;
        if (sale.extras) {
          Object.keys(sale.extras).forEach(catKey => {
            const extraId = sale.extras[catKey];
            if (extraId && extraId !== "0") {
              let hasStatic = false;
              if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
              else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
              else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

              if (!hasStatic) {
                const list = state.extras[catKey] || [];
                const found = list.find(o => o.id === extraId);
                if (found) {
                  itemExtraCost += parseFloat(found.cost) || 0;
                }
              }
            }
          });
        }

        const cost = (parseFloat(p.cost) || 0) + itemExtraCost;
        const margin = parseFloat(p.margin) || 0;
        const price = cost * (1 + margin / 100);
        
        const units = parseInt(item.quantity) || 0;
        const ventasT = price * units;
        const costoO = cost * units;
        const resultadoOp = ventasT - costoO;
        
        panelData.push({
          "Tiempo": formatExcelDate(sale.date),
          "Producto": p.name,
          "Variante": `${p.color || "Único"} - ${item.size}`,
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
      const price = parseFloat(ref.price_local) || parseFloat(ref.price) || (cost * (1 + margin / 100));

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
  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  
  if (existingIndex > -1) {
    const currentQty = state.cart[existingIndex].quantity;
    if (origin === "local") {
      const stockLocalVal = variant.stock_local !== undefined ? variant.stock_local : variant.stock;
      if (currentQty + 1 > stockLocalVal) {
        showToast(`Solo quedan ${stockLocalVal} unidades en el stock local.`, true);
        return;
      }
    } else if (origin === "tiendanube") {
      const stockTallerVal = variant.stock_taller;
      if (stockTallerVal !== "infinito" && stockTallerVal !== "" && stockTallerVal !== undefined) {
        const tVal = parseInt(stockTallerVal) || 0;
        if (currentQty + 1 > tVal) {
          showToast(`Solo quedan ${tVal} unidades en el taller.`, true);
          return;
        }
      }
    }
    state.cart[existingIndex].quantity += 1;
  } else {
    if (origin === "local") {
      const stockLocalVal = variant.stock_local !== undefined ? variant.stock_local : variant.stock;
      if (stockLocalVal < 1) {
        showToast("No hay stock local disponible para este producto.", true);
        return;
      }
    } else if (origin === "tiendanube") {
      const stockTallerVal = variant.stock_taller;
      if (stockTallerVal !== "infinito" && stockTallerVal !== "" && stockTallerVal !== undefined) {
        const tVal = parseInt(stockTallerVal) || 0;
        if (tVal < 1) {
          showToast("No hay stock en el taller para este producto.", true);
          return;
        }
      }
    }
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
  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  
  if (newQty < 1) {
    state.cart.splice(idx, 1);
  } else {
    if (origin === "local") {
      const stockLocalVal = item.product.stock_local !== undefined ? item.product.stock_local : item.product.stock;
      if (newQty > stockLocalVal) {
        showToast(`Solo quedan ${stockLocalVal} unidades en el stock local.`, true);
        return;
      }
    } else if (origin === "tiendanube") {
      const stockTallerVal = item.product.stock_taller;
      if (stockTallerVal !== "infinito" && stockTallerVal !== "" && stockTallerVal !== undefined) {
        const tVal = parseInt(stockTallerVal) || 0;
        if (newQty > tVal) {
          showToast(`Solo quedan ${tVal} unidades en el taller.`, true);
          return;
        }
      }
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
  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  
  if (origin === "local") {
    const stockLocalVal = item.product.stock_local !== undefined ? item.product.stock_local : item.product.stock;
    if (newQty > stockLocalVal) {
      showToast(`Solo quedan ${stockLocalVal} unidades en el stock local.`, true);
      item.quantity = stockLocalVal;
    } else {
      item.quantity = newQty;
    }
  } else if (origin === "tiendanube") {
    const stockTallerVal = item.product.stock_taller;
    if (stockTallerVal !== "infinito" && stockTallerVal !== "" && stockTallerVal !== undefined) {
      const tVal = parseInt(stockTallerVal) || 0;
      if (newQty > tVal) {
        showToast(`Solo quedan ${tVal} unidades en el taller.`, true);
        item.quantity = tVal;
      } else {
        item.quantity = newQty;
      }
    } else {
      item.quantity = newQty;
    }
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

  // Renderizar o actualizar los selectores de adicionales del pedido
  renderPOSCartExtras();

  if (state.cart.length === 0) {
    container.innerHTML = `<div class="pos-cart-empty"><p>El carrito está vacío</p></div>`;
    const totalValEl = document.getElementById("pos-cart-total-val");
    if (totalValEl) {
      totalValEl.innerText = "$ 0";
      totalValEl.dataset.total = 0;
      totalValEl.dataset.subtotal = 0;
      totalValEl.dataset.discountPct = 0;
    }
    const discountInput = document.getElementById("pos-cart-discount-input");
    if (discountInput) discountInput.value = "0";
    cobrarBtn.disabled = true;
    
    // Resetear adicionales al vaciar el carrito
    if (state.businessType === "textil") {
      Object.keys(state.extras).forEach(catKey => {
        const select = document.getElementById(`pos-cart-extra-select-${catKey}`);
        if (select) select.value = "0";
      });
    }
    return;
  }

  cobrarBtn.disabled = false;

  let total = 0;
  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  
  state.cart.forEach(item => {
    // Calcular adicionales aplicables por unidad a este producto específico
    let itemExtraCost = 0;
    if (state.businessType === "textil") {
      Object.keys(state.extras).forEach(catKey => {
        const p = item.product;
        const extrasObj = p.extras || {};
        let hasStatic = false;
        if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
        else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
        else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

        // Solo sumar el costo del adicional si NO está incluido de forma estática en el inventario de este producto
        if (!hasStatic) {
          const select = document.getElementById(`pos-cart-extra-select-${catKey}`);
          if (select) {
            const val = select.value;
            if (val && val !== "0") {
              itemExtraCost += getExtraCost(catKey, val);
            }
          }
        }
      });
    }

    // Calcular precio unitario base según origen
    let basePrice = 0;
    if (origin === "tiendanube") {
      basePrice = parseFloat(item.product.price_tiendanube) || 0;
      if (basePrice <= 0) {
        basePrice = parseFloat(item.product.price_local) || parseFloat(item.product.price) || 0;
      }
    } else {
      basePrice = parseFloat(item.product.price_local) || parseFloat(item.product.price) || 0;
    }
    
    let price = 0;
    if (basePrice > 0) {
      price = basePrice + (itemExtraCost * (1 + (parseFloat(item.product.margin) || 0) / 100));
    } else {
      const finalUnitCost = item.product.cost + itemExtraCost;
      price = finalUnitCost * (1 + item.product.margin / 100);
    }

    const itemTotal = price * (parseInt(item.quantity) || 0);
    total += itemTotal;

    const stockLocalVal = item.product.stock_local !== undefined ? item.product.stock_local : item.product.stock;
    const stockTallerVal = item.product.stock_taller !== undefined ? item.product.stock_taller : "infinito";
    const stockText = origin === "local" ? `Local: ${stockLocalVal}` : `Taller: ${stockTallerVal}`;

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
        <span class="pos-qty-stock-alert">Stock: ${stockText}</span>
      </div>
    `;
    container.appendChild(el);
  });

  if (recalc) {
    const discountInput = document.getElementById("pos-cart-discount-input");
    const discountPct = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
    const subtotal = total;
    const discountAmount = (subtotal * discountPct) / 100;
    const finalTotal = subtotal - discountAmount;

    const totalValEl = document.getElementById("pos-cart-total-val");
    if (totalValEl) {
      totalValEl.innerText = `$ ${Math.round(finalTotal).toLocaleString()}`;
      totalValEl.dataset.total = finalTotal;
      totalValEl.dataset.subtotal = subtotal;
      totalValEl.dataset.discountPct = discountPct;
    }
  }
}

function renderPOSCartExtras() {
  const section = document.getElementById("pos-cart-extras-section");
  if (!section) return;

  if (state.businessType !== "textil") {
    section.style.display = "none";
    return;
  }

  if (state.cart.length === 0) {
    section.style.display = "none";
    return;
  }

  // Guardar selecciones anteriores antes de limpiar el contenedor
  const previousSelections = {};
  Object.keys(state.extras).forEach(catKey => {
    const select = document.getElementById(`pos-cart-extra-select-${catKey}`);
    if (select) {
      previousSelections[catKey] = select.value;
    }
  });

  const grid = document.getElementById("pos-cart-extras-grid");
  grid.innerHTML = "";

  let visibleCount = 0;

  Object.keys(state.extras).forEach(catKey => {
    const options = state.extras[catKey] || [];
    if (options.length === 0) return;

    // Omitir si TODOS los productos del carrito ya lo tienen incluido estáticamente
    const allHaveStatic = state.cart.every(item => {
      const p = item.product;
      const extrasObj = p.extras || {};
      if (catKey === "estampados") return !!(p.estampadoId || extrasObj.estampados);
      if (catKey === "packagings") return !!(p.packagingId || extrasObj.packagings);
      if (catKey === "bordados") return !!(p.bordadoId || extrasObj.bordados);
      return false;
    });

    if (allHaveStatic) return;

    visibleCount++;

    const labelMap = {
      estampados: "Estampado",
      packagings: "Packaging",
      bordados: "Bordado"
    };
    const friendlyName = labelMap[catKey] || catKey.charAt(0).toUpperCase() + catKey.slice(1);

    const formGroup = document.createElement("div");
    formGroup.style.display = "flex";
    formGroup.style.flexDirection = "column";
    formGroup.style.gap = "4px";

    const label = document.createElement("label");
    label.style.fontSize = "0.7rem";
    label.style.fontWeight = "600";
    label.style.color = "var(--text-gray)";
    label.innerText = friendlyName;

    const select = document.createElement("select");
    select.id = `pos-cart-extra-select-${catKey}`;
    select.className = "form-input";
    select.style.padding = "6px 10px";
    select.style.fontSize = "0.8rem";
    select.style.background = "var(--bg-card)";
    select.style.color = "#fff";
    select.style.borderColor = "var(--border-color)";
    
    const defOpt = document.createElement("option");
    defOpt.value = "0";
    defOpt.innerText = `Sin ${friendlyName}`;
    select.appendChild(defOpt);

    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.innerText = `${opt.name} (+$${Math.round(opt.cost).toLocaleString()})`;
      select.appendChild(o);
    });

    // Restaurar valor previo si es válido
    if (previousSelections[catKey]) {
      select.value = previousSelections[catKey];
    } else {
      select.value = "0";
    }

    select.addEventListener("change", () => {
      renderPOSCart(true);
    });

    formGroup.appendChild(label);
    formGroup.appendChild(select);
    grid.appendChild(formGroup);
  });

  if (visibleCount > 0) {
    section.style.display = "block";
  } else {
    section.style.display = "none";
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

  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  const tnCostsDiv = document.getElementById("checkout-tn-costs");
  if (tnCostsDiv) {
    tnCostsDiv.style.display = origin === "tiendanube" ? "block" : "none";
  }

  const arcaBtn = document.getElementById("checkout-arca-btn");
  if (arcaBtn) {
    const hasArcaAccess = (state.email === "klejavalentino@gmail.com" || state.email === "matiascuchettidiaz@gmail.com");
    arcaBtn.style.display = hasArcaAccess ? "block" : "none";
  }

  document.getElementById("checkout-modal").className = "modal-backdrop active";
}

function closeCheckoutModal() {
  document.getElementById("checkout-modal").className = "modal-backdrop";
}

function closeCheckoutModalAndReset() {
  closeCheckoutModal();
  refreshState();
}

async function consumePOSExtras(cart, selectedExtras) {
  let updated = false;

  const consumption = {
    estampados: {},
    packagings: {},
    bordados: {}
  };

  cart.forEach(item => {
    const p = item.product;
    const qty = parseInt(item.quantity) || 0;
    if (qty <= 0) return;

    const extrasObj = p.extras || {};

    ["estampados", "packagings", "bordados"].forEach(catKey => {
      let staticExtraId = null;
      if (catKey === "estampados") staticExtraId = p.estampadoId || extrasObj.estampados;
      else if (catKey === "packagings") staticExtraId = p.packagingId || extrasObj.packagings;
      else if (catKey === "bordados") staticExtraId = p.bordadoId || extrasObj.bordados;

      if (staticExtraId && staticExtraId !== "0") {
        consumption[catKey][staticExtraId] = (consumption[catKey][staticExtraId] || 0) + qty;
      } else {
        const dynamicExtraId = selectedExtras ? selectedExtras[catKey] : null;
        if (dynamicExtraId && dynamicExtraId !== "0") {
          consumption[catKey][dynamicExtraId] = (consumption[catKey][dynamicExtraId] || 0) + qty;
        }
      }
    });
  });

  Object.keys(consumption).forEach(catKey => {
    Object.keys(consumption[catKey]).forEach(optionId => {
      const consumedQty = consumption[catKey][optionId];
      if (consumedQty > 0) {
        const options = state.extras[catKey] || [];
        const option = options.find(o => o.id === optionId);
        if (option) {
          const currentStock = option.stock !== undefined && option.stock !== null ? option.stock : 0;
          option.stock = Math.max(0, currentStock - consumedQty);
          updated = true;
        }
      }
    });
  });

  if (updated) {
    await apiRequest("/api/extras", "POST", state.extras);
  }
}

async function confirmPayment(method) {
  const totalValEl = document.getElementById("pos-cart-total-val");
  const total = parseFloat(totalValEl.dataset.total) || 0;
  const subtotal = parseFloat(totalValEl.dataset.subtotal) || total;
  const discountPct = parseFloat(totalValEl.dataset.discountPct) || 0;
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

  // Recolectar adicionales del pedido
  const extras = {};
  if (state.businessType === "textil") {
    Object.keys(state.extras).forEach(catKey => {
      const select = document.getElementById(`pos-cart-extra-select-${catKey}`);
      if (select) {
        const val = select.value;
        if (val && val !== "0") {
          extras[catKey] = val;
        }
      }
    });
  }

  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";

  // Registrar venta directa
  const salePayload = {
    date: new Date().toISOString(),
    total: total,
    subtotal: subtotal,
    discount_pct: discountPct,
    method: method,
    items: state.cart.map(item => ({
      product: item.product,
      size: item.size,
      quantity: parseInt(item.quantity) || 1
    })),
    extras: extras,
    origen: origin
  };

  if (origin === "tiendanube") {
    salePayload.fee_fijo_tn = parseLocalFloat(document.getElementById("chk-fee-fijo").value) || 0;
    salePayload.comision_pasarela_pago = parseFloat(document.getElementById("chk-comision").value) || 0;
  }

  try {
    // Descontar adicionales de la venta
    await consumePOSExtras(state.cart, extras);

    const registeredSale = await apiRequest("/api/sales", "POST", salePayload);
    const saleId = registeredSale.id || `V-${Math.floor(Math.random()*10000)}`;
    if (registeredSale) {
      registeredSale.id = saleId;
      if (!state.sales.some(s => s.id === saleId)) {
        state.sales.unshift(registeredSale);
      }
    }

    if (method === "ARCA" && registeredSale.payment_url) {
      showToast("Redirigiendo a pasarela de pago ARCA...");
      window.open(registeredSale.payment_url, "_blank");
    }

    // Avanzar a step 3 (éxito)
    document.getElementById("checkout-step-method").style.display = "none";
    document.getElementById("checkout-step-success").style.display = "block";
    
    // Configurar botón de impresión
    const printBtn = document.getElementById("checkout-print-btn");
    if (printBtn) {
      printBtn.onclick = () => printSaleTicket(saleId);
    }
    
    state.cart = [];
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

  const totalValEl = document.getElementById("pos-cart-total-val");
  const total = parseFloat(totalValEl.dataset.total) || 0;
  const subtotal = parseFloat(totalValEl.dataset.subtotal) || total;
  const discountPct = parseFloat(totalValEl.dataset.discountPct) || 0;
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

    // Recolectar adicionales del pedido
    const extras = {};
    if (state.businessType === "textil") {
      Object.keys(state.extras).forEach(catKey => {
        const select = document.getElementById(`pos-cart-extra-select-${catKey}`);
        if (select) {
          const val = select.value;
          if (val && val !== "0") {
            extras[catKey] = val;
          }
        }
      });
    }

    // 2. Registrar venta de tipo Cta. Corriente
    const methodStr = `Cta. corriente (${paidAmount > 0 ? '$'+Math.round(paidAmount).toLocaleString()+' Pago' : 'Total'})`;
    const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
    const salePayload = {
      date: new Date().toISOString(),
      total: total,
      subtotal: subtotal,
      discount_pct: discountPct,
      method: methodStr,
      items: state.cart.map(item => ({
        product: item.product,
        size: item.size,
        quantity: parseInt(item.quantity) || 1
      })),
      extras: extras,
      origen: origin
    };

    if (origin === "tiendanube") {
      salePayload.fee_fijo_tn = parseLocalFloat(document.getElementById("chk-fee-fijo").value) || 0;
      salePayload.comision_pasarela_pago = parseFloat(document.getElementById("chk-comision").value) || 0;
    }

    // Descontar adicionales de la venta
    await consumePOSExtras(state.cart, extras);

    // Submit venta
    const registeredSale = await apiRequest("/api/sales", "POST", salePayload);
    const saleId = registeredSale.id || `V-${Math.floor(Math.random()*10000)}`;
    if (registeredSale) {
      registeredSale.id = saleId;
      if (!state.sales.some(s => s.id === saleId)) {
        state.sales.unshift(registeredSale);
      }
    }

    // 3. Registrar la transacción en la cuenta corriente de cliente
    await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", {
      description: `Venta Cta. corriente ${saleId}`,
      amount: total,
      payment: paidAmount, // registrar entrega parcial si existe
      date: salePayload.date
    });

    // Éxito
    document.getElementById("checkout-step-finance").style.display = "none";
    document.getElementById("checkout-step-success").style.display = "block";
    
    // Configurar botón de impresión
    const printBtn = document.getElementById("checkout-print-btn");
    if (printBtn) {
      printBtn.onclick = () => printSaleTicket(saleId);
    }
    
    state.cart = [];
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
    
    // Sort descending by date
    const sortedSales = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedSales.forEach(sale => {
      const itemsText = sale.items ? sale.items.map(item => `${item.quantity} un x ${item.product.name} (${item.size})`).join("<br>") : "";
      const dateStr = new Date(sale.date).toLocaleDateString('es-AR') + " " + new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      let extrasText = "";
      if (sale.extras && Object.keys(sale.extras).length > 0) {
        const parts = [];
        Object.keys(sale.extras).forEach(catKey => {
          const extraId = sale.extras[catKey];
          if (extraId && extraId !== "0") {
            const list = state.extras[catKey] || [];
            const found = list.find(o => o.id === extraId);
            if (found) {
              const friendlyCat = catKey === "estampados" ? "Estampado" : catKey === "bordados" ? "Bordado" : "Packaging";
              parts.push(`- ${friendlyCat}: ${found.name}`);
            }
          }
        });
        if (parts.length > 0) {
          extrasText = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.7rem; color: var(--accent-blue); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Adicionales:<br>${parts.join("<br>")}</div>`;
        }
      }

      const el = document.createElement("div");
      el.style.borderBottom = "1px solid var(--border-color)";
      el.style.paddingBottom = "16px";
      el.style.marginBottom = "16px";
      
      const translatedMethod = translatePaymentMethod(sale.method);
      
      let badgeClass = "badge-emerald";
      if (sale.method.startsWith("Cta. corriente")) badgeClass = "badge-blue";
      else if (sale.method === "Canje" || sale.method === "custom") badgeClass = "badge-gray";
      
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <span style="font-size: 1.1rem; font-weight: 900; color: #fff;">$ ${Math.round(sale.total).toLocaleString()}</span>
            <span class="badge ${badgeClass}" style="margin-left: 8px; text-transform: capitalize;">${translatedMethod}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            ${!sale.arca_invoice_id ? `<button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px;" onclick="emitInvoiceFromSale('${sale.id}')">⚡ Facturar</button>` : `<span class="badge badge-emerald" style="font-size: 0.6rem;" title="Facturado en AFIP">✔️ ${sale.arca_invoice_id}</span>`}
            <button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px;" onclick="printSaleTicket('${sale.id}')">
              <i class="fas fa-print"></i> Imprimir
            </button>
            ${!sale.arca_invoice_id ? `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px; background: #ef4444;" onclick="deleteSale('${sale.id}')">
              <i class="fas fa-trash"></i> Eliminar
            </button>` : ''}
          </div>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-gray); margin-bottom: 12px;">📅 ${dateStr}</p>
        <div style="background: var(--bg-input); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.75rem; line-height: 1.5; color: var(--text-gray-light); margin-bottom: 6px;">
          ${itemsText}
          ${extrasText}
        </div>
        <div style="font-size: 0.7rem; color: var(--text-gray); font-family: monospace; text-align: right;">ID: ${sale.id}</div>
      `;
      list.appendChild(el);
    });
  }

  modal.className = "modal-backdrop active";
}

async function emitInvoiceFromSale(saleId) {
  try {
    showToast("Generando factura electrónica en AFIP...");
    const res = await apiRequest("/api/invoices/emit", "POST", { sale_id: saleId });
    showToast(`¡Factura ${res.invoice_number} emitida con éxito! CAE: ${res.cae}`);
    await refreshState();
    openSalesHistoryModal(); // Refresh modal
    if (typeof renderExternalMonthlyBillingList === 'function') renderExternalMonthlyBillingList();
    if (typeof renderUninvoicedSales === 'function') renderUninvoicedSales();
  } catch (error) {
    showToast(error.message, true); // It will show the limit errors
  }
}

function closeSalesHistoryModal() {
  document.getElementById("sales-history-modal").className = "modal-backdrop";
}

function translatePaymentMethod(method) {
  if (!method) return "Desconocido";
  const m = method.toLowerCase();
  if (m === "credit_card" || m === "credit") return "Tarjeta de Crédito";
  if (m === "debit_card" || m === "debit") return "Tarjeta de Débito";
  if (m === "transfer" || m === "wire_transfer") return "Transferencia";
  if (m === "cash") return "Efectivo";
  if (m === "custom") return "Personalizado / Efectivo";
  if (m === "mercadopago") return "Mercado Pago";
  return method;
}

async function deleteSale(saleId) {
  if (!confirm("¿Estás seguro de que deseas eliminar esta venta? El stock de los productos vendidos será devuelto al inventario de forma automática.")) return;
  
  try {
    showToast("Eliminando venta y devolviendo stock...");
    const res = await apiRequest(`/api/sales/${saleId}`, "DELETE");
    if (res.success) {
      showToast("Venta eliminada y stock restaurado exitosamente.");
      await refreshState();
      openSalesHistoryModal();
    }
  } catch (error) {
    showToast("Error al eliminar venta: " + error.message, true);
  }
}

function printSaleTicket(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) {
    showToast("Venta no encontrada para imprimir", true);
    return;
  }

  const dateObj = new Date(sale.date);
  const dateStr = dateObj.toLocaleDateString('es-AR');
  const timeStr = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // Calcular items con sus precios reales
  let itemsHtml = "";
  if (sale.items) {
    sale.items.forEach(item => {
      const p = item.product || {};
      const extrasObj = p.extras || {};
      let itemExtraCost = 0;

      if (sale.extras) {
        Object.keys(sale.extras).forEach(catKey => {
          const extraId = sale.extras[catKey];
          if (extraId && extraId !== "0") {
            let hasStatic = false;
            if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
            else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
            else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

            if (!hasStatic) {
              itemExtraCost += getExtraCost(catKey, extraId);
            }
          }
        });
      }

      const finalUnitCost = (parseFloat(p.cost) || 0) + itemExtraCost;
      const unitPrice = finalUnitCost * (1 + (parseFloat(p.margin) || 0) / 100);
      const subtotal = unitPrice * item.quantity;
      const variantText = (state.businessType === "comercio" || p.size === "Único" || !item.size) ? "" : ` (${item.size})`;

      itemsHtml += `
        <tr>
          <td style="font-size: 11px;">
            ${p.name}${variantText}
          </td>
          <td class="text-right" style="font-size: 11px;">${item.quantity}</td>
          <td class="text-right" style="font-size: 11px;">$${Math.round(subtotal).toLocaleString('es-AR')}</td>
        </tr>
      `;
    });
  }

  // Si el sector es textil, agregar ticket de cambio
  let exchangeTicketHtml = "";
  if (state.businessType === "textil") {
    const limitDate = new Date(dateObj.getTime() + 15 * 24 * 60 * 60 * 1000);
    const limitDateStr = limitDate.toLocaleDateString('es-AR');
    
    let exchangeItemsList = "";
    if (sale.items) {
      exchangeItemsList = sale.items.map(item => `• ${item.quantity} u. x ${item.product.name} (${item.size})`).join('<br>');
    }

    exchangeTicketHtml = `
      <div class="exchange-ticket text-center">
        <h3 class="bold" style="font-size: 14px; margin: 0 0 5px 0; letter-spacing: 1px;">TICKET DE CAMBIO</h3>
        <p style="font-size: 10px; margin: 0 0 10px 0;">Válido por 15 días (Hasta el ${limitDateStr})</p>
        <div class="separator"></div>
        <div style="text-align: left; font-size: 11px; margin: 10px 0;">
          <span class="bold">Detalle de prendas:</span><br>
          ${exchangeItemsList}
        </div>
        <div class="separator"></div>
        <p style="font-size: 9px; margin-top: 10px; font-style: italic;">Conserve este ticket para realizar el cambio en el local.</p>
      </div>
    `;
  }

  // Construir HTML final
  const ticketHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ticket ${sale.id}</title>
      <style>
        @page {
          margin: 0;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          line-height: 1.3;
          color: #000;
          background: #fff;
          margin: 0;
          padding: 10px;
          width: 72mm;
          box-sizing: border-box;
        }
        .text-center {
          text-align: center;
        }
        .text-right {
          text-align: right;
        }
        .bold {
          font-weight: bold;
        }
        .header {
          margin-bottom: 10px;
        }
        .non-fiscal {
          font-size: 10px;
          border: 1px solid #000;
          padding: 4px;
          margin: 5px 0;
          display: inline-block;
          font-weight: bold;
        }
        .separator {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        .items-table th {
          border-bottom: 1px dashed #000;
          text-align: left;
          font-weight: bold;
          padding: 4px 0;
        }
        .items-table td {
          padding: 4px 0;
          vertical-align: top;
        }
        .totals {
          margin-top: 10px;
          font-size: 12px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .footer {
          margin-top: 15px;
          font-size: 10px;
        }
        .exchange-ticket {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px dashed #000;
        }
      </style>
    </head>
    <body>
      <div class="header text-center">
        <div class="non-fiscal">DOCUMENTO NO VALIDO COMO FACTURA</div>
        <h2 style="margin: 5px 0; font-size: 16px; text-transform: uppercase;">${state.businessName || (state.businessType === "textil" ? "MAZO TEXTIL" : "MAZO COMERCIO")}</h2>
        <p style="margin: 2px 0; font-size: 10px;">Fecha: ${dateStr} - ${timeStr}</p>
        <p style="margin: 2px 0; font-size: 10px; font-family: monospace;">TICKET N°: ${sale.id}</p>
      </div>
      
      <div class="separator"></div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Detalle</th>
            <th class="text-right">Cant</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div class="separator"></div>
      
      <div class="totals">
        <div class="totals-row">
          <span>Metodo Pago:</span>
          <span class="bold">${sale.method}</span>
        </div>
        <div class="totals-row" style="font-size: 14px; margin-top: 8px;">
          <span class="bold">TOTAL:</span>
          <span class="bold">$${Math.round(sale.total).toLocaleString('es-AR')}</span>
        </div>
      </div>
      
      <div class="separator"></div>
      
      <div class="footer text-center">
        <p style="margin: 5px 0;">¡Muchas gracias por su compra!</p>
      </div>
      
      ${exchangeTicketHtml}
    </body>
    </html>
  `;

  // Abrir ventana e imprimir
  const printWindow = window.open("", "_blank", "width=600,height=800");
  if (printWindow) {
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  } else {
    showToast("Permiso de ventanas emergentes bloqueado. Por favor, habilítelo para poder imprimir.", true);
  }
}

function exportSalesHistory() {
  const formatted = state.sales.flatMap(s => 
    s.items ? s.items.map(item => {
      let itemExtraCost = 0;
      let extraEstampado = "";
      let extraBordado = "";
      let extraPackaging = "";
      
      const p = item.product || {};
      const extrasObj = p.extras || {};

      if (s.extras) {
        Object.keys(s.extras).forEach(catKey => {
          const extraId = s.extras[catKey];
          if (extraId && extraId !== "0") {
            const list = state.extras[catKey] || [];
            const found = list.find(o => o.id === extraId);
            if (found) {
              if (catKey === "estampados") extraEstampado = found.name;
              else if (catKey === "bordados") extraBordado = found.name;
              else if (catKey === "packagings") extraPackaging = found.name;

              // Solo sumar el costo del adicional si NO está incluido de forma estática en el inventario de este producto
              let hasStatic = false;
              if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
              else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
              else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

              if (!hasStatic) {
                itemExtraCost += parseFloat(found.cost) || 0;
              }
            }
          }
        });
      }

      const finalUnitCost = (parseFloat(p.cost) || 0) + itemExtraCost;
      const price = finalUnitCost * (1 + (parseFloat(p.margin) || 0) / 100);
      return {
        ID_Venta: s.id,
        Fecha: new Date(s.date).toLocaleDateString(),
        Metodo: s.method,
        Producto: p.name,
        Categoria: p.category,
        Talle: item.size,
        Color: p.color,
        Cantidad: item.quantity,
        PrecioUnitario: Math.round(price),
        Adicional_Estampado: extraEstampado,
        Adicional_Bordado: extraBordado,
        Adicional_Packaging: extraPackaging,
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

  // Agrupar por baseSku
  const groupedProducts = {};
  actualProducts.forEach(p => {
    const baseSku = p.baseSku || (p.sku.includes("-") ? p.sku.split("-")[0] : p.sku);
    if (!groupedProducts[baseSku]) {
      groupedProducts[baseSku] = {
        baseSku: baseSku,
        name: p.name || "",
        category: p.category || "",
        color: p.color || "",
        variants: [],
        totalStock: 0,
        totalMinStock: 0,
        cost: parseFloat(p.cost) || 0,
        margin: parseFloat(p.margin) || 0,
        editSku: p.sku
      };
    }
    groupedProducts[baseSku].variants.push(p);
    const stockLocalVal = p.stock_local !== undefined ? p.stock_local : p.stock;
    groupedProducts[baseSku].totalStock += (parseInt(stockLocalVal) || 0);
    groupedProducts[baseSku].totalMinStock += getProductMinStock(p, salesByProduct);
  });

  const groupedList = Object.values(groupedProducts);

  // Filtrar el listado agrupado
  const filtered = groupedList.filter(g => {
    const name = g.name || "";
    const baseSku = g.baseSku || "";
    const category = g.category || "";
    const color = g.color || "";
    const matchesSearch = name.toLowerCase().includes(searchInput) || 
                          baseSku.toLowerCase().includes(searchInput) || 
                          category.toLowerCase().includes(searchInput) ||
                          color.toLowerCase().includes(searchInput) ||
                          g.variants.some(v => (v.sku || "").toLowerCase().includes(searchInput));
    const matchesCat = filterCat === "Todas las Categorías" || category === filterCat;
    return matchesSearch && matchesCat;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay productos registrados.</td></tr>`;
    return;
  }

  filtered.forEach(g => {
    const cost = g.cost;
    const margin = g.margin;
    const price = cost * (1 + margin / 100);
    const tr = document.createElement("tr");
    
    // Un producto agrupado es crítico si su stock total está en o por debajo de su stock crítico total configurado
    const isCritical = g.totalStock <= g.totalMinStock;
    const colorClass = isCritical ? '#f87171' : '#10b981';
    
    // Ordenar los talles según el orden estándar
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Único'];
    const sortedTalles = [...new Set(g.variants.map(v => v.size).filter(s => s))]
      .sort((a, b) => {
        const idxA = sizeOrder.indexOf(a);
        const idxB = sizeOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

    const tallesText = sortedTalles.join(", ");

    const firstVar = g.variants[0] || {};
    const priceLocal = firstVar.price_local !== undefined ? parseFloat(firstVar.price_local) : price;
    const priceTiendanube = firstVar.price_tiendanube !== undefined ? parseFloat(firstVar.price_tiendanube) : 0;

    const hasInfiniteTaller = g.variants.some(v => v.stock_taller === "infinito" || !v.stock_taller);
    const totalTaller = g.variants.reduce((sum, v) => sum + (parseInt(v.stock_taller) || 0), 0);
    const stockTallerText = hasInfiniteTaller ? "∞" : `${totalTaller} u.`;

    const priceLocalText = `$ ${Math.round(priceLocal).toLocaleString()}`;
    const priceTiendanubeText = priceTiendanube > 0 ? `$ ${Math.round(priceTiendanube).toLocaleString()}` : "-";

    tr.innerHTML = `
      <td style="font-weight: 700;">
        <div style="font-size: 0.85rem; color: #fff;">${g.name || ""}</div>
        <div style="font-size: 0.65rem; color: var(--text-gray); font-family: monospace; margin-top: 2px;">${g.baseSku || ""}</div>
      </td>
      <td>
        <span class="badge badge-gray">${g.category || ""}</span>
      </td>
      <td>
        <div style="font-size: 0.8rem;">${g.color || "Único"}</div>
        ${(state.businessType === "comercio" || tallesText === "Único" || !tallesText) ? "" : `<div style="font-size: 0.65rem; color: var(--text-gray); margin-top: 2px;">Talles: ${tallesText}</div>`}
      </td>
      <td style="text-align: right; font-weight: 700; color: ${colorClass};">
        <div style="font-size: 0.8rem; color: #fff;">${g.totalStock} u.</div>
      </td>
      <td style="text-align: right; font-weight: 700; color: ${colorClass};">
        ${g.totalMinStock} un.
      </td>
      <td style="text-align: right; color: var(--text-gray);">$ ${Math.round(cost).toLocaleString()}</td>
      <td style="text-align: right; font-weight: 700;">
        <div style="font-size: 0.8rem; color: #10b981;">${priceLocalText}</div>
      </td>
      <td style="text-align: right; color: var(--text-gray-light);">
        <span style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
          ${margin}%
        </span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-action" onclick="openEditProductModal('${g.editSku}')">✏️</button>
          <button class="btn-action btn-delete" onclick="deleteProduct('${g.editSku}')">🗑️</button>
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
  formatCurrencyField(document.getElementById("prod-cost-input"));
  document.getElementById("prod-margin").value = 50;
  
  document.getElementById("prod-price-local").value = "";
  formatCurrencyField(document.getElementById("prod-price-local"));
  document.getElementById("prod-price-tiendanube").value = "";
  document.getElementById("prod-stock-taller").value = "infinito";
  
  const priceLocalInput = document.getElementById("prod-price-local");
  if (priceLocalInput) {
    priceLocalInput.dataset.auto = "true";
    priceLocalInput.oninput = () => {
      priceLocalInput.dataset.auto = "false";
    };
  }
  
  // Limpiar stock dinámico
  document.getElementById("prod-te").value = "";
  document.getElementById("prod-ss").value = "";
  document.getElementById("prod-te-textil").value = "";
  
  // Limpiar stocks y stocks de seguridad de talles
  ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unico'].forEach(sz => {
    document.getElementById(`stock-${sz}`).value = "";
    document.getElementById(`stock-${sz}`).readOnly = false;
    const ssEl = document.getElementById(`ss-${sz}`);
    if (ssEl) {
      ssEl.value = "";
      ssEl.readOnly = false;
    }
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-color-label").innerText = isComercio ? "Variante" : "Color";
  document.getElementById("prod-color").placeholder = isComercio ? "Ej. Chocolate, Pack x3, etc." : "Ej. Negro";
  
  document.getElementById("prod-stock-simple").value = "";
  document.getElementById("prod-stock-simple").readOnly = false;
  
  const talleCard = document.getElementById("product-talles-card");
  const simpleStockContainer = document.getElementById("product-simple-stock-container");
  
  const globalSsContainer = document.getElementById("prod-stock-critico-global-inputs");
  const talleSsContainer = document.getElementById("product-talles-ss-container");
  const explanationExample = document.getElementById("prod-ss-explanation-example");

  if (isComercio) {
    if (talleCard) talleCard.style.display = "none";
    if (simpleStockContainer) simpleStockContainer.style.display = "block";
    if (globalSsContainer) globalSsContainer.style.display = "grid";
    if (talleSsContainer) talleSsContainer.style.display = "none";
    if (explanationExample) {
      explanationExample.innerHTML = "<strong>Ejemplo (Comercio):</strong> Si vendes 5 latas de un producto por día y el proveedor tarda 7 días en reponer, un stock de seguridad de 10 unidades evita que te quedes sin stock ante demoras.";
    }
  } else {
    if (talleCard) talleCard.style.display = "block";
    if (simpleStockContainer) simpleStockContainer.style.display = "none";
    if (globalSsContainer) globalSsContainer.style.display = "none";
    if (talleSsContainer) talleSsContainer.style.display = "block";
    if (explanationExample) {
      explanationExample.innerHTML = "<strong>Ejemplo (Textil):</strong> Si del talle <strong>L</strong> vendes más que del talle <strong>XS</strong>, puedes definir un stock de seguridad mayor para el <strong>L</strong> (ej. 15 prendas) y uno menor para el <strong>XS</strong> (ej. 3 prendas).";
    }
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
  formatCurrencyField(document.getElementById("prod-cost-input"));
  document.getElementById("prod-margin").value = p.margin;
  
  document.getElementById("prod-price-local").value = p.price_local !== undefined ? p.price_local : "";
  formatCurrencyField(document.getElementById("prod-price-local"));
  document.getElementById("prod-price-tiendanube").value = p.price_tiendanube !== undefined ? p.price_tiendanube : "";
  document.getElementById("prod-stock-taller").value = p.stock_taller !== undefined ? p.stock_taller : "infinito";
  
  const priceLocalInput = document.getElementById("prod-price-local");
  if (priceLocalInput) {
    priceLocalInput.dataset.auto = (p.price_local === undefined || p.price_local === "") ? "true" : "false";
    priceLocalInput.oninput = () => {
      priceLocalInput.dataset.auto = "false";
    };
  }
  
  // Cargar stock de todas las variantes del mismo producto (compartiendo baseSku)
  const cleanBase = p.baseSku || p.sku.split("-")[0] || p.sku;
  const variants = state.products.filter(prod => prod.baseSku === cleanBase);
  
  // Limpiar y cargar stock/seguridad por talles
  ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unico'].forEach(sz => {
    const input = document.getElementById(`stock-${sz}`);
    const ssInput = document.getElementById(`ss-${sz}`);
    
    input.readOnly = false; // Permitir editar cualquier talle
    if (ssInput) ssInput.readOnly = false;
    
    const szVal = sz === 'Unico' ? 'Único' : sz;
    const variant = variants.find(v => v.size === szVal);
    if (variant) {
      input.value = variant.stock;
      if (ssInput) ssInput.value = (variant.securityStock !== undefined && variant.securityStock !== null && variant.securityStock !== "") ? variant.securityStock : "";
    } else {
      input.value = "";
      if (ssInput) ssInput.value = "";
    }
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-color-label").innerText = isComercio ? "Variante" : "Color";
  document.getElementById("prod-color").placeholder = isComercio ? "Ej. Chocolate, Pack x3, etc." : "Ej. Negro";
  
  const talleCard = document.getElementById("product-talles-card");
  const simpleStockContainer = document.getElementById("product-simple-stock-container");
  
  const globalSsContainer = document.getElementById("prod-stock-critico-global-inputs");
  const talleSsContainer = document.getElementById("product-talles-ss-container");
  const explanationExample = document.getElementById("prod-ss-explanation-example");

  if (isComercio) {
    if (talleCard) talleCard.style.display = "none";
    if (simpleStockContainer) simpleStockContainer.style.display = "block";
    document.getElementById("prod-stock-simple").value = p.stock;
    document.getElementById("prod-stock-simple").readOnly = false;
    
    if (globalSsContainer) globalSsContainer.style.display = "grid";
    if (talleSsContainer) talleSsContainer.style.display = "none";
    document.getElementById("prod-ss").value = (p.securityStock !== undefined && p.securityStock !== null) ? p.securityStock : "";
    document.getElementById("prod-te").value = (p.leadTime !== undefined && p.leadTime !== null) ? p.leadTime : "";
    
    if (explanationExample) {
      explanationExample.innerHTML = "<strong>Ejemplo (Comercio):</strong> Si vendes 5 latas de un producto por día y el proveedor tarda 7 días en reponer, un stock de seguridad de 10 unidades evita que te quedes sin stock ante demoras.";
    }
  } else {
    if (talleCard) talleCard.style.display = "block";
    if (simpleStockContainer) simpleStockContainer.style.display = "none";
    
    if (globalSsContainer) globalSsContainer.style.display = "none";
    if (talleSsContainer) talleSsContainer.style.display = "block";
    document.getElementById("prod-te-textil").value = (p.leadTime !== undefined && p.leadTime !== null) ? p.leadTime : "";
    
    if (explanationExample) {
      explanationExample.innerHTML = "<strong>Ejemplo (Textil):</strong> Si del talle <strong>L</strong> vendes más que del talle <strong>XS</strong>, puedes definir un stock de seguridad mayor para el <strong>L</strong> (ej. 15 prendas) y uno menor para el <strong>XS</strong> (ej. 3 prendas).";
    }
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

  const priceLocalInput = document.getElementById("prod-price-local");
  if (priceLocalInput && (!priceLocalInput.value || priceLocalInput.dataset.auto === "true")) {
    priceLocalInput.value = Math.round(price);
    priceLocalInput.dataset.auto = "true";
  }
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
  
  const isComercio = state.businessType === "comercio";
  
  // Parsea stock crítico dinámico
  let leadTime = null;
  let globalSecurityStock = null;
  const sizeSecurityStocks = {};
  
  if (isComercio) {
    const leadTimeVal = document.getElementById("prod-te").value.trim();
    leadTime = leadTimeVal !== "" ? parseInt(leadTimeVal) || 0 : null;
    const securityStockVal = document.getElementById("prod-ss").value.trim();
    globalSecurityStock = securityStockVal !== "" ? parseInt(securityStockVal) || 0 : null;
  } else {
    const leadTimeVal = document.getElementById("prod-te-textil").value.trim();
    leadTime = leadTimeVal !== "" ? parseInt(leadTimeVal) || 0 : null;
    
    const talleMapping = { 'XS': 'XS', 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL', 'XXL': 'XXL', 'Unico': 'Único' };
    for (const [idKey, szVal] of Object.entries(talleMapping)) {
      const ssInputVal = document.getElementById(`ss-${idKey}`).value.trim();
      sizeSecurityStocks[szVal] = ssInputVal !== "" ? parseInt(ssInputVal) || 0 : null;
    }
  }

  // Recolectar stock por talles
  const sizeStocks = {};
  let variantCount = 0;
  
  if (isComercio) {
    const inputVal = document.getElementById("prod-stock-simple").value;
    if (inputVal !== "") {
      sizeStocks["Único"] = parseInt(inputVal) || 0;
      variantCount++;
    } else {
      sizeStocks["Único"] = 0;
      variantCount++;
    }
  } else {
    const talleMapping = { 'XS': 'XS', 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL', 'XXL': 'XXL', 'Unico': 'Único' };
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

  const priceLocal = parseLocalFloat(document.getElementById("prod-price-local").value) || 0;
  const priceTiendanube = parseLocalFloat(document.getElementById("prod-price-tiendanube").value) || 0;
  const stockTaller = document.getElementById("prod-stock-taller").value || "infinito";

  // Preparar variantes en lote
  const batchPayload = [];
  
  const title = document.getElementById("modal-product-title").innerText;
  const isEditing = title.startsWith("Editar");
  
  if (isEditing) {
    // Guardar cambios para todos los talles ingresados
    const cleanBaseSku = baseSku.split("-")[0] || baseSku;
    for (const [size, stock] of Object.entries(sizeStocks)) {
      const existingVariant = state.products.find(v => v.baseSku === cleanBaseSku && v.size === size);
      const variantSecurityStock = isComercio ? globalSecurityStock : sizeSecurityStocks[size];
      
      const payload = {
        id: existingVariant ? existingVariant.id : Date.now() + Math.random(),
        baseSku: cleanBaseSku,
        sku: existingVariant ? existingVariant.sku : `${cleanBaseSku}-${size.replace("Único", "U")}`,
        name: name,
        category: category,
        size: size,
        color: color,
        stock: stock,
        stock_local: stock,
        stock_taller: stockTaller,
        price_local: priceLocal,
        price_tiendanube: priceTiendanube,
        price: priceLocal, // Compatibility fallback
        baseCost: cost,
        margin: margin,
        cost: totalCost,
        extras: extras,
        estampadoId: extras.estampados || null,
        bordadoId: extras.bordados || null,
        packagingId: extras.packagings || null,
        leadTime: leadTime,
        securityStock: variantSecurityStock
      };
      batchPayload.push(payload);
    }
  } else {
    // Crear variantes
    for (const [size, stock] of Object.entries(sizeStocks)) {
      const variantSecurityStock = isComercio ? globalSecurityStock : sizeSecurityStocks[size];
      const payload = {
        id: Date.now() + Math.random(),
        baseSku: baseSku,
        sku: `${baseSku}-${size.replace("Único", "U")}`,
        name: name,
        category: category,
        size: size,
        color: color,
        stock: stock,
        stock_local: stock,
        stock_taller: stockTaller,
        price_local: priceLocal,
        price_tiendanube: priceTiendanube,
        price: priceLocal, // Compatibility fallback
        baseCost: cost,
        margin: margin,
        cost: totalCost,
        extras: extras,
        estampadoId: extras.estampados || null,
        bordadoId: extras.bordados || null,
        packagingId: extras.packagings || null,
        leadTime: leadTime,
        securityStock: variantSecurityStock
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
  const p = state.products.find(prod => prod.sku === sku);
  if (!p) return;
  const cleanBase = p.baseSku || p.sku.split("-")[0] || p.sku;
  const variants = state.products.filter(prod => 
    !prod.sku.startsWith("supplier_") && 
    !prod.sku.startsWith("fixedcost_") && 
    !prod.sku.startsWith("account_") && 
    !prod.sku.startsWith("cashtransaction_") && 
    !prod.sku.startsWith("influencer_") && 
    !prod.sku.startsWith("marketingexpense_") && 
    !prod.sku.startsWith("stockintake_") && 
    prod.sku !== "extras_config" && 
    prod.sku !== "categories_config" &&
    (prod.baseSku === cleanBase || prod.sku.split("-")[0] === cleanBase)
  );

  showConfirmModal(`¿Estás seguro de eliminar el producto "${p.name}" y todas sus variantes?`, async () => {
    try {
      showToast("Eliminando producto y variantes...");
      await Promise.all(variants.map(v => apiRequest(`/api/products/${v.sku}`, "DELETE")));
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
    
    const addressHtml = s.address ? `
      <p style="font-size: 0.72rem; color: var(--text-gray); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
        <i class="fas fa-map-marker-alt" style="font-size: 0.65rem; color: var(--accent-red);"></i> ${s.address}
      </p>
    ` : "";
    
    const descriptionHtml = s.description ? `
      <p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; font-style: italic; background: rgba(255,255,255,0.02); padding: 4px 8px; border-radius: 4px; border-left: 2px solid var(--border-color);">
        ${s.description}
      </p>
    ` : "";
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(229, 56, 59, 0.08); display: flex; align-items: center; justify-content: center; color: var(--accent-red); font-size: 1.2rem;">
            <i class="fas fa-truck"></i>
          </div>
          <div>
            <h4 style="font-size: 0.9rem; font-weight: 800; color: var(--text-white);">${s.name}</h4>
            <p style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-phone" style="font-size: 0.65rem;"></i> ${s.phone}
            </p>
            ${addressHtml}
            ${descriptionHtml}
          </div>
        </div>
        <div class="actions-cell" style="display: flex; gap: 6px;">
          <button class="btn-action" style="padding: 6px;" onclick="openEditSupplierModal('${s.id}')">✏️</button>
          <button class="btn-action btn-delete" style="padding: 6px;" onclick="deleteSupplier('${s.id}')">🗑️</button>
        </div>
      </div>
      
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
        ${categoriesBadge}
      </div>
      
      <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-gray);">
        <i class="fas fa-tags" style="color: var(--text-muted); font-size: 0.7rem;"></i>
        <span>${productsText}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function populateSupplierCategoriesCheckboxes(selectedCategories) {
  const container = document.getElementById("supplier-categories-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  const selectedNorm = selectedCategories.map(c => c.trim().toUpperCase());
  
  if (state.categories.length === 0) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-gray); grid-column: 1/-1;">No hay categorías creadas.</span>`;
    return;
  }
  
  state.categories.forEach(cat => {
    const isChecked = selectedNorm.includes(cat.trim().toUpperCase());
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "6px";
    label.style.fontSize = "0.8rem";
    label.style.color = "#fff";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="checkbox" name="supplier-category-checkbox" value="${cat}" ${isChecked ? 'checked' : ''} style="accent-color: var(--accent-emerald);">
      <span>${cat}</span>
    `;
    container.appendChild(label);
  });
}

function populateSupplierProductsCheckboxes(selectedProducts) {
  const container = document.getElementById("supplier-products-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  const uniqueProductNames = [];
  state.products.forEach(p => {
    if (p.name && !uniqueProductNames.includes(p.name)) {
      uniqueProductNames.push(p.name);
    }
  });
  
  Object.keys(state.extras).forEach(catKey => {
    const options = state.extras[catKey] || [];
    options.forEach(opt => {
      const extraName = `Adicional: ${opt.name}`;
      if (!uniqueProductNames.includes(extraName)) {
        uniqueProductNames.push(extraName);
      }
    });
  });
  
  const selectedNorm = selectedProducts.map(p => p.trim().toLowerCase());
  
  if (uniqueProductNames.length === 0) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-gray);">No hay productos registrados en el inventario.</span>`;
    return;
  }
  
  uniqueProductNames.sort().forEach(name => {
    const isChecked = selectedNorm.includes(name.trim().toLowerCase());
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "6px";
    label.style.fontSize = "0.8rem";
    label.style.color = "#fff";
    label.style.cursor = "pointer";
    label.innerHTML = `
      <input type="checkbox" name="supplier-product-checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="accent-color: var(--accent-emerald);">
      <span>${name}</span>
    `;
    container.appendChild(label);
  });
}

function openSupplierModal() {
  document.getElementById("modal-supplier-title").innerText = "Nuevo Proveedor";
  document.getElementById("supplier-id-input").value = "";
  document.getElementById("supplier-name").value = "";
  document.getElementById("supplier-phone").value = "";
  document.getElementById("supplier-address").value = "";
  document.getElementById("supplier-description").value = "";
  
  populateSupplierCategoriesCheckboxes([]);
  populateSupplierProductsCheckboxes([]);
  
  document.getElementById("supplier-modal").className = "modal-backdrop active";
}

function openEditSupplierModal(sId) {
  const s = state.suppliers.find(sup => sup.id === sId || sup.id == sId);
  if (!s) return;

  document.getElementById("modal-supplier-title").innerText = "Editar Proveedor";
  document.getElementById("supplier-id-input").value = s.id;
  document.getElementById("supplier-name").value = s.name;
  document.getElementById("supplier-phone").value = s.phone;
  document.getElementById("supplier-address").value = s.address || "";
  document.getElementById("supplier-description").value = s.description || "";
  
  populateSupplierCategoriesCheckboxes(s.categories || []);
  populateSupplierProductsCheckboxes(s.products || []);
  
  document.getElementById("supplier-modal").className = "modal-backdrop active";
}

function closeSupplierModal() {
  document.getElementById("supplier-modal").className = "modal-backdrop";
}

async function saveSupplierForm(e) {
  e.preventDefault();
  const sId = document.getElementById("supplier-id-input").value;
  const name = document.getElementById("supplier-name").value.trim();
  const phone = document.getElementById("supplier-phone").value.trim();
  const address = document.getElementById("supplier-address").value.trim();
  const description = document.getElementById("supplier-description").value.trim();

  const categoryCheckboxes = document.querySelectorAll('input[name="supplier-category-checkbox"]:checked');
  const categories = Array.from(categoryCheckboxes).map(cb => cb.value);

  const productCheckboxes = document.querySelectorAll('input[name="supplier-product-checkbox"]:checked');
  const products = Array.from(productCheckboxes).map(cb => cb.value);

  const payload = { name, phone, categories, products, address, description };
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
  populateIntakeExtrasDropdown();
  
  // Resetear radios a Producto por defecto
  const prodRadio = document.querySelector('input[name="intake-type"][value="producto"]');
  if (prodRadio) {
    prodRadio.checked = true;
  }
  const prodContainer = document.getElementById("intake-product-container");
  if (prodContainer) prodContainer.style.display = "block";
  const extraContainer = document.getElementById("intake-extra-container");
  if (extraContainer) extraContainer.style.display = "none";
  
  // Listeners para recálculos
  const inputsToRecalc = [
    "intake-materia-prima", "intake-margin",
    "intake-qty-simple",
    "intake-qty-XS", "intake-qty-S", "intake-qty-M", "intake-qty-L", "intake-qty-XL", "intake-qty-XXL", "intake-qty-U",
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

  const cashValInput = document.getElementById("intake-pay-cash-val");
  if (cashValInput) {
    cashValInput.removeEventListener("input", handleCashSplitInput);
    cashValInput.addEventListener("input", handleCashSplitInput);
  }
  const debtValInput = document.getElementById("intake-pay-debt-val");
  if (debtValInput) {
    debtValInput.removeEventListener("input", handleDebtSplitInput);
    debtValInput.addEventListener("input", handleDebtSplitInput);
  }
  const mpInput = document.getElementById("intake-materia-prima");
  if (mpInput) {
    mpInput.removeEventListener("input", formatIntakeMateriaPrima);
    mpInput.addEventListener("input", formatIntakeMateriaPrima);
  }
  
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

function populateIntakeExtrasDropdown() {
  const select = document.getElementById("intake-extra-item-select");
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">Seleccionar adicional..</option>';
  
  Object.keys(state.extras).forEach(catKey => {
    const title = getCategoryTitle(catKey);
    const options = state.extras[catKey] || [];
    if (options.length === 0) return;
    
    const optgroup = document.createElement("optgroup");
    optgroup.label = title;
    
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = `${catKey}:${opt.id}`;
      o.innerText = `${opt.name} (Costo actual: $${opt.cost})`;
      optgroup.appendChild(o);
    });
    select.appendChild(optgroup);
  });
  
  select.value = currentVal;
}

function loadIntakeExtraDetails() {
  const select = document.getElementById("intake-extra-item-select");
  if (!select) return;
  
  const val = select.value;
  if (!val) {
    document.getElementById("intake-materia-prima").value = "";
    recalculateIntakeCosts();
    return;
  }
  
  const [catKey, optionId] = val.split(":");
  const options = state.extras[catKey] || [];
  const option = options.find(o => o.id === optionId);
  if (option) {
    document.getElementById("intake-materia-prima").value = option.cost ? Math.round(option.cost).toLocaleString("es-AR") : "";
  }
  
  recalculateIntakeCosts();
}

function toggleIntakeFormType() {
  const typeVal = document.querySelector('input[name="intake-type"]:checked').value;
  const isProd = (typeVal === "producto");
  
  document.getElementById("intake-product-container").style.display = isProd ? "block" : "none";
  document.getElementById("intake-extra-container").style.display = isProd ? "none" : "block";
  
  if (isProd) {
    const isComercio = (state.businessType === "comercio");
    document.getElementById("intake-talles-container").style.display = isComercio ? "none" : "block";
    document.getElementById("intake-simple-qty-container").style.display = isComercio ? "block" : "none";
    document.getElementById("intake-extras-container").style.display = "grid";
    document.getElementById("intake-materia-prima-label").innerText = "Materia Prima (Opcional)";
    document.getElementById("intake-margin-container").style.display = "block";
    document.getElementById("intake-price-preview-container").style.display = "flex";
  } else {
    document.getElementById("intake-talles-container").style.display = "none";
    document.getElementById("intake-simple-qty-container").style.display = "block";
    document.getElementById("intake-extras-container").style.display = "none";
    document.getElementById("intake-materia-prima-label").innerText = "Costo Unitario de Compra ($)";
    document.getElementById("intake-materia-prima-current").style.display = "none";
    document.getElementById("intake-margin-container").style.display = "none";
    document.getElementById("intake-price-preview-container").style.display = "none";
  }
  
  document.getElementById("intake-product-sku").value = "";
  document.getElementById("intake-product-search").value = "";
  document.getElementById("intake-extra-item-select").value = "";
  document.getElementById("intake-materia-prima").value = "";
  document.getElementById("intake-margin").value = "";
  
  const qtySimple = document.getElementById("intake-qty-simple");
  if (qtySimple) qtySimple.value = "";
  
  ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'U'].forEach(sz => {
    const el = document.getElementById(`intake-qty-${sz}`);
    if (el) el.value = "";
    const stEl = document.getElementById(`intake-stock-${sz}`);
    if (stEl) stEl.style.display = "none";
  });
  
  recalculateIntakeCosts();
}

function clearIntakePreviews() {
  ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'U'].forEach(key => {
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
  const baseCostVal = p.baseCost || p.cost || 0;
  document.getElementById("intake-materia-prima").value = baseCostVal ? Math.round(baseCostVal).toLocaleString("es-AR") : "0";
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
      'XS': 'XS',
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
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value.replace(/\D/g, "")) || 0;
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
  
  updateIntakePaymentSplit('init');
}

function getIntakeTotalCostAndQuantity() {
  const typeEl = document.querySelector('input[name="intake-type"]:checked');
  const type = typeEl ? typeEl.value : "producto";
  const isProd = (type === "producto");
  
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value.replace(/\D/g, "")) || 0;
  let unitCost = baseCost;
  let totalQuantity = 0;
  
  if (isProd) {
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
    unitCost += totalExtrasCost;
    
    if (state.businessType === "comercio") {
      totalQuantity = parseInt(document.getElementById("intake-qty-simple").value) || 0;
    } else {
      const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'U'];
      sizes.forEach(sz => {
        totalQuantity += parseInt(document.getElementById(`intake-qty-${sz}`).value) || 0;
      });
    }
  } else {
    totalQuantity = parseInt(document.getElementById("intake-qty-simple").value) || 0;
  }
  
  const totalCost = isProd ? (baseCost * totalQuantity) : (unitCost * totalQuantity);
  
  return {
    unitCost: unitCost,
    totalQuantity: totalQuantity,
    totalCost: totalCost
  };
}

function formatIntakeMateriaPrima() {
  const input = document.getElementById("intake-materia-prima");
  if (!input) return;
  const raw = input.value.replace(/\D/g, "");
  input.value = raw ? parseInt(raw).toLocaleString("es-AR") : "";
}

function updateIntakePaymentSplit(source = '') {
  const cashValInput = document.getElementById("intake-pay-cash-val");
  const debtValInput = document.getElementById("intake-pay-debt-val");
  if (!cashValInput || !debtValInput) return;
  
  const { totalCost } = getIntakeTotalCostAndQuantity();
  
  if (source === 'init') {
    cashValInput.value = totalCost ? Math.round(totalCost).toLocaleString("es-AR") : "0";
    debtValInput.value = "0";
    const totalToPayEl = document.getElementById("intake-payment-total-to-pay");
    if (totalToPayEl) {
      totalToPayEl.innerText = `Total a pagar: $ ${Math.round(totalCost).toLocaleString("es-AR")}`;
    }
    return;
  }
  
  let cashVal = parseFloat(cashValInput.value.replace(/\D/g, ""));
  let debtVal = parseFloat(debtValInput.value.replace(/\D/g, ""));
  
  if (isNaN(cashVal)) cashVal = 0;
  if (isNaN(debtVal)) debtVal = 0;
  
  if (source === 'debt') {
    if (debtVal < 0) debtVal = 0;
    if (debtVal > totalCost) debtVal = totalCost;
    cashVal = Math.max(0, totalCost - debtVal);
  } else {
    // source === 'cash'
    if (cashVal < 0) cashVal = 0;
    if (cashVal > totalCost) cashVal = totalCost;
    debtVal = Math.max(0, totalCost - cashVal);
  }
  
  cashValInput.value = cashVal ? Math.round(cashVal).toLocaleString("es-AR") : "0";
  debtValInput.value = debtVal ? Math.round(debtVal).toLocaleString("es-AR") : "0";
  
  const totalToPayEl = document.getElementById("intake-payment-total-to-pay");
  if (totalToPayEl) {
    totalToPayEl.innerText = `Total a pagar: $ ${Math.round(totalCost).toLocaleString("es-AR")}`;
  }
}

function handleCashSplitInput() {
  updateIntakePaymentSplit('cash');
}

function handleDebtSplitInput() {
  updateIntakePaymentSplit('debt');
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
  
  const typeEl = document.querySelector('input[name="intake-type"]:checked');
  const type = typeEl ? typeEl.value : "producto";
  const isProd = (type === "producto");
  
  const supplierName = document.getElementById("intake-supplier-select").value;
  const dateVal = document.getElementById("intake-date").value;
  
  if (!supplierName) {
    showToast("Por favor, selecciona un proveedor.", true);
    return;
  }
  
  if (!isProd) {
    // Ingreso de Adicional / Insumo
    const extraSelect = document.getElementById("intake-extra-item-select");
    const extraVal = extraSelect ? extraSelect.value : "";
    if (!extraVal) {
      showToast("Por favor, selecciona un adicional a reponer.", true);
      return;
    }
    
    const [catKey, optionId] = extraVal.split(":");
    const qty = parseInt(document.getElementById("intake-qty-simple").value) || 0;
    if (qty <= 0) {
      showToast("Por favor, ingresa una cantidad mayor a 0.", true);
      return;
    }
    
    const unitCost = parseFloat(document.getElementById("intake-materia-prima").value.replace(/\D/g, "")) || 0;
    const totalCost = unitCost * qty;
    
    const options = state.extras[catKey] || [];
    const option = options.find(o => o.id === optionId);
    if (!option) {
      showToast("Adicional no encontrado.", true);
      return;
    }
    
    // Incrementar stock físico del adicional y actualizar su costo unitario
    option.stock = (option.stock !== undefined && option.stock !== null ? option.stock : 0) + qty;
    option.cost = unitCost;
    
    try {
      showToast("Registrando ingreso de adicional...");
      
      // 1. Guardar la configuración de adicionales actualizada en Firebase
      await apiRequest("/api/extras", "POST", state.extras);
      
      // 2. Guardar documento de transacción de ingreso (stockintake_)
      const intakePayload = {
        productSku: optionId,
        productName: `Adicional: ${option.name}`,
        supplierName: supplierName,
        quantities: { 'Único': qty },
        totalQuantity: qty,
        unitCost: unitCost,
        totalCost: totalCost,
        materiaPrima: 0,
        adicionales: 0,
        date: dateVal,
        timestamp: Date.now(),
        isExtra: true
      };
      await apiRequest("/api/stock-intakes", "POST", intakePayload);
      
      // 3. Registrar el egreso en Caja Diaria / Cuentas a Pagar
      const cashAmount = parseFloat(document.getElementById("intake-pay-cash-val").value.replace(/\D/g, "")) || 0;
      const debtAmount = parseFloat(document.getElementById("intake-pay-debt-val").value.replace(/\D/g, "")) || 0;

      if (cashAmount > 0) {
        const cajaPayload = {
          description: `Compra de insumo (Efectivo): ${option.name} - ${supplierName}`,
          type: "expense",
          amount: cashAmount,
          date: dateVal + "T12:00:00.000Z"
        };
        await apiRequest("/api/cash-transactions", "POST", cajaPayload);
      }

      if (debtAmount > 0) {
        const supplierAccount = state.currentAccounts.find(a => a.type === "proveedor" && a.entityName.toLowerCase() === supplierName.toLowerCase());
        let accId = supplierAccount ? supplierAccount.id : null;
        if (!accId) {
          const newAcc = await apiRequest("/api/current-accounts", "POST", {
            entityName: supplierName,
            type: "proveedor",
            phone: "",
            address: ""
          });
          accId = newAcc.id;
        }
        await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", {
          description: `Compra insumo (A pagar): ${option.name}`,
          amount: debtAmount,
          payment: 0,
          date: dateVal + "T12:00:00.000Z"
        });
      }
      
      showToast("¡Stock e ingreso de adicional registrados con éxito!");
      
      // Limpiar inputs del formulario
      document.getElementById("stock-intake-form").reset();
      document.getElementById("intake-product-sku").value = "";
      document.getElementById("intake-extra-item-select").value = "";
      document.getElementById("intake-total-cost-preview").innerText = "$0";
      document.getElementById("intake-sale-price-preview").innerText = "$0";
      clearIntakePreviews();
      updateIntakePaymentSplit();
      
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      document.getElementById("intake-date").value = `${yyyy}-${mm}-${dd}`;
      
      // Volver a vista de producto por defecto
      const prodRadio = document.querySelector('input[name="intake-type"][value="producto"]');
      if (prodRadio) {
        prodRadio.checked = true;
        toggleIntakeFormType();
      }
      
      await refreshState();
      
    } catch (error) {
      showToast(error.message, true);
    }
    return;
  }
  
  // Ingreso de Producto de Inventario (Existente)
  const selectedSku = document.getElementById("intake-product-sku").value;
  if (!selectedSku) {
    showToast("Por favor, selecciona un producto a reponer.", true);
    return;
  }
  
  const selectedProduct = state.products.find(p => p.sku === selectedSku);
  if (!selectedProduct) {
    showToast("Producto seleccionado no encontrado en el inventario.", true);
    return;
  }
  
  const baseSku = selectedProduct.baseSku || 
    (selectedProduct.sku.includes('-') && ['XS','S','M','L','XL','XXL','U'].includes(selectedProduct.sku.split('-').pop()) 
      ? selectedProduct.sku.split('-').slice(0, -1).join('-') 
      : selectedProduct.sku);

  let sizesInput = {};
  if (state.businessType === "comercio") {
    const qty = parseInt(document.getElementById("intake-qty-simple").value) || 0;
    sizesInput = { 'Único': qty };
  } else {
    sizesInput = {
      'XS': parseInt(document.getElementById("intake-qty-XS").value) || 0,
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
  
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value.replace(/\D/g, "")) || 0;
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
  
  const totalCost = baseCost * totalQuantity;
  
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
      materiaPrima: baseCost,
      adicionales: totalExtrasCost,
      date: dateVal,
      timestamp: Date.now()
    };
    await apiRequest("/api/stock-intakes", "POST", intakePayload);
    
    // Registrar el egreso en Caja Diaria / Cuentas a Pagar
    const cashAmount = parseFloat(document.getElementById("intake-pay-cash-val").value.replace(/\D/g, "")) || 0;
    const debtAmount = parseFloat(document.getElementById("intake-pay-debt-val").value.replace(/\D/g, "")) || 0;

    if (cashAmount > 0) {
      const cajaPayload = {
        description: `Compra de mercadería (Efectivo) - ${supplierName}`,
        type: "expense",
        amount: cashAmount,
        date: dateVal + "T12:00:00.000Z"
      };
      await apiRequest("/api/cash-transactions", "POST", cajaPayload);
    }

    if (debtAmount > 0) {
      const supplierAccount = state.currentAccounts.find(a => a.type === "proveedor" && a.entityName.toLowerCase() === supplierName.toLowerCase());
      let accId = supplierAccount ? supplierAccount.id : null;
      if (!accId) {
        const newAcc = await apiRequest("/api/current-accounts", "POST", {
          entityName: supplierName,
          type: "proveedor",
          phone: "",
          address: ""
        });
        accId = newAcc.id;
      }
      await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", {
        description: `Compra de mercadería (A pagar)`,
        amount: debtAmount,
        payment: 0,
        date: dateVal + "T12:00:00.000Z"
      });
    }
    
    showToast("¡Stock e ingreso registrados con éxito!");
    
    // Limpiar inputs del formulario
    document.getElementById("stock-intake-form").reset();
    document.getElementById("intake-product-sku").value = "";
    document.getElementById("intake-total-cost-preview").innerText = "$0";
    document.getElementById("intake-sale-price-preview").innerText = "$0";
    clearIntakePreviews();
    updateIntakePaymentSplit();
    
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
  const total = clientes.reduce((sum, acc) => {
    const bal = acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0;
    return sum + Math.max(0, bal);
  }, 0);
  const kpiVal = document.getElementById("collections-kpi-val");
  if (kpiVal) kpiVal.innerText = `$ ${Math.round(total).toLocaleString()}`;

  if (clientes.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay cuentas corrientes de clientes registradas.</div>`;
    return;
  }

  clientes.forEach(acc => {
    const balance = Math.max(0, acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0);
    
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
      
    const materiaPrimaVal = item.materiaPrima !== undefined ? item.materiaPrima : (item.isExtra ? 0 : (item.totalQuantity ? item.totalCost / item.totalQuantity : 0));
    const adicionalesVal = item.adicionales !== undefined ? item.adicionales : (item.isExtra ? 0 : Math.max(0, (item.unitCost || 0) - materiaPrimaVal));

    return {
      Fecha: item.date || "",
      Producto: item.productName || "",
      SKU: item.productSku || "",
      Proveedor: item.supplierName || "",
      Cantidades: qtyStr,
      "Cantidad Total": item.totalQuantity || 0,
      "Materia Prima": materiaPrimaVal,
      "Adicionales": adicionalesVal,
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
        const stockVal = opt.stock !== undefined && opt.stock !== null ? opt.stock : 0;
        optionsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.8rem; font-weight: 700; color: #fff;">${opt.name}</span>
              <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 700; margin-left: 8px;">$${Math.round(opt.cost).toLocaleString('es-AR')}</span>
              <span style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700; margin-left: 8px;">Stock: ${stockVal} u.</span>
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
            <input type="text" id="new-opt-cost-${catKey}" class="form-input" style="padding: 6px 10px; font-size: 0.8rem;" placeholder="0" required>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.65rem;">Stock Físico</label>
            <input type="number" id="new-opt-stock-${catKey}" class="form-input" style="padding: 6px 10px; font-size: 0.8rem;" placeholder="0" min="0" required>
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
  if (tabId === "tiendanube") renderIntegrationsStatus();
  if (tabId === "arca") renderIntegrationsStatus();
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
    "ext-pack-mediana", "ext-pack-grande", "ext-bor-basico", "ext-bor-medio", "ext-bor-complejo",
    "chk-fee-fijo", "prod-price-local", "edit-extra-cost", "externa-amount",
    "intake-materia-prima", "intake-pay-cash-val", "intake-pay-debt-val"
  ];
  
  window.currencyInputsList = currencyInputs;
  currencyInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", (e) => formatCurrencyField(e.target));
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

  // 4. Falta materia prima o margen
  if (!state.dismissedNotifications.missing_cost_margin) {
    const missingProducts = state.products.filter(p => {
      if (!p.sku || 
          p.sku.startsWith("supplier_") || 
          p.sku.startsWith("fixedcost_") || 
          p.sku.startsWith("account_") || 
          p.sku.startsWith("cashtransaction_") || 
          p.sku.startsWith("influencer_") || 
          p.sku.startsWith("marketingexpense_") || 
          p.sku.startsWith("stockintake_") || 
          p.sku === "extras_config" || 
          p.sku === "categories_config") {
        return false;
      }
      const rawCost = parseFloat(p.cost) || 0;
      const margin = parseFloat(p.margin) || 0;
      return rawCost === 0 || margin === 0;
    });

    if (missingProducts.length > 0) {
      activeAlerts.push({
        type: "missing_cost_margin",
        title: "Datos Faltantes",
        icon: "fa-solid fa-bell",
        iconClass: "warning",
        text: `Falta poner materia prima y margen en <strong>${missingProducts.length}</strong> productos.`
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

function cleanCompareText(str) {
  if (!str) return "";
  return str.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function parseLocalFloat(val) {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === 'number') return val;
  let valStr = val.toString().trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!valStr) return 0.0;
  if (valStr.includes(",")) {
    valStr = valStr.replace(/\./g, "").replace(/,/g, ".");
  } else {
    const dotsCount = (valStr.match(/\./g) || []).length;
    if (dotsCount > 1) {
      valStr = valStr.replace(/\./g, "");
    } else if (dotsCount === 1) {
      const parts = valStr.split(".");
      if (parts[1].length === 3) {
        valStr = valStr.replace(/\./g, "");
      }
    }
  }
  const parsed = parseFloat(valStr);
  return isNaN(parsed) ? 0.0 : parsed;
}

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
  const stockInput = document.getElementById(`new-opt-stock-${categoryKey}`);
  
  const name = nameInput.value.trim();
  const cost = parseLocalFloat(costInput.value) || 0;
  const stock = stockInput ? (parseInt(stockInput.value) || 0) : 0;
  
  if (!name) return;

  // Generar ID único para la opción
  const id = `${categoryKey.slice(0, 3)}-${slugify(name)}`;

  // Validar duplicados
  if (state.extras[categoryKey].some(opt => opt.id === id || opt.name.toLowerCase() === name.toLowerCase())) {
    showToast("Esta opción ya existe en esta categoría", true);
    return;
  }

  // Agregar opción con stock físico especificado
  state.extras[categoryKey].push({ id, name, cost, stock });

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

function editExtraOption(categoryKey, optionId) {
  const option = state.extras[categoryKey].find(opt => opt.id === optionId);
  if (!option) return;

  document.getElementById("edit-extra-category").value = categoryKey;
  document.getElementById("edit-extra-id").value = optionId;
  document.getElementById("edit-extra-name").value = option.name;
  document.getElementById("edit-extra-cost").value = option.cost;
  formatCurrencyField(document.getElementById("edit-extra-cost"));
  document.getElementById("edit-extra-stock").value = option.stock !== undefined && option.stock !== null ? option.stock : 0;

  document.getElementById("edit-extra-modal").className = "modal-backdrop active";
}

function closeEditExtraModal() {
  document.getElementById("edit-extra-modal").className = "modal-backdrop";
}

async function saveEditExtraForm(e) {
  e.preventDefault();
  const categoryKey = document.getElementById("edit-extra-category").value;
  const optionId = document.getElementById("edit-extra-id").value;
  const name = document.getElementById("edit-extra-name").value.trim();
  const cost = parseLocalFloat(document.getElementById("edit-extra-cost").value);
  const stock = parseInt(document.getElementById("edit-extra-stock").value);

  if (!name) {
    showToast("Por favor, ingrese un nombre válido", true);
    return;
  }
  if (isNaN(cost) || cost < 0) {
    showToast("Precio/costo inválido", true);
    return;
  }
  if (isNaN(stock) || stock < 0) {
    showToast("Stock físico inválido", true);
    return;
  }

  const option = state.extras[categoryKey].find(opt => opt.id === optionId);
  if (!option) return;

  option.name = name;
  option.cost = cost;
  option.stock = stock;

  try {
    showToast("Actualizando adicional...");
    await apiRequest("/api/extras", "POST", state.extras);
    showToast("Adicional actualizado con éxito");
    closeEditExtraModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function checkBusinessNameSetup() {
  if (state.token && !state.businessName) {
    document.getElementById("business-name-modal").className = "modal-backdrop active";
  } else {
    const modal = document.getElementById("business-name-modal");
    if (modal) modal.className = "modal-backdrop";
  }
}

async function saveBusinessNameForm(e) {
  e.preventDefault();
  const name = document.getElementById("input-setup-business-name").value.trim();
  if (!name) {
    showToast("Por favor, ingresa un nombre para tu negocio", true);
    return;
  }
  
  try {
    showToast("Configurando nombre del negocio...");
    
    const profilePayload = {
      ...(state.userProfile || {
        sku: "user_profile",
        name: "User Profile",
        cost: 0,
        stock: 0,
        businessType: state.businessType
      }),
      businessName: name
    };
    
    await apiRequest("/api/products", "POST", profilePayload);
    
    state.businessName = name;
    localStorage.setItem("gestiosmart_business_name", name);
    
    showToast("¡Configuración exitosa!");
    
    document.getElementById("business-name-modal").className = "modal-backdrop";
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

// --- Integraciones (Tiendanube, etc.) ---
async function renderIntegrationsStatus() {
  if (!state.token) return;
  try {
    const integrations = await apiRequest("/api/integrations");
    const tiendanube = integrations?.tiendanube;
    
    // Controlar visibilidad de Tiendanube para el usuario específico
    const tnCard = document.getElementById("tiendanube-integration-card");
    if (tnCard) {
      if (state.email === "matiascuchettidiaz@gmail.com") {
        tnCard.style.display = "block";
      } else {
        tnCard.style.display = "none";
      }
    }
    
    const badge = document.getElementById("tiendanube-status-badge");
    const userIdInput = document.getElementById("tiendanube-user-id");
    const tokenInput = document.getElementById("tiendanube-access-token");
    const disconnectBtn = document.getElementById("tiendanube-disconnect-btn");
    const syncBtn = document.getElementById("tiendanube-sync-btn");
    const syncSalesBtn = document.getElementById("tiendanube-sync-sales-btn");
    const saveBtn = document.getElementById("tiendanube-save-btn");
    const connectedInfo = document.getElementById("tiendanube-connected-info");
    const infoIdSpan = document.getElementById("tiendanube-info-id");
    const credentialsFields = document.getElementById("tiendanube-credentials-fields");
    
    if (tiendanube && tiendanube.activo) {
      if (badge) {
        badge.innerText = "Conectado";
        badge.className = "badge-green";
        badge.style.borderColor = "rgba(16, 185, 129, 0.2)";
        badge.style.background = "var(--bg-dark)";
      }
      if (connectedInfo) {
        connectedInfo.style.display = "flex";
      }
      if (infoIdSpan) {
        infoIdSpan.innerText = tiendanube.user_id || "";
      }
      if (credentialsFields) {
        credentialsFields.style.display = "none";
      }
      if (disconnectBtn) disconnectBtn.style.display = "block";
      if (syncBtn) syncBtn.style.display = "block";
      if (syncSalesBtn) syncSalesBtn.style.display = "block";
      if (saveBtn) saveBtn.style.display = "none";
    } else {
      if (badge) {
        badge.innerText = "Desconectado";
        badge.className = "badge-red";
        badge.style.borderColor = "rgba(229, 56, 59, 0.2)";
        badge.style.background = "var(--bg-dark)";
      }
      if (connectedInfo) {
        connectedInfo.style.display = "none";
      }
      if (credentialsFields) {
        credentialsFields.style.display = "grid";
      }
      if (userIdInput) {
        userIdInput.disabled = false;
        userIdInput.readOnly = false;
        if (!tiendanube) userIdInput.value = "";
      }
      if (tokenInput) {
        tokenInput.disabled = false;
        tokenInput.readOnly = false;
        if (!tiendanube) tokenInput.value = "";
      }
      if (disconnectBtn) disconnectBtn.style.display = "none";
      if (syncBtn) syncBtn.style.display = "none";
      if (syncSalesBtn) syncSalesBtn.style.display = "none";
      if (saveBtn) saveBtn.style.display = "block";
    }

    // Month and Year selectors reading
    const monthSelect = document.getElementById("tiendanube-month-select");
    const yearSelect = document.getElementById("tiendanube-year-select");
    
    if (monthSelect && monthSelect.value) {
      state.tiendanubeMonth = monthSelect.value;
    } else {
      state.tiendanubeMonth = state.tiendanubeMonth || MONTHS[new Date().getMonth()];
    }
    
    if (yearSelect && yearSelect.value) {
      state.tiendanubeYear = yearSelect.value;
    } else {
      state.tiendanubeYear = state.tiendanubeYear || new Date().getFullYear().toString();
    }

    // Calcular métricas de Tiendanube para el reporte adicional
    const tnSales = state.sales.filter(s => {
      if (s.origen !== "tiendanube" && !(s.id && s.id.includes("TN-"))) return false;
      const saleDate = new Date(s.date);
      const sMonthName = MONTHS[saleDate.getMonth()];
      const sYearStr = saleDate.getFullYear().toString();
      return sMonthName === state.tiendanubeMonth && sYearStr === state.tiendanubeYear;
    });
    
    // Ordenar de más nueva a más vieja
    tnSales.sort((a, b) => new Date(b.date) - new Date(a.date));

    let tnGross = 0;
    let tnFees = 0;
    let tnNet = 0;
    let tnUnits = 0;
    let tnOperatingCosts = 0;
    
    let tnSalesHTML = "";
    tnSales.forEach(s => {
      const grossVal = s.total || 0;
      const fixedFee = s.fee_fijo_tn !== undefined ? parseFloat(s.fee_fijo_tn) : 300;
      const pctFee = s.comision_pasarela_pago !== undefined ? parseFloat(s.comision_pasarela_pago) : 5;
      const sFees = fixedFee + (pctFee / 100 * grossVal);
      
      // Calculate operating cost for this sale
      let saleOpCost = 0;
      const items = s.items || [];
      items.forEach(it => {
        const p = it.product || {};
        const qty = parseInt(it.quantity) || 0;
        
        let itemExtraCost = 0;
        if (s.extras) {
          Object.keys(s.extras).forEach(catKey => {
            const extraId = s.extras[catKey];
            if (extraId && extraId !== "0") {
              const extrasObj = p.extras || {};
              let hasStatic = false;
              if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
              else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
              else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

              if (!hasStatic) {
                itemExtraCost += getExtraCost(catKey, extraId);
              }
            }
          });
        }
        
        const unitCost = (parseFloat(p.cost) || 0) + itemExtraCost;
        saleOpCost += unitCost * qty;
        tnUnits += qty;
      });

      tnOperatingCosts += saleOpCost;
      const sNet = grossVal - sFees - saleOpCost;
      
      tnGross += grossVal;
      tnFees += sFees;
      tnNet += sNet;
      
      const formattedDate = new Date(s.date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      
      const itemsListText = items.map(it => {
        const p = it.product || {};
        const sizeText = it.size && it.size !== "Único" ? ` (${it.size})` : "";
        const colorText = p.color ? ` | ${p.color}` : "";
        return `<span style="color: var(--text-gray); font-size: 0.7rem;">${it.quantity} un. x ${p.name || 'Prenda'}${sizeText}${colorText}</span>`;
      }).join("<br>");

      tnSalesHTML += `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding: 8px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #fff;">${s.id}</strong> - <span style="color: var(--text-gray);">${formattedDate}</span>
              <span style="margin-left: 8px;">
                <select class="form-input" style="width: auto; padding: 2px 4px; font-size: 0.65rem; height: auto; display: inline-block; background: var(--bg-dark); border-color: var(--border-color); color: #fff; cursor: pointer;" onchange="changeSaleFiscalStatus('${s.id}', this.value)">
                  <option value="no_declarada" ${s.fiscal_status === 'no_declarada' || !s.fiscal_status ? 'selected' : ''}>No Declarada</option>
                  <option value="declarada" ${s.fiscal_status === 'declarada' ? 'selected' : ''}>Facturada</option>
                </select>
              </span>
            </div>
            <div style="text-align: right;">
              <span style="color: #fff;">Bruto: $${Math.round(grossVal).toLocaleString()}</span> | 
              <span style="color: var(--accent-emerald); font-weight: bold;">Neto: $${Math.round(sNet).toLocaleString()}</span>
            </div>
          </div>
          ${itemsListText ? `<div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid var(--accent-blue); line-height: 1.4;">${itemsListText}</div>` : ""}
        </div>
      `;
    });
    
    if (tnSales.length === 0) {
      tnSalesHTML = `<div style="text-align: center; color: var(--text-gray); padding: 10px;">No hay ventas registradas con origen Tiendanube.</div>`;
    }
    
    const tnReportGrossEl = document.getElementById("tn-report-gross");
    if (tnReportGrossEl) tnReportGrossEl.innerText = `$ ${Math.round(tnGross).toLocaleString()}`;
    
    const tnReportFeesEl = document.getElementById("tn-report-fees");
    if (tnReportFeesEl) tnReportFeesEl.innerText = `$ ${Math.round(tnFees).toLocaleString()}`;

    const tnReportOperatingCostsEl = document.getElementById("tn-report-operating-costs");
    if (tnReportOperatingCostsEl) tnReportOperatingCostsEl.innerText = `$ ${Math.round(tnOperatingCosts).toLocaleString()}`;
    
    const tnReportNetEl = document.getElementById("tn-report-net");
    if (tnReportNetEl) tnReportNetEl.innerText = `$ ${Math.round(tnNet).toLocaleString()}`;

    const tnTicket = tnSales.length > 0 ? (tnGross / tnSales.length) : 0;
    const tnReportTicketEl = document.getElementById("tn-report-ticket");
    if (tnReportTicketEl) tnReportTicketEl.innerText = `$ ${Math.round(tnTicket).toLocaleString()}`;

    const tnReportUnitsEl = document.getElementById("tn-report-units");
    if (tnReportUnitsEl) tnReportUnitsEl.innerText = `${tnUnits} u.`;
    
    const tnSalesLogEl = document.getElementById("tn-sales-log");
    if (tnSalesLogEl) tnSalesLogEl.innerHTML = tnSalesHTML;

    // Renderizar gráfico de evolución online (líneas)
    const evolutionCtx = document.getElementById("chart-tiendanube-evolution");
    if (evolutionCtx) {
      const salesMap = {};
      ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5"].forEach(w => salesMap[w] = 0);
      
      tnSales.forEach(s => {
        const day = new Date(s.date).getDate();
        const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
        salesMap[`Sem ${weekIndex + 1}`] += s.total || 0;
      });

      const evolutionLabels = Object.keys(salesMap);
      const evolutionData = Object.values(salesMap);

      if (state.tiendanubeEvolutionChart) {
        state.tiendanubeEvolutionChart.destroy();
      }
      
      state.tiendanubeEvolutionChart = new Chart(evolutionCtx.getContext("2d"), {
        type: 'line',
        data: {
          labels: evolutionLabels,
          datasets: [{
            label: 'Ventas Online ($)',
            data: evolutionData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#3b82f6',
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
    }

    // Renderizar ARCA Config
    const arca = integrations?.arca;
    const arcaBadge = document.getElementById("arca-status-badge");
    const cuitInput = document.getElementById("arca-cuit");
    const condicionSelect = document.getElementById("arca-condicion-iva");
    const posInput = document.getElementById("arca-pos");
    const categoriaSelect = document.getElementById("arca-categoria-monotributo");
    
    const arcaSaveBtn = document.getElementById("arca-save-btn");
    const arcaDisconnectBtn = document.getElementById("arca-disconnect-btn");
    const arcaCertFile = document.getElementById("arca-cert-file");
    const arcaKeyFile = document.getElementById("arca-key-file");
    
    // Establecer fecha por defecto a hoy en el input del formulario de facturación
    const dateInput = document.getElementById("arca-invoice-date");
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().substring(0, 10);
    }
    
    if (arca && arca.activo) {
      if (arcaBadge) {
        let text = "Configurado - Modo Simulación";
        if (arca.cert_content && arca.key_content) {
          const isHomo = arca.cert_content.toLowerCase().includes("homo") || arca.cert_content.toLowerCase().includes("wsaahomo");
          text = isHomo ? "Conectado - Homologación (AFIP)" : "Conectado - Producción (Facturación Real)";
        }
        arcaBadge.innerText = text;
        arcaBadge.className = "badge-green";
        arcaBadge.style.borderColor = "rgba(16, 185, 129, 0.2)";
        arcaBadge.style.background = "var(--bg-dark)";
      }
      if (cuitInput) {
        cuitInput.value = arca.cuit || "";
        cuitInput.disabled = true;
      }
      if (condicionSelect) {
        condicionSelect.value = arca.condicion_iva || "monotributo";
        condicionSelect.disabled = true;
      }
      if (categoriaSelect) {
        categoriaSelect.value = arca.categoria_monotributo || "A";
        categoriaSelect.disabled = true;
      }
      if (posInput) {
        posInput.value = arca.pos || "0002";
        posInput.disabled = true;
      }
      if (arcaCertFile) arcaCertFile.disabled = true;
      if (arcaKeyFile) arcaKeyFile.disabled = true;
      
      const certHelp = document.querySelector("#arca-cert-file + small");
      if (certHelp && arca.cert_content) {
        certHelp.innerHTML = `<span style="color: #10B981; font-weight: bold;">✓ Certificado guardado en la base de datos</span>`;
      }
      const keyHelp = document.querySelector("#arca-key-file + small");
      if (keyHelp && arca.key_content) {
        keyHelp.innerHTML = `<span style="color: #10B981; font-weight: bold;">✓ Clave privada guardada en la base de datos</span>`;
      }
      
      if (arcaSaveBtn) arcaSaveBtn.style.display = "none";
      if (arcaDisconnectBtn) arcaDisconnectBtn.style.display = "block";
    } else {
      if (arcaBadge) {
        arcaBadge.innerText = "Simulación Activa";
        arcaBadge.className = "badge-blue";
        arcaBadge.style.borderColor = "rgba(96, 165, 250, 0.2)";
        arcaBadge.style.background = "var(--bg-dark)";
      }
      if (cuitInput) cuitInput.disabled = false;
      if (condicionSelect) condicionSelect.disabled = false;
      if (categoriaSelect) categoriaSelect.disabled = false;
      if (posInput) posInput.disabled = false;
      if (arcaCertFile) arcaCertFile.disabled = false;
      if (arcaKeyFile) arcaKeyFile.disabled = false;
      
      const certHelp = document.querySelector("#arca-cert-file + small");
      if (certHelp) {
        certHelp.innerText = "Certificado de Delegación obtenido desde la web de ARCA.";
      }
      const keyHelp = document.querySelector("#arca-key-file + small");
      if (keyHelp) {
        keyHelp.innerText = "Clave generada localmente para encriptar solicitudes wsaa.";
      }
      
      if (arcaSaveBtn) arcaSaveBtn.style.display = "block";
      if (arcaDisconnectBtn) arcaDisconnectBtn.style.display = "none";
    }
    
    // Cargar historial de Facturas ARCA
    const invoices = await loadArcaInvoices();
    
    // Configurar campos dinámicos
    toggleArcaCondicionFields();
    
    // Actualizar barra de progreso del Monotributo si corresponde
    if (condicionSelect && condicionSelect.value === "monotributo") {
      await updateMonotributoTrackerUI(invoices);
    }
    
    // Renderizar registros de facturación externa
    renderExternalMonthlyBillingList();

  } catch (error) {
    console.error("Error al obtener integraciones:", error);
  }
}

async function saveTiendanubeConfig(event) {
  event.preventDefault();
  const userId = document.getElementById("tiendanube-user-id").value;
  const accessToken = document.getElementById("tiendanube-access-token").value;
  
  if (!userId || !accessToken) {
    showToast("Por favor completa todos los campos.", true);
    return;
  }
  
  try {
    showToast("Guardando credenciales de Tiendanube...");
    const payload = {
      user_id: userId,
      access_token: accessToken,
      activo: true
    };
    
    await apiRequest("/api/integrations/tiendanube", "POST", payload);
    showToast("¡Tiendanube conectada con éxito!");
    await renderIntegrationsStatus();
  } catch (error) {
    showToast("Error al guardar credenciales: " + error.message, true);
  }
}

async function disconnectTiendanube() {
  if (!confirm("¿Seguro que deseas desconectar Tiendanube?")) return;
  try {
    showToast("Desconectando...");
    const payload = {
      activo: false
    };
    await apiRequest("/api/integrations/tiendanube", "POST", payload);
    showToast("Tiendanube desconectada.");
    
    // Limpiar campos
    document.getElementById("tiendanube-user-id").value = "";
    document.getElementById("tiendanube-access-token").value = "";
    
    await renderIntegrationsStatus();
  } catch (error) {
    showToast("Error al desconectar: " + error.message, true);
  }
}

async function syncTiendanubeCatalog() {
  try {
    showToast("Sincronizando catálogo desde Tiendanube... Esto puede tardar unos segundos.");
    const result = await apiRequest("/api/integrations/tiendanube/sync", "POST");
    const count = result.count !== undefined ? result.count : 0;
    if (count > 0) {
      showToast(`Sincronización completada. ${count} ${count === 1 ? 'variante nueva importada' : 'variantes nuevas importadas'}.`);
    } else {
      showToast("Sincronización completa.");
    }
    await refreshState();
  } catch (error) {
    showToast("Error en sincronización: " + error.message, true);
  }
}

async function syncTiendanubeSales() {
  try {
    showToast("Sincronizando ventas desde Tiendanube... Esto puede tardar unos segundos.");
    const result = await apiRequest("/api/integrations/tiendanube/sync-orders", "POST");
    const count = result.count || 0;
    if (count > 0) {
      showToast(`Sincronización completada. ${count} ${count === 1 ? 'venta importada' : 'ventas importadas'}.`);
    } else {
      showToast("Sincronización completa.");
    }
    await refreshState();
  } catch (error) {
    showToast("Error en sincronización de ventas: " + error.message, true);
  }
}

function exportTiendanubeToExcel() {
  const now = new Date();
  const tnSales = state.sales.filter(s => {
    if (s.origen !== "tiendanube" && !(s.id && s.id.includes("TN-"))) return false;
    const saleDate = new Date(s.date);
    return MONTHS[saleDate.getMonth()] === state.tiendanubeMonth && saleDate.getFullYear() === now.getFullYear();
  });

  // Ordenar de más nueva a más vieja
  tnSales.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (tnSales.length === 0) {
    showToast("No hay ventas de Tiendanube en este periodo para exportar.", true);
    return;
  }

  // 1. Hoja: Resumen Métricas
  let tnGross = 0;
  let tnFees = 0;
  let tnNet = 0;
  let tnUnits = 0;
  let tnOperatingCosts = 0;

  const salesRows = [];
  tnSales.forEach(s => {
    const grossVal = s.total || 0;
    const fixedFee = s.fee_fijo_tn !== undefined ? parseFloat(s.fee_fijo_tn) : 300;
    const pctFee = s.comision_pasarela_pago !== undefined ? parseFloat(s.comision_pasarela_pago) : 5;
    const sFees = fixedFee + (pctFee / 100 * grossVal);
    
    let saleOpCost = 0;
    const items = s.items || [];
    const itemDetails = [];
    items.forEach(it => {
      const p = it.product || {};
      const qty = parseInt(it.quantity) || 0;
      
      let itemExtraCost = 0;
      if (s.extras) {
        Object.keys(s.extras).forEach(catKey => {
          const extraId = s.extras[catKey];
          if (extraId && extraId !== "0") {
            const extrasObj = p.extras || {};
            let hasStatic = false;
            if (catKey === "estampados") hasStatic = !!(p.estampadoId || extrasObj.estampados);
            else if (catKey === "packagings") hasStatic = !!(p.packagingId || extrasObj.packagings);
            else if (catKey === "bordados") hasStatic = !!(p.bordadoId || extrasObj.bordados);

            if (!hasStatic) {
              const list = state.extras[catKey] || [];
              const found = list.find(o => o.id === extraId);
              if (found) {
                itemExtraCost += parseFloat(found.cost) || 0;
              }
            }
          }
        });
      }
      
      const unitCost = (parseFloat(p.cost) || 0) + itemExtraCost;
      saleOpCost += unitCost * qty;
      tnUnits += qty;
      itemDetails.push(`${qty} u. x ${p.name || 'Prenda'} (${it.size}${p.color ? ' | ' + p.color : ''})`);
    });

    tnOperatingCosts += saleOpCost;
    const sNet = grossVal - sFees - saleOpCost;
    
    tnGross += grossVal;
    tnFees += sFees;
    tnNet += sNet;

    salesRows.push({
      "ID Pedido": s.id,
      "Fecha": new Date(s.date).toLocaleString("es-AR"),
      "Monto Bruto ($)": Math.round(grossVal),
      "Costos Financieros ($)": Math.round(sFees),
      "Costos Operativos ($)": Math.round(saleOpCost),
      "Ganancia Neta ($)": Math.round(sNet),
      "Pasarela / Método": s.method || "Tiendanube",
      "Detalle de Productos": itemDetails.join("; ")
    });
  });

  const summaryData = [
    { "Métrica": "Ventas Brutas TN", "Valor": Math.round(tnGross) },
    { "Métrica": "Costos Financieros TN", "Valor": Math.round(tnFees) },
    { "Métrica": "Costos Operativos TN", "Valor": Math.round(tnOperatingCosts) },
    { "Métrica": "Ganancia Neta TN", "Valor": Math.round(tnNet) },
    { "Métrica": "Prendas Vendidas", "Valor": tnUnits },
    { "Métrica": "Ticket Promedio", "Valor": tnSales.length > 0 ? Math.round(tnGross / tnSales.length) : 0 }
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  const wsSales = XLSX.utils.json_to_sheet(salesRows);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Métricas");
  XLSX.utils.book_append_sheet(wb, wsSales, "Ventas Online");

  XLSX.writeFile(wb, `Reporte_Tiendanube_${state.tiendanubeMonth}.xlsx`);
}


const MONOTRIBUTO_LIMITS_2026 = {
  'A': 10277988.13,
  'B': 15058447.71,
  'C': 21113696.52,
  'D': 26212853.42,
  'E': 30833964.37,
  'F': 38642048.36,
  'G': 46211109.00,
  'H': 70113407.00, // Tope máximo para servicios
  'I': 78479212.00, // Tope cosas muebles
  'J': 89872640.00, // Tope cosas muebles
  'K': 108357084.05  // Tope cosas muebles
};

function toggleArcaCondicionFields() {
  const selectCondicion = document.getElementById("arca-condicion-iva");
  if (!selectCondicion) return;
  
  const condicion = selectCondicion.value;
  const catGroup = document.getElementById("arca-categoria-group");
  const monoCard = document.getElementById("arca-monotributo-tracker-card");
  const insCard = document.getElementById("arca-inscripto-info-card");
  
  if (condicion === "monotributo") {
    if (catGroup) catGroup.style.display = "block";
    if (monoCard) monoCard.style.display = "block";
    if (insCard) insCard.style.display = "none";
  } else {
    if (catGroup) catGroup.style.display = "none";
    if (monoCard) monoCard.style.display = "none";
    if (insCard) insCard.style.display = "block";
  }
  
  populateArcaInvoiceTypes(condicion);
}

function populateArcaInvoiceTypes(condicion) {
  const select = document.getElementById("arca-invoice-type");
  if (!select) return;
  
  select.innerHTML = "";
  let options = [];
  
  if (condicion === "monotributo") {
    options = [
      { value: "Factura C", text: "Factura C (Mercado Interno)" },
      { value: "Factura E", text: "Factura E (Exportación)" },
      { value: "Nota de Crédito C", text: "Nota de Crédito C" },
      { value: "Nota de Débito C", text: "Nota de Débito C" }
    ];
  } else {
    options = [
      { value: "Factura A", text: "Factura A (Resp. Inscripto a Resp. Inscripto)" },
      { value: "Factura B", text: "Factura B (Consumidor Final / Exento)" },
      { value: "Factura E", text: "Factura E (Exportación)" },
      { value: "Nota de Crédito A", text: "Nota de Crédito A" },
      { value: "Nota de Crédito B", text: "Nota de Crédito B" },
      { value: "Nota de Débito A", text: "Nota de Débito A" },
      { value: "Nota de Débito B", text: "Nota de Débito B" }
    ];
  }
  
  options.forEach(opt => {
    const el = document.createElement("option");
    el.value = opt.value;
    el.innerText = opt.text;
    select.appendChild(el);
  });
  
  toggleArcaAssociatedInvoiceField();
}

function toggleArcaAssociatedInvoiceField() {
  const select = document.getElementById("arca-invoice-type");
  const group = document.getElementById("arca-associated-invoice-group");
  if (!select || !group) return;
  
  const type = select.value;
  if (type.startsWith("Nota de Crédito") || type.startsWith("Nota de Débito")) {
    group.style.display = "block";
  } else {
    group.style.display = "none";
  }
}

async function updateMonotributoTrackerUI(invoicesList) {
  const selectCondicion = document.getElementById("arca-condicion-iva");
  if (!selectCondicion || selectCondicion.value !== "monotributo") return;
  
  const categorySelect = document.getElementById("arca-categoria-monotributo");
  const category = categorySelect ? categorySelect.value : "C";
  const limit = MONOTRIBUTO_LIMITS_2026[category] || 21113696.52;
  
  // 1. Cargar las ventas reales para tener la facturación real
  let sales = [];
  try {
    sales = await apiRequest("/api/sales") || [];
  } catch (e) {
    console.error("Error loading sales for Monotributo tracker:", e);
  }
  
  // 2. Resolver Filtro de tipo de venta (Solo Facturadas vs Todas)
  const trackerFilter = document.getElementById("arca-tracker-filter")?.value || "solo_facturadas";
  
  // 3. Resolver Facturación Externa Mensual (Mapa)
  const arca = state.integrations?.arca || {};
  const externaMap = arca.facturacion_externa_mensual || {};
  
  // Sumar facturación externa del mapa para los últimos 12 meses calendarizados
  let externaAccumulated = 0;
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    externaAccumulated += parseFloat(externaMap[key]) || 0;
  }
  
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  
  // 4. Poblar selector de meses si está vacío
  const monthSelect = document.getElementById("arca-monotributo-month-select");
  if (monthSelect && monthSelect.options.length === 0) {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const opt = document.createElement("option");
      opt.value = val;
      opt.innerText = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthSelect.appendChild(opt);
    }
    
    const currentVal = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    monthSelect.value = currentVal;
  }
  
  // 5. Sumar la facturación de los últimos 12 meses
  let accumulated = externaAccumulated;
  sales.forEach(sale => {
    if (sale.status === "cancelled") return;
    if (trackerFilter === "solo_facturadas" && sale.fiscal_status !== "declarada") return;
    
    const saleDate = new Date(sale.date);
    if (saleDate >= oneYearAgo) {
      accumulated += parseFloat(sale.total) || 0;
    }
  });
  
  // 6. Calcular facturación del mes seleccionado
  const selectedMonth = monthSelect ? monthSelect.value : "";
  const monthlyExterna = parseFloat(externaMap[selectedMonth]) || 0;
  let monthlyAccumulated = monthlyExterna;
  if (selectedMonth) {
    sales.forEach(sale => {
      if (sale.status === "cancelled") return;
      if (trackerFilter === "solo_facturadas" && sale.fiscal_status !== "declarada") return;
      
      const saleDate = new Date(sale.date);
      const saleMonth = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      if (saleMonth === selectedMonth) {
        monthlyAccumulated += parseFloat(sale.total) || 0;
      }
    });
  }
  
  // 7. Actualizar interfaz anual
  const accEl = document.getElementById("arca-monotributo-accumulated");
  const pbEl = document.getElementById("arca-monotributo-progressbar");
  const badgeEl = document.getElementById("arca-monotributo-alert-badge");
  const msgEl = document.getElementById("arca-monotributo-info-msg");
  
  if (accEl) {
    const formattedAcc = Math.round(accumulated).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formattedLimit = Math.round(limit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    accEl.innerText = `$ ${formattedAcc} / $ ${formattedLimit}`;
  }
  
  const percent = limit > 0 ? Math.min(100, (accumulated / limit) * 100) : 0;
  if (pbEl) {
    pbEl.style.width = `${percent}%`;
    if (percent >= 95) {
      pbEl.style.backgroundColor = "var(--accent-red)";
    } else if (percent >= 80) {
      pbEl.style.backgroundColor = "#f59e0b"; // Naranja
    } else {
      pbEl.style.backgroundColor = "var(--accent-emerald)";
    }
  }
  
  if (badgeEl && msgEl) {
    if (percent >= 100) {
      badgeEl.innerText = "CATEGORÍA EXCEDIDA";
      badgeEl.className = "badge-red";
      badgeEl.style.borderColor = "rgba(229, 56, 59, 0.2)";
      badgeEl.style.background = "var(--bg-dark)";
      msgEl.innerHTML = `<strong>🚨 Límite de Categoría Excedido (${percent.toFixed(1)}%)</strong>: Has superado el tope de $${Math.round(limit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} anual de la Categoría ${category}. ARCA podría excluirte de oficio. Deberás recategorizarte o inscribirte en el Régimen General.`;
    } else if (percent >= 85) {
      badgeEl.innerText = "ALERTA LÍMITE";
      badgeEl.className = "badge-red";
      badgeEl.style.borderColor = "rgba(229, 56, 59, 0.2)";
      badgeEl.style.background = "var(--bg-dark)";
      msgEl.innerHTML = `<strong>⚠️ Recategorización Próxima (${percent.toFixed(1)}%)</strong>: Estás cerca del límite de tu Categoría ${category}. Evaluá la facturación para las ventanas obligatorias (Febrero y Agosto) para planificar cambios.`;
    } else {
      badgeEl.innerText = "Control Saludable";
      badgeEl.className = "badge-green";
      badgeEl.style.borderColor = "rgba(16, 185, 129, 0.2)";
      badgeEl.style.background = "var(--bg-dark)";
      msgEl.innerHTML = `<strong>✓ Control al Día (${percent.toFixed(1)}%)</strong>: Tu facturación anual acumulada está dentro de los límites saludables para la Categoría ${category}.`;
    }
  }
  
  // 8. Actualizar interfaz mensual
  const monthlyLimit = limit / 12;
  const monthAccEl = document.getElementById("arca-monotributo-month-accumulated");
  const monthPbEl = document.getElementById("arca-monotributo-month-progressbar");
  const monthMsgEl = document.getElementById("arca-monotributo-month-info-msg");
  
  if (monthAccEl) {
    const formattedMonthlyAcc = Math.round(monthlyAccumulated).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formattedMonthlyLimit = Math.round(monthlyLimit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    monthAccEl.innerText = `$ ${formattedMonthlyAcc} / $ ${formattedMonthlyLimit}`;
  }
  
  const monthPercent = monthlyLimit > 0 ? Math.min(100, (monthlyAccumulated / monthlyLimit) * 100) : 0;
  if (monthPbEl) {
    monthPbEl.style.width = `${monthPercent}%`;
    if (monthPercent >= 95) {
      monthPbEl.style.backgroundColor = "var(--accent-red)";
    } else if (monthPercent >= 80) {
      monthPbEl.style.backgroundColor = "#f59e0b"; // Naranja
    } else {
      monthPbEl.style.backgroundColor = "var(--accent-blue)";
    }
  }
  
  if (monthMsgEl) {
    if (monthPercent >= 100) {
      monthMsgEl.innerHTML = `<strong>⚠️ Límite Mensual Superado (${monthPercent.toFixed(1)}%)</strong>: Superaste la facturación mensual prorrateada ($${Math.round(monthlyLimit).toLocaleString("es-AR")}) en la Categoría ${category}. Controlá la proyección anual.`;
    } else if (monthPercent >= 85) {
      monthMsgEl.innerHTML = `<strong>⚠️ Alerta Límite Mensual (${monthPercent.toFixed(1)}%)</strong>: Estás cerca del límite mensual prorrateado para la Categoría ${category}.`;
    } else {
      monthMsgEl.innerHTML = `<strong>✓ Mensual Saludable (${monthPercent.toFixed(1)}%)</strong>: Facturación mensual dentro de la porción proporcional de la Categoría ${category}.`;
    }
  }
}

async function saveArcaConfig(event) {
  event.preventDefault();
  const cuit = document.getElementById("arca-cuit").value.replace(/\D/g, "");
  const condicion = document.getElementById("arca-condicion-iva").value;
  const pos = document.getElementById("arca-pos").value;
  const categoria = document.getElementById("arca-categoria-monotributo").value;
  
  const certFile = document.getElementById("arca-cert-file").files[0];
  const keyFile = document.getElementById("arca-key-file").files[0];
  
  let certText = "";
  let keyText = "";
  
  const readAsText = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsText(file);
    });
  };
  
  try {
    if (certFile) certText = await readAsText(certFile);
    if (keyFile) keyText = await readAsText(keyFile);
  } catch (err) {
    showToast("Error al leer archivos de certificados: " + err.message, true);
    return;
  }
  
  try {
    showToast("Guardando configuración fiscal de ARCA...");
    const payload = {
      cuit: cuit,
      condicion_iva: condicion,
      categoria_monotributo: categoria,
      pos: pos,
      activo: true
    };
    
    if (state.integrations?.arca?.facturacion_externa_mensual) {
      payload.facturacion_externa_mensual = state.integrations.arca.facturacion_externa_mensual;
    }
    
    if (certText) payload.cert_content = certText;
    if (keyText) payload.key_content = keyText;
    
    await apiRequest("/api/integrations/arca", "POST", payload);
    showToast("¡Configuración fiscal guardada con éxito!");
    await renderIntegrationsStatus();
  } catch (error) {
    showToast("Error al guardar configuración: " + error.message, true);
  }
}

async function disconnectArca() {
  if (!confirm("¿Estás seguro de que deseas desconectar la integración con ARCA? Se eliminarán las credenciales y certificados guardados.")) return;
  try {
    showToast("Desconectando ARCA...");
    const payload = {
      cuit: "",
      condicion_iva: "monotributo",
      categoria_monotributo: "A",
      pos: "0002",
      cert_content: "",
      key_content: "",
      activo: false
    };
    await apiRequest("/api/integrations/arca", "POST", payload);
    showToast("Integración con ARCA desconectada.");
    await refreshState();
  } catch (error) {
    showToast("Error al desconectar ARCA: " + error.message, true);
  }
}

async function emitArcaInvoice(event) {
  event.preventDefault();
  const type = document.getElementById("arca-invoice-type").value;
  const concepto = document.getElementById("arca-invoice-concept").value;
  const dateStr = document.getElementById("arca-invoice-date").value;
  const associated = document.getElementById("arca-associated-invoice").value.trim();
  
  if (!dateStr) {
    showToast("Por favor selecciona una fecha para el comprobante.", true);
    return;
  }
  
  // Validación de Comprobante Asociado para NC y ND
  const isAdjustmentNote = type.startsWith("Nota de Crédito") || type.startsWith("Nota de Débito");
  if (isAdjustmentNote && !associated) {
    showToast("Para emitir una Nota de Crédito/Débito es obligatorio indicar el número del comprobante de origen (RG 4540).", true);
    return;
  }
  
  // Validación de límites de fecha
  const today = new Date();
  today.setHours(0,0,0,0);
  const selectedDate = new Date(dateStr + "T00:00:00");
  const diffTime = today - selectedDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (concepto === "bienes") {
    if (diffDays > 5) {
      showToast("Límite excedido: ARCA solo permite facturar venta de bienes hasta 5 días hacia atrás.", true);
      return;
    }
    if (diffDays < -5) {
      showToast("Límite excedido: ARCA solo permite facturar venta de bienes hasta 5 días hacia adelante.", true);
      return;
    }
  } else if (concepto === "servicios") {
    if (diffDays > 10) {
      showToast("Límite excedido: ARCA solo permite facturar servicios hasta 10 días hacia atrás.", true);
      return;
    }
    if (diffDays < -10) {
      showToast("Límite excedido: ARCA solo permite facturar servicios hasta 10 días hacia adelante.", true);
      return;
    }
  }
  
  try {
    showToast("Generando comprobante oficial en ARCA...");
    const payload = {
      type: type,
      concepto: concepto,
      date: dateStr,
      associated_invoice: associated
    };
    
    const res = await apiRequest("/api/invoices/simulate", "POST", payload);
    showToast(`¡Comprobante ${res.invoice_number} emitido con éxito! CAE: ${res.cae}`);
    
    // Limpiar input de comprobante asociado
    document.getElementById("arca-associated-invoice").value = "";
    
    await renderIntegrationsStatus();
  } catch (error) {
    showToast("Error al emitir comprobante: " + error.message, true);
  }
}

async function loadArcaInvoices() {
  try {
    const invoices = await apiRequest("/api/invoices");
    const tbody = document.getElementById("arca-invoices-log");
    if (!tbody) return invoices || [];
    
    if (!invoices || invoices.length === 0) {
      tbody.innerHTML = `
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray);">
          <td colspan="6" style="padding: 15px; text-align: center;">No hay comprobantes electrónicos emitidos todavía.</td>
        </tr>
      `;
      return [];
    }
    
    // Ordenar facturas por fecha descendente
    invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    tbody.innerHTML = invoices.map(inv => {
      const formattedDate = new Date(inv.date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      const assocText = inv.associated_invoice ? `<div style="font-size: 0.65rem; color: var(--text-gray);">Asoc: ${inv.associated_invoice}</div>` : "";
      return `
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray-light);">
          <td style="padding: 8px; font-weight: 700; color: #fff;">
            <div>${inv.type || "Factura C"}</div>
            ${assocText}
          </td>
          <td style="padding: 8px;">${inv.invoice_number || "-"}</td>
          <td style="padding: 8px;">${inv.client_cuit || "20-99999999-9"}</td>
          <td style="padding: 8px; text-align: right; font-weight: 700; color: #fff;">$ ${Math.round(inv.total || 0).toLocaleString()}</td>
          <td style="padding: 8px;">
            <div>CAE: ${inv.cae || "-"}</div>
            <div style="font-size: 0.65rem; color: var(--text-gray);">Vto: ${inv.cae_due || "-"}</div>
          </td>
          <td style="padding: 8px; text-align: center;">
            <span class="badge-green" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2);">
              ✓ ${inv.status || "Aprobado"}
            </span>
          </td>
        </tr>
      `;
    }).join("");
    renderUninvoicedSales();
    return invoices;
  } catch (error) {
    console.error("Error al cargar facturas de ARCA:", error);
    return [];
  }
}

function renderUninvoicedSales() {
  const tbody = document.getElementById("arca-uninvoiced-sales-log");
  if (!tbody) return;
  
  const uninvoiced = state.sales.filter(s => !s.arca_invoice_id);
  uninvoiced.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Show only up to 20 recent uninvoiced sales to keep it clean
  const recent = uninvoiced.slice(0, 20);
  
  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray);">
        <td colspan="4" style="padding: 15px; text-align: center;">No hay ventas recientes pendientes de facturar.</td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = recent.map(sale => {
    const formattedDate = new Date(sale.date).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray-light);">
        <td style="padding: 8px;">${formattedDate}</td>
        <td style="padding: 8px; font-weight: 700; color: #fff;">$ ${Math.round(sale.total).toLocaleString("es-AR")}</td>
        <td style="padding: 8px;">
          <span class="badge badge-gray" style="font-size: 0.65rem;">${sale.method}</span>
        </td>
        <td style="padding: 8px; text-align: right;">
          <button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px;" onclick="emitInvoiceFromSale('${sale.id}')">
            ⚡ Facturar
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

async function changeSaleFiscalStatus(saleId, status) {
  try {
    await apiRequest(`/api/sales/${saleId}/fiscal-status`, "PUT", { fiscal_status: status });
    showToast("Estado fiscal de la venta actualizado.");
    
    const localSale = state.sales.find(s => s.id === saleId);
    if (localSale) {
      localSale.fiscal_status = status;
    }
    
    await updateMonotributoTrackerUI();
    renderIntegrationsStatus();
  } catch (error) {
    showToast("Error al actualizar estado fiscal: " + error.message, true);
  }
}

async function saveExternalMonthlyBilling() {
  const month = document.getElementById("externa-month").value;
  const year = document.getElementById("externa-year").value;
  const rawVal = document.getElementById("externa-amount").value.replace(/\D/g, "");
  const amount = parseFloat(rawVal) || 0;
  
  if (amount <= 0) {
    showToast("Por favor, ingresá un monto mayor a cero.", true);
    return;
  }
  
  const key = `${year}-${month}`;
  
  try {
    showToast("Guardando facturación externa...");
    let integrations = state.integrations || {};
    let arca = integrations.arca || {};
    
    if (!arca.facturacion_externa_mensual) {
      arca.facturacion_externa_mensual = {};
    }
    
    arca.facturacion_externa_mensual[key] = amount;
    
    await apiRequest("/api/integrations/arca", "POST", arca);
    showToast("¡Registro de facturación externa guardado!");
    
    document.getElementById("externa-amount").value = "";
    
    await renderIntegrationsStatus();
    await updateMonotributoTrackerUI();
  } catch (e) {
    showToast("Error al guardar facturación externa: " + e.message, true);
  }
}

function renderExternalMonthlyBillingList() {
  const container = document.getElementById("externa-monthly-list");
  if (!container) return;
  
  container.innerHTML = "";
  
  const arca = state.integrations?.arca;
  if (!arca || !arca.facturacion_externa_mensual) {
    container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-gray); font-size: 0.75rem;">No hay registros cargados.</div>`;
    return;
  }
  
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const sortedKeys = Object.keys(arca.facturacion_externa_mensual).sort().reverse();
  
  if (sortedKeys.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-gray); font-size: 0.75rem;">No hay registros cargados.</div>`;
    return;
  }
  
  sortedKeys.forEach(key => {
    const amount = arca.facturacion_externa_mensual[key];
    const [year, monthStr] = key.split("-");
    const mIndex = parseInt(monthStr) - 1;
    const name = `${monthNames[mIndex]} ${year}`;
    
    const formattedAmount = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    const chip = document.createElement("div");
    chip.style.cssText = "background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #fff;";
    chip.innerHTML = `
      <div>
        <strong>${name}:</strong> 
        <span style="color: var(--accent-emerald); font-weight: bold; margin-left: 4px;">$${formattedAmount}</span>
      </div>
      <button type="button" style="background: none; border: none; color: var(--accent-red); cursor: pointer; padding: 0 4px; font-weight: bold; font-size: 0.8rem;" onclick="deleteExternalMonthlyBilling('${key}')">✕</button>
    `;
    container.appendChild(chip);
  });
}

async function deleteExternalMonthlyBilling(key) {
  if (!confirm("¿Estás seguro de eliminar este registro de facturación externa?")) return;
  
  try {
    showToast("Eliminando registro...");
    let arca = state.integrations?.arca || {};
    if (arca.facturacion_externa_mensual) {
      delete arca.facturacion_externa_mensual[key];
    }
    
    await apiRequest("/api/integrations/arca", "POST", arca);
    showToast("Registro eliminado con éxito.");
    
    await renderIntegrationsStatus();
    await updateMonotributoTrackerUI();
  } catch (e) {
    showToast("Error al eliminar registro: " + e.message, true);
  }
}

function normalizeSize(sz) {
  if (!sz) return "Único";
  const szUpper = sz.toString().trim().toUpperCase();
  
  if (szUpper.includes("S/M") || szUpper.includes("TALLE 1") || szUpper === "1") {
    return "S";
  }
  if (szUpper.includes("M/L") || szUpper.includes("TALLE 2") || szUpper === "2") {
    return "M";
  }
  if (szUpper.includes("L/XL") || szUpper.includes("TALLE 3") || szUpper === "3") {
    return "L";
  }
  if (szUpper.includes("XL/XXL") || szUpper.includes("TALLE 4") || szUpper === "4") {
    return "XL";
  }
  
  if (["XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL"].includes(szUpper)) {
    return szUpper;
  }
  
  if (["U", "UNICO", "ÚNICO", "TALLE UNICO", "TALLE ÚNICO", "SINGLE"].includes(szUpper)) {
    return "Único";
  }
  
  for (const std of ["XXL", "XL", "XS", "S", "M", "L"]) {
    const regex = new RegExp(`\\b${std}\\b`);
    if (regex.test(szUpper)) {
      return std;
    }
  }
  
  return "Único";
}

function toggleLoginPasswordVisibility() {
  const pwdInput = document.getElementById("login-password");
  const eyeIcon = document.getElementById("password-eye-icon");
  if (!pwdInput) return;
  
  if (pwdInput.type === "password") {
    pwdInput.type = "text";
    if (eyeIcon) {
      eyeIcon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
      `;
    }
  } else {
    pwdInput.type = "password";
    if (eyeIcon) {
      eyeIcon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      `;
    }
  }
}

function formatCurrencyField(input) {
  if (!input) return;
  const raw = input.value.toString().replace(/\D/g, "");
  input.value = raw ? parseInt(raw).toLocaleString("es-AR") : "";
}

function formatAllCurrencyInputs() {
  if (window.currencyInputsList) {
    window.currencyInputsList.forEach(id => {
      formatCurrencyField(document.getElementById(id));
    });
  }
}

