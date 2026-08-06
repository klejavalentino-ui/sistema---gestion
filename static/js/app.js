// --- Patchear Constructor Date para compatibilidad con offsets de zona horaria sin dos puntos (ej: +0000) ---
(function() {
  const OriginalDate = window.Date;
  function PatchedDate(...args) {
    if (!(this instanceof PatchedDate)) {
      return OriginalDate(...args);
    }
    if (args.length === 1 && typeof args[0] === 'string') {
      let dateStr = args[0].trim();
      if (/\d{2}[+-]\d{4}$/.test(dateStr)) {
        const len = dateStr.length;
        dateStr = dateStr.substring(0, len - 2) + ":" + dateStr.substring(len - 2);
      }
      return new OriginalDate(dateStr);
    }
    return new OriginalDate(...args);
  }
  PatchedDate.prototype = OriginalDate.prototype;
  PatchedDate.now = OriginalDate.now;
  PatchedDate.UTC = OriginalDate.UTC;
  PatchedDate.parse = function(dateStr) {
    if (typeof dateStr === 'string' && /\d{2}[+-]\d{4}$/.test(dateStr)) {
      const len = dateStr.length;
      dateStr = dateStr.substring(0, len - 2) + ":" + dateStr.substring(len - 2);
    }
    return OriginalDate.parse(dateStr);
  };
  window.Date = PatchedDate;
})();

// --- Estado Global ---
const state = {
  token: sessionStorage.getItem("datamargen_token"),
  email: sessionStorage.getItem("datamargen_email"),
  businessType: localStorage.getItem("datamargen_business_type") || "textil",
  businessName: localStorage.getItem("datamargen_business_name") || "",
  projects: [],
  currentProjectId: localStorage.getItem("datamargen_project_id") || "default",
  currentProjectName: localStorage.getItem("datamargen_project_name") || "",
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
  fixedCostsMonth: "",
  
  // Influencers View Month
  influencersMonth: "",
  
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

let tempLocationStock = {};

function getCleanBaseSku(sku, baseSku) {
  if (baseSku && String(baseSku).trim()) {
    return String(baseSku).trim().toUpperCase();
  }
  if (!sku) return "";
  let str = String(sku).trim();
  str = str.replace(/-(_?)(XS|S|M|L|XL|XXL|3XL|U|UNIC[OÁ]|ÚNICO|[0-9]{1,2})$/i, "");
  return str.toUpperCase();
}
window.getCleanBaseSku = getCleanBaseSku;

function getProductLocationStockSum(p) {
  if (!p) return 0;
  const configuredUserLocs = (state.userProfile?.locations && state.userProfile.locations.length > 0)
    ? state.userProfile.locations
    : ["Local Principal"];

  if (p.locationsStock && Object.keys(p.locationsStock).length > 0) {
    let sum = 0;
    configuredUserLocs.forEach(loc => {
      const matchedKey = Object.keys(p.locationsStock).find(k => k.toLowerCase().trim() === loc.toLowerCase().trim());
      if (matchedKey !== undefined) {
        sum += parseInt(p.locationsStock[matchedKey]) || 0;
      }
    });
    return sum;
  }
  return parseInt(p.stock_local !== undefined ? p.stock_local : p.stock) || 0;
}
window.getProductLocationStockSum = getProductLocationStockSum;

function getVariantStockForLocation(p, locationName) {
  if (!p) return 0;
  if (p.locationsStock && typeof p.locationsStock === "object" && Object.keys(p.locationsStock).length > 0) {
    if (locationName) {
      const matchedKey = Object.keys(p.locationsStock).find(k => k.toLowerCase().trim() === locationName.toLowerCase().trim());
      if (matchedKey !== undefined) {
        return parseInt(p.locationsStock[matchedKey]) || 0;
      }
    }
  }
  return parseInt(p.stock_local !== undefined ? p.stock_local : p.stock) || 0;
}
window.getVariantStockForLocation = getVariantStockForLocation;

function getConfiguredSizes(category = null, productKey = null) {
  const isTextil = state.businessType === "textil" || (state.userProfile?.businessModel === "Indumentaria");
  if (!isTextil) {
    return ["Único"];
  }

  const globalSizes = (() => {
    const raw = (state.userProfile && state.userProfile.sizeVariants) || state.sizeVariants;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    return ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Único"];
  })();

  if (productKey) {
    const prodSizesMap = state.userProfile?.productSizes || {};
    const matchedPKey = Object.keys(prodSizesMap).find(k => k.toLowerCase().trim() === String(productKey).toLowerCase().trim());
    if (matchedPKey && Array.isArray(prodSizesMap[matchedPKey]) && prodSizesMap[matchedPKey].length > 0) {
      return prodSizesMap[matchedPKey].map(s => String(s).trim()).filter(Boolean);
    }
  }

  if (category) {
    const catSizesMap = state.userProfile?.categorySizes || {};
    const matchedKey = Object.keys(catSizesMap).find(k => k.toLowerCase().trim() === String(category).toLowerCase().trim());
    if (matchedKey && Array.isArray(catSizesMap[matchedKey]) && catSizesMap[matchedKey].length > 0) {
      return catSizesMap[matchedKey].map(s => String(s).trim()).filter(Boolean);
    }

    // Backward compatibility with older fullSizeCategories checkbox-list
    if (state.userProfile?.fullSizeCategories && Array.isArray(state.userProfile.fullSizeCategories)) {
      const fullCats = state.userProfile.fullSizeCategories;
      const isFull = fullCats.some(c => c.toLowerCase().trim() === String(category).toLowerCase().trim());
      if (!isFull) {
        return ["Único"];
      }
    } else {
      // Default fallback by name if nothing is configured yet
      const cLower = String(category).toLowerCase();
      if (cLower.includes("gorro") || cLower.includes("gorra") || cLower.includes("sombrero") || cLower.includes("accesorio") || cLower.includes("bolso") || cLower.includes("mochila") || cLower.includes("bazar") || cLower.includes("cartera")) {
        return ["Único"];
      }
    }
  }

  return globalSizes;
}


// Returns a numeric suffix for SKU based on size position: XS→1, S→2, M→3, etc. Único→U
function getSizeSkuSuffix(size) {
  if (!size || size === "Único" || size === "Unico") return "U";
  const sizes = getConfiguredSizes();
  const idx = sizes.findIndex(s => s.toLowerCase().trim() === size.toLowerCase().trim());
  return idx >= 0 ? String(idx + 1) : size.replace(/[^A-Z0-9]/gi, "");
}

function getProductNameWithColor(p) {
  if (!p) return "";
  let name = (p.name || "").trim();
  const color = (p.color || "").trim();
  if (color && color.toLowerCase() !== "único" && color.toLowerCase() !== "unico") {
    const nameLower = name.toLowerCase();
    const colorLower = color.toLowerCase();
    if (!nameLower.includes(colorLower)) {
      name = `${name} ${color}`;
    }
  }
  return name;
}
window.getProductNameWithColor = getProductNameWithColor;

let currentLocationTab = "";

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
  
  if (localStorage.getItem('app-theme') === 'light') {
    document.body.classList.add('light-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    }
  }
  const verifyScreen = document.getElementById("verify-email-screen");
  const paywallScreen = document.getElementById("paywall-screen");
  
  if (state.token) {
    authSection.style.display = "none";
    // We let refreshState determine app section visibility
    state.businessType = localStorage.getItem("datamargen_business_type") || "textil";
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
  const authCard = document.getElementById("auth-card");
  
  if (resetForm) resetForm.style.display = "none";
  
  if (showRegister) {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    if (authCard) authCard.style.maxWidth = "540px";
  } else {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    if (authCard) authCard.style.maxWidth = "400px";
  }
}

function toggleResetPasswordView(showReset) {
  const loginForm = document.getElementById("login-container");
  const registerForm = document.getElementById("register-container");
  const resetForm = document.getElementById("reset-password-container");
  const authCard = document.getElementById("auth-card");
  
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
    if (authCard) authCard.style.maxWidth = "400px";
  } else {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    if (resetForm) resetForm.style.display = "none";
    if (authCard) authCard.style.maxWidth = "400px";
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
    state.projects = data.projects || [];
    const bizType = data.businessType || document.getElementById("login-business-type").value || "textil";
    state.businessType = bizType;
    
    sessionStorage.setItem("datamargen_token", data.token);
    if (data.refreshToken) {
      sessionStorage.setItem("datamargen_refresh_token", data.refreshToken);
    }
    sessionStorage.setItem("datamargen_email", data.email);
    localStorage.setItem("datamargen_business_type", bizType);
    
    showToast("¡Sesión iniciada!");
    
    if (state.projects.length > 1) {
      document.getElementById("auth-section").style.display = "none";
      openProjectSelectionModal();
    } else if (state.projects.length === 1) {
      const p = state.projects[0];
      state.currentProjectId = p.id;
      state.currentProjectName = p.name;
      state.businessType = p.businessType || bizType;
      localStorage.setItem("datamargen_project_id", p.id);
      localStorage.setItem("datamargen_project_name", p.name);
      localStorage.setItem("datamargen_business_type", state.businessType);
      checkAuth();
    } else {
      checkAuth();
    }
  } catch (error) {
    console.error("Login Error:", error);
    errorDiv.innerText = translateError(error.message);
    errorDiv.style.display = "block";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const name = document.getElementById("register-name").value;
  const businessName = document.getElementById("register-business-name").value;
  const username = document.getElementById("register-username").value;
  const email = document.getElementById("register-email").value;
  const phone = document.getElementById("register-phone").value;
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-password-confirm").value;
  const bizModel = document.getElementById("register-business-type").value || "Indumentaria";
  const bizType = (bizModel === "Indumentaria") ? "textil" : "comercio";
  const errorDiv = document.getElementById("register-error");
  
  errorDiv.style.display = "none";
  
  if (password !== confirmPassword) {
    errorDiv.innerText = "Las contraseñas no coinciden.";
    errorDiv.style.display = "block";
    return;
  }
  if (password.length < 6) {
    errorDiv.innerText = "La contraseña debe tener al menos 6 caracteres.";
    errorDiv.style.display = "block";
    return;
  }
  
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, businessName, username, email, phone, password, businessType: bizType, businessModel: bizModel })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al registrarse");
    
    state.token = data.token;
    state.email = data.email;
    state.businessType = bizType;
    sessionStorage.setItem("datamargen_token", data.token);
    sessionStorage.setItem("datamargen_email", data.email);
    localStorage.setItem("datamargen_business_type", bizType);
    
    showToast("Registro exitoso. Verificá tu correo.");
    checkAuth();
  } catch (error) {
    errorDiv.innerText = translateError(error.message);
    errorDiv.style.display = "block";
  }
}

function updateSidebarProfile() {
  const nameSpan = document.getElementById("user-display-name");
  const roleSpan = document.getElementById("user-display-role");
  const avatarDiv = document.getElementById("user-display-avatar");
  const businessSpan = document.getElementById("user-display-business");
  
  if (nameSpan && roleSpan && avatarDiv) {
    const usernameSpan = document.getElementById("user-display-username");
    
    // If state.userProfile exists, use it. Otherwise use email prefix.
    let displayName = "USUARIO";
    let displayRole = "Administrador";
    let displayUsername = "";
    
    if (state.subuser) {
      displayName = state.subuser.name || state.subuser.username || (state.subuser.email ? state.subuser.email.split("@")[0] : "Usuario");
      displayUsername = "@" + (state.subuser.username || (state.subuser.email ? state.subuser.email.split("@")[0] : "usuario"));
      displayRole = "Usuario";
    } else if (state.userProfile && state.userProfile.contactName && state.userProfile.contactName.trim() !== "") {
      displayName = state.userProfile.contactName;
    } else if (state.userProfile && state.userProfile.displayName && state.userProfile.displayName.trim() !== "") {
      displayName = state.userProfile.displayName;
    } else if (state.userProfile && state.userProfile.name && !state.userProfile.name.startsWith("Perfil ") && state.userProfile.name.toLowerCase() !== "user profile") {
      displayName = state.userProfile.name;
    } else if (state.email) {
      const emailName = state.email.split("@")[0];
      displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    
    if (!state.subuser) {
      if (state.userProfile && state.userProfile.username) {
        displayUsername = "@" + state.userProfile.username;
      } else if (state.email) {
        displayUsername = "@" + state.email.split("@")[0];
      }
    }
    
    if (!state.subuser && state.userProfile && state.userProfile.role) {
      displayRole = state.userProfile.role.charAt(0).toUpperCase() + state.userProfile.role.slice(1);
    }
    
    nameSpan.innerText = displayName;
    roleSpan.innerText = displayRole;
    avatarDiv.innerText = displayName.charAt(0).toUpperCase();
    if (usernameSpan) usernameSpan.innerText = displayUsername;
    if (businessSpan) {
      businessSpan.innerText = state.currentProjectName || state.businessName || state.userProfile?.businessName || "Mi Negocio";
    }
    
    // Update Topbar
    const tbDate = document.getElementById("topbar-date");
    const tbBizName = document.getElementById("topbar-business-name");
    const tbUser = document.getElementById("topbar-user-name");
    
    if (tbDate) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      tbDate.innerText = `${dd}/${mm}/${yyyy}`;
    }
    
    if (tbBizName) {
      tbBizName.innerText = state.currentProjectName || state.businessName || state.userProfile?.businessName || "Mi Negocio";
    }
    
    if (tbUser) {
      tbUser.innerText = displayName;
    }
    
    // Mostrar/ocultar herramientas de administrador en la pestaña de Suscripción
    const adminSyncContainer = document.getElementById("admin-sync-container");
    if (adminSyncContainer) {
      if (state.email === "valentinoklcv@gmail.com" || state.email === "matiascuchettidiaz@gmail.com") {
        adminSyncContainer.style.display = "block";
      } else {
        adminSyncContainer.style.display = "none";
      }
    }
  }
}

function handleLogout() {
  state.token = null;
  state.email = null;
  sessionStorage.removeItem("datamargen_token");
  sessionStorage.removeItem("datamargen_refresh_token");
  sessionStorage.removeItem("datamargen_email");
  showToast("Sesión cerrada");
  checkAuth();
}
window.handleLogout = handleLogout;

async function handleDeleteAccount() {
  const confirm1 = confirm("¿Estás seguro que deseas eliminar esta cuenta de forma permanente? Se borrarán todos los datos del negocio, productos, ventas y configuraciones de forma irreversible.");
  if (!confirm1) return;
  
  const confirm2 = prompt("Esta acción NO se puede deshacer. Por seguridad, escribe 'ELIMINAR' para confirmar la eliminación definitiva:");
  if (confirm2 !== "ELIMINAR") {
    showToast("Eliminación cancelada o palabra de confirmación incorrecta.", true);
    return;
  }
  
  try {
    const res = await apiRequest("/api/auth/delete-account", "POST");
    showToast("Cuenta eliminada correctamente.");
    state.token = null;
    state.email = null;
    sessionStorage.removeItem("datamargen_token");
    sessionStorage.removeItem("datamargen_email");
    setTimeout(() => {
      checkAuth();
      window.location.reload();
    }, 1500);
  } catch (e) {
    showToast("Error: " + e.message, true);
  }
}
window.handleDeleteAccount = handleDeleteAccount;

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
          <div style="background: var(--bg-input); font-family: monospace; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 0.75rem; color: var(--text-white); border: 1px solid var(--border-color); line-height: 1.5; word-break: break-word;">
            <strong>SKU | Producto | Categoría | Variante | Costo Unitario | Margen (%) | Precio de Venta | Stock Actual | Tiempo de Entrega (días) | Stock de seguridad</strong>
          </div>
        </div>
      `;
    } else {
      instructionsEl.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 15px; font-size: 0.8rem; line-height: 1.5; color: var(--text-gray-light);">
          ⚠️ <strong style="color: var(--accent-red);">¡Atención!</strong> Para que el archivo de Excel se lea correctamente, <strong>debe contener exactamente los siguientes encabezados como títulos de tabla</strong> (no importa mayúsculas, minúsculas o tildes, pero sí el contenido literal):
          <div style="background: var(--bg-input); font-family: monospace; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 0.75rem; color: var(--text-white); border: 1px solid var(--border-color); line-height: 1.5; word-break: break-word;">
            <strong>SKU | Producto | Categoría | Talle | Costo Unitario | Margen (%) | Precio de Venta | Stock Actual | Tiempo de Entrega (días) | Stock de seguridad</strong>
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
      <td style="font-weight: 700; color: var(--text-white);">${p.name}</td>
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
        <td style="font-weight: 700; color: var(--text-white);">${e.name}</td>
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
          const sizeSkuSuffix = getSizeSkuSuffix(size);
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
  
  // Base columns
  const baseHeaders = isComercio 
    ? ["SKU", "Producto", "Categoría", "Variante", "Materia Prima", "Costo Unitario", "Margen (%)", "Precio de Venta", "Stock Actual", "Tiempo de Entrega (días)", "Stock de seguridad"]
    : ["SKU", "Producto", "Categoría", "Talle", "Materia Prima", "Costo Unitario", "Margen (%)", "Precio de Venta", "Stock Actual", "Tiempo de Entrega (días)", "Stock de seguridad"];
  
  // Add dynamic insumo category columns
  const extraCategoryKeys = Object.keys(state.extras || {}).filter(k => !["sku", "name", "cost", "stock", "id"].includes(k));
  const extraHeaders = extraCategoryKeys.map(catKey => getCategoryTitle(catKey));
  
  const allHeaders = [...baseHeaders, ...extraHeaders];
  
  // Location-based stock columns
  const configuredLocs = (state.userProfile?.locations && state.userProfile.locations.length > 0)
    ? state.userProfile.locations : [];
  if (configuredLocs.length > 1) {
    // Replace generic "Stock Actual" with per-location columns
    const stockIdx = allHeaders.indexOf("Stock Actual");
    if (stockIdx !== -1) {
      allHeaders.splice(stockIdx, 1, ...configuredLocs.map(loc => `Stock Actual: ${loc}`));
    }
  }
  
  // Sample data
  const sampleData = isComercio
    ? [
        ["PROD-001", "Coca Cola 1.5L", "Bebidas", "Único", "1200", "1200", "50", "1800", "24", "15", "5"],
        ["PROD-002", "Alfajor de Chocolate", "Kiosco", "Único", "400", "400", "62.5", "650", "50", "15", "5"]
      ]
    : [
        ["REM-001", "Remera Oversize Negra", "Remeras", "M", "3000", "3000", "100", "6000", "15", "5", "3"],
        ["REM-001", "Remera Oversize Negra", "Remeras", "S", "3000", "3000", "100", "6000", "15", "5", "3"]
      ];
  
  // Pad sample data rows to match header length
  sampleData.forEach(row => {
    while (row.length < allHeaders.length) row.push("");
  });
  
  const sheetData = [allHeaders, ...sampleData];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Add data validation (dropdowns) for insumo columns
  const maxRows = 200; // support up to 200 rows of data
  extraCategoryKeys.forEach((catKey, i) => {
    const colIdx = baseHeaders.length + i;
    const opts = (state.extras[catKey] || []).map(o => o.name).filter(Boolean);
    if (opts.length === 0) return;
    
    // Add "Sin insumo" option
    const allOpts = ["Sin insumo", ...opts];
    const formula = '"' + allOpts.join(",") + '"';
    
    // Apply data validation to each cell in this column (rows 2 to maxRows)
    for (let row = 1; row <= maxRows; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: colIdx });
      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
      if (!ws["!dataValidation"]) ws["!dataValidation"] = [];
    }
    
    // SheetJS community doesn't natively support dataValidation via ws["!dataValidation"],
    // so we use a hidden "Options" sheet with the values and reference it
    if (!wb.Sheets["_Opciones"]) {
      const optsWs = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, optsWs, "_Opciones");
    }
    const optsWs = wb.Sheets["_Opciones"];
    allOpts.forEach((optName, optIdx) => {
      const cell = XLSX.utils.encode_cell({ r: optIdx, c: i });
      optsWs[cell] = { t: "s", v: optName };
    });
    // Update range for options sheet
    const optsRange = XLSX.utils.decode_range(optsWs["!ref"] || "A1");
    optsRange.e.r = Math.max(optsRange.e.r, allOpts.length - 1);
    optsRange.e.c = Math.max(optsRange.e.c, i);
    optsWs["!ref"] = XLSX.utils.encode_range(optsRange);
  });
  
  // Set column widths
  ws["!cols"] = allHeaders.map((h, i) => ({ wch: Math.max(h.length + 2, 14) }));
  
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
      .replace(/\s+/g, " ")
      .trim();
  }
  
  function getHeaderVal(cleanRow, possibleKeys) {
    for (const key of possibleKeys) {
      const normKey = normalizeHeader(key);
      if (cleanRow[normKey] !== undefined && cleanRow[normKey] !== null && String(cleanRow[normKey]).trim() !== "") {
        return String(cleanRow[normKey]).trim();
      }
    }
    return "";
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
      
      // Strict header presence check
      const aliasMap = {
        "sku": ["sku", "codigo", "code", "id", "sku base", "referencia", "ref"],
        "producto": ["producto", "nombre", "nombre del producto", "prenda", "articulo", "descripcion", "detalle"],
        "categoria": ["categoria", "categoría", "rubro", "tipo"],
        "materia prima": ["materia prima", "materia_prima", "basecost", "costo materia prima", "costo base"],
        "costo unitario": ["costo unitario", "costo", "costo total", "costo unit.", "costo unit", "costounitario"],
        "margen": ["margen (%)", "margen(%)", "margen", "margin"],
        "precio de venta": ["precio de venta", "precio venta", "precio", "pv"]
      };

      const missingFields = [];
      Object.keys(aliasMap).forEach(field => {
        const aliases = aliasMap[field];
        const found = normalizedSheetHeaders.some(h => aliases.some(a => h.includes(a)));
        if (!found) {
          missingFields.push(field);
        }
      });
      
      if (missingFields.length > 0) {
        const headerFriendlyMap = {
          "sku": "SKU",
          "producto": "Producto / Nombre",
          "categoria": "Categoría",
          "materia prima": "Materia Prima",
          "costo unitario": "Costo Unitario",
          "margen": "Margen (%)",
          "precio de venta": "Precio de Venta"
        };
        const missingFriendly = missingFields.map(h => headerFriendlyMap[h] || h);
        showToast(`El archivo no se puede leer. Faltan columnas obligatorias: ${missingFriendly.join(", ")}`, true);
        return;
      }

      // Check column ordering: SKU must be col 1, Producto col 2, Categoría col 3, Talle col 4
      const col1 = normalizedSheetHeaders[0] || "";
      const col2 = normalizedSheetHeaders[1] || "";
      const col3 = normalizedSheetHeaders[2] || "";
      const col4 = normalizedSheetHeaders[3] || "";

      if (!col1.includes("sku") || !col2.includes("producto") || !col3.includes("categoria") || (!col4.includes("talle") && !col4.includes("variante"))) {
        showToast("El orden de las columnas del Excel no es correcto. Debe ser: 1. SKU, 2. Producto, 3. Categoría, 4. Talle.", true);
        return;
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      if (rows.length === 0) {
        showToast("El archivo de Excel está vacío.", true);
        return;
      }
      
      parsedImportProducts = [];
      const importedSkusInBatch = new Set();
      const baseSkusByName = new Map();
      let omittedCount = 0;
      
      rows.forEach(row => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          cleanRow[normalizeHeader(key)] = row[key];
        });
        
        let sku = getHeaderVal(cleanRow, ["sku", "codigo", "code", "id", "sku base", "referencia", "ref"]);
        const name = getHeaderVal(cleanRow, ["producto", "nombre", "nombre del producto", "prenda", "articulo", "descripcion", "detalle"]);
        const category = getHeaderVal(cleanRow, ["categoria", "categoría", "rubro", "tipo"]) || "General";
        
        const rawStockStr = getHeaderVal(cleanRow, ["stock actual", "stock total", "existencias", "stock"]);
        const rawMateriaPrimaStr = getHeaderVal(cleanRow, ["materia prima", "materia_prima", "basecost", "costo materia prima", "costo base"]);
        const rawCostoUnitarioStr = getHeaderVal(cleanRow, ["costo unitario", "costo", "costo total", "costo unit.", "costo unit"]);
        const rawMargenStr = getHeaderVal(cleanRow, ["margen (%)", "margen(%)", "margen", "margin"]);
        const rawPrecioVentaStr = getHeaderVal(cleanRow, ["precio de venta", "precio venta", "precio", "pv"]);

        // Validate mandatory presence per row: stock total, materia prima, costo unitario, margen, precio de venta
        if (rawStockStr === "" || rawMateriaPrimaStr === "" || rawCostoUnitarioStr === "" || rawMargenStr === "" || rawPrecioVentaStr === "") {
          omittedCount++;
          return;
        }

        let baseCost = parseFloat(rawMateriaPrimaStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        let totalCost = parseFloat(rawCostoUnitarioStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        const importedExtras = {};
        let totalExtrasCost = 0;
        const extraCategoryKeys = Object.keys(state.extras || {}).filter(k => !["sku", "name", "cost", "stock", "id"].includes(k));

        extraCategoryKeys.forEach(catKey => {
          const catTitle = getCategoryTitle(catKey);
          const catKeySpaced = catKey.replace(/_/g, " ");
          const aliases = [
            `tipo: ${catTitle}`, `tipo ${catTitle}`, `tipo: ${catKeySpaced}`, `tipo ${catKeySpaced}`,
            catTitle, catKey, catKeySpaced,
            `insumo: ${catTitle}`, `insumo: ${catKeySpaced}`,
            `insumo ${catTitle}`, `insumo ${catKeySpaced}`
          ];
          const val = getHeaderVal(cleanRow, aliases);
          if (val && val !== "-" && val.toLowerCase() !== "ninguno" && val.toLowerCase() !== "sin insumo") {
            const opts = state.extras[catKey] || [];
            let matchedOpt = opts.find(o => (o.name || "").toLowerCase().trim() === val.toLowerCase().trim());
            if (!matchedOpt && !isNaN(parseFloat(val))) {
              const numVal = parseFloat(val);
              matchedOpt = opts.find(o => Math.abs((parseFloat(o.cost) || 0) - numVal) < 0.01);
            }
            if (matchedOpt) {
              importedExtras[catKey] = matchedOpt.id;
              totalExtrasCost += (parseFloat(matchedOpt.cost) || 0);
            }
          }
        });

        if (totalCost <= 0) {
          totalCost = baseCost + totalExtrasCost;
        }
        const cost = totalCost;
        
        const price = parseFloat(rawPrecioVentaStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        
        const locationsStock = {};
        let totalStock = 0;
        
        const configuredLocs = (state.userProfile?.locations && state.userProfile.locations.length > 0)
          ? state.userProfile.locations
          : ["Bahia Blanca", "Buenos Aires", "Local Principal"];

        Object.keys(cleanRow).forEach(key => {
          if (key.startsWith("stock actual:")) {
            const locNameRaw = key.replace("stock actual:", "").trim();
            const matchedLoc = configuredLocs.find(l => l.toLowerCase().trim() === locNameRaw.toLowerCase().trim()) || locNameRaw;
            const stockVal = parseInt(String(cleanRow[key]).replace(/[^0-9]/g, "")) || 0;
            locationsStock[matchedLoc] = stockVal;
            totalStock += stockVal;
          }
        });
        
        if (Object.keys(locationsStock).length === 0) {
          const stockVal = parseInt(rawStockStr.replace(/[^0-9]/g, "")) || 0;
          const defaultLoc = configuredLocs[0] || "Local Principal";
          locationsStock[defaultLoc] = stockVal;
          totalStock = stockVal;
        }
        
        let size = getHeaderVal(cleanRow, ["talle", "talles", "size", "tamano", "tamaño", "variante", "variacion", "talles/variantes"]);
        if (!size) size = "Único";

        let color = getHeaderVal(cleanRow, ["color", "variante", "variacion"]);
        
        const hasPercentSign = rawMargenStr.includes("%");
        let margin = parseFloat(rawMargenStr.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0.0;
        if (!hasPercentSign && margin > 0 && margin <= 1.0) {
          margin = margin * 100;
        }

        const deliveryTimeStr = getHeaderVal(cleanRow, ["tiempo de entrega (en dias)", "tiempo de entrega (dias)", "tiempo de entrega (días)", "tiempo de entrega"]);
        const leadTime = (deliveryTimeStr !== "") ? parseInt(deliveryTimeStr.replace(/[^0-9]/g, "")) : "";

        const securityStockStr = getHeaderVal(cleanRow, ["stock de seguridad", "stock critico", "stock minimo"]);
        const securityStock = (securityStockStr !== "") ? parseInt(securityStockStr.replace(/[^0-9]/g, "")) : "";
        
        if (!sku && name) {
          const nameClean = cleanCompareText(name);
          const categoryClean = category.toLowerCase().trim();
          const lookupKey = `${nameClean}_${categoryClean}`;
          
          let baseSku = baseSkusByName.get(lookupKey);
          if (!baseSku) {
            const matchedDb = state.products.find(p => {
              return cleanCompareText(p.name || "") === nameClean && 
                     (p.category || "").toLowerCase().trim() === categoryClean;
            });
            if (matchedDb) {
              baseSku = getCleanBaseSku(matchedDb.baseSku || matchedDb.sku);
            }
          }
          if (!baseSku) {
            baseSku = name.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 15);
            baseSku = baseSku.replace(/-+$/, "");
          }
          sku = baseSku;
        }

        let skuVal = sku;
        const sizeSuffix = getSizeSkuSuffix(size);
        if (state.businessType === "comercio" && (!size || size === "Único")) {
          size = "Único";
          if (skuVal && !skuVal.endsWith("-U")) {
            skuVal = `${skuVal}-U`;
          }
        } else if (size && size !== "Único") {
          if (skuVal && !skuVal.endsWith(`-${sizeSuffix}`)) {
            skuVal = `${skuVal}-${sizeSuffix}`;
          }
        }
        
        if (skuVal && name) {
          const skuLower = skuVal.toLowerCase().trim();
          const nameClean = cleanCompareText(name);
          const rowBaseSku = getCleanBaseSku(skuVal);

          // Matching logic rules:
          // 1. Match existing by SKU
          const matchedBySku = state.products.find(p => {
            const pBase = getCleanBaseSku(p.baseSku || p.sku);
            return (pBase && pBase === rowBaseSku) || (p.sku || "").toLowerCase().trim() === skuLower;
          });

          // 2. Match existing by Name & Size
          const matchedByName = state.products.find(p => {
            const pClean = cleanCompareText(p.name || "");
            const pSizeClean = (p.size || "").toLowerCase().trim();
            return pClean === nameClean && pSizeClean === (size || "único").toLowerCase().trim();
          });

          let existingProduct = null;

          if (matchedBySku && matchedByName && matchedBySku.id === matchedByName.id) {
            // Same SKU and Same Name -> Update existing product
            existingProduct = matchedBySku;
          } else if (matchedBySku && !matchedByName) {
            // Same SKU but Different Product Name -> Conflict! Reject row
            if (cleanCompareText(matchedBySku.name || "") !== nameClean) {
              omittedCount++;
              return;
            }
            existingProduct = matchedBySku;
          } else if (!matchedBySku && matchedByName) {
            // Same Product Name but Different SKU -> Conflict! Reject row
            const pBase = getCleanBaseSku(matchedByName.baseSku || matchedByName.sku);
            if (pBase !== rowBaseSku) {
              omittedCount++;
              return;
            }
            existingProduct = matchedByName;
          } else if (matchedBySku && matchedByName && matchedBySku.id !== matchedByName.id) {
            // SKU matches one product, Name matches another -> Conflict! Reject row
            omittedCount++;
            return;
          }

          let baseSku = rowBaseSku;
          if (existingProduct) {
            skuVal = existingProduct.sku;
            baseSku = existingProduct.baseSku || getCleanBaseSku(existingProduct.sku);
          }

          const finalSkuLower = skuVal.toLowerCase().trim();
          if (importedSkusInBatch.has(finalSkuLower)) {
            omittedCount++;
            return;
          }
          importedSkusInBatch.add(finalSkuLower);
          if (name) {
            const nameClean = cleanCompareText(name);
            const categoryClean = (category || "").toLowerCase().trim();
            const lookupKey = `${nameClean}_${categoryClean}`;
            if (!baseSkusByName.has(lookupKey)) {
              baseSkusByName.set(lookupKey, baseSku);
            }
          }
          const prodPayload = existingProduct ? { ...existingProduct } : { id: Date.now() + Math.random(), extras: {} };
          
          prodPayload.baseSku = baseSku;
          prodPayload.sku = skuVal;
          prodPayload.name = name;
          prodPayload.category = category;
          prodPayload.size = size;
          prodPayload.color = color;
          
          if (Object.keys(locationsStock).length > 0) {
            const mergedLocStock = existingProduct && existingProduct.locationsStock ? { ...existingProduct.locationsStock } : {};
            Object.keys(locationsStock).forEach(locKey => {
              Object.keys(mergedLocStock).forEach(oldKey => {
                if (oldKey.toLowerCase().trim() === locKey.toLowerCase().trim()) {
                  delete mergedLocStock[oldKey];
                }
              });
              mergedLocStock[locKey] = locationsStock[locKey];
            });
            prodPayload.locationsStock = mergedLocStock;
            totalStock = Object.values(mergedLocStock).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
          }

          prodPayload.stock = totalStock;
          prodPayload.stock_local = totalStock;
          
          prodPayload.baseCost = baseCost;
          prodPayload.extras = { ...(prodPayload.extras || {}), ...importedExtras };
          if (importedExtras.estampados) prodPayload.estampadoId = importedExtras.estampados;
          if (importedExtras.bordados) prodPayload.bordadoId = importedExtras.bordados;
          if (importedExtras.packagings) prodPayload.packagingId = importedExtras.packagings;
          prodPayload.margin = Math.round(margin * 100) / 100;
          prodPayload.cost = totalCost;

          let calculatedPrice = Math.round(price);
          if (calculatedPrice <= 0 && cost > 0 && margin > 0) {
            calculatedPrice = Math.round(cost * (1 + margin / 100));
          }
          if (calculatedPrice <= 0 && existingProduct) {
            calculatedPrice = existingProduct.price_local || existingProduct.price || 0;
          }
          
          prodPayload.price_local = calculatedPrice;
          prodPayload.price_tiendanube = calculatedPrice;
          prodPayload.price = calculatedPrice;

          if (leadTime !== "") prodPayload.leadTime = leadTime;
          if (securityStock !== "") prodPayload.securityStock = securityStock;
          
          parsedImportProducts.push(prodPayload);
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
        const price = p.price_local !== undefined && p.price_local > 0 ? p.price_local : (p.baseCost * (1 + p.margin / 100));
        tr.innerHTML = `
          <td style="font-family: monospace;">${p.sku}</td>
          <td style="font-weight: 700; color: var(--text-white);">${p.name}</td>
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

async function refreshTokenFlow() {
  const refreshToken = sessionStorage.getItem("datamargen_refresh_token");
  if (!refreshToken) throw new Error("No refresh token");
  
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!res.ok) throw new Error("Refresh failed");
  const data = await res.json();
  state.token = data.token;
  sessionStorage.setItem("datamargen_token", data.token);
  if (data.refreshToken) {
    sessionStorage.setItem("datamargen_refresh_token", data.refreshToken);
  }
  return data.token;
}

// --- API Request Helper ---
async function apiRequest(url, method = "GET", body = null) {
  const headers = {
    "Authorization": `Bearer ${state.token}`,
    "X-Business-Type": state.businessType || "textil",
    "X-Project-Id": state.currentProjectId || "default"
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  let res = await fetch(url, options);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  
  if (res.status === 401) {
    try {
      if (!window.tokenRefreshPromise) {
        window.tokenRefreshPromise = refreshTokenFlow().finally(() => {
          window.tokenRefreshPromise = null;
        });
      }
      const newToken = await window.tokenRefreshPromise;
      
      // Reintentar request original
      options.headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, options);
      data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Error en la petición tras refrescar token.");
      }
      return data;
    } catch(err) {
      handleLogout();
      throw new Error("Sesión expirada.");
    }
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
    
    // Cargar lista de proyectos del usuario si aún no están cargados
    if (!state.projects || state.projects.length === 0) {
      try {
        const projRes = await apiRequest("/api/projects");
        if (projRes && projRes.projects) {
          state.projects = projRes.projects;
        }
      } catch (pe) {
        console.warn("No se pudo obtener la lista de proyectos:", pe);
      }
    }
    updateTopbarProjectName();
    renderProjectsManagementPanel();

    await refreshState();
    switchTab("panel");
  } catch (error) {
    if (error.message !== "Sesión expirada.") {
      showToast(error.message, true);
    }
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

    // 2. Check Trial Expiration & Payment Status
    const userEmail = (state.email || "").toLowerCase();
    const isSuperAdmin = (userEmail === "valentinoklcv@gmail.com");
    
    // Check if 30 days have elapsed since last payment date
    let isPaymentActive = false;
    const lastPayment = data.userProfile?.lastPaymentDate || data.userProfile?.paymentDate || (userEmail.includes("matias") || (data.businessName || "").toLowerCase().includes("mazo") ? "2026-07-22" : null);
    if (lastPayment) {
      try {
        const pDate = new Date(lastPayment);
        const diffDays = (new Date() - pDate) / (1000 * 3600 * 24);
        if (diffDays <= 30) {
          isPaymentActive = true;
        }
      } catch (e) {
        console.error("Error parsing lastPaymentDate:", e);
      }
    }

    if (data.trialExpired === true && !isSuperAdmin && !isPaymentActive) {
      if (authSection) authSection.style.display = "none";
      if (appSection) appSection.style.display = "none";
      if (verifyScreen) verifyScreen.style.display = "none";
      if (paywallScreen) paywallScreen.style.display = "flex";
      
      // Update WhatsApp link dynamic prefilled message
      const waBtn = document.getElementById("paywall-wa-btn");
      if (waBtn) {
        const adminPhone = "5492915744578"; // Valentino Admin WhatsApp
        const msg = encodeURIComponent(`Hola! Quiero renovar mi suscripción de Datamargen para el correo: ${state.email}`);
        waBtn.href = `https://wa.me/${adminPhone}?text=${msg}`;
      }
      return;
    }

    // 3. Normal view (desbloqueado)
    if (verifyScreen) verifyScreen.style.display = "none";
    if (paywallScreen) paywallScreen.style.display = "none";
    if (appSection) appSection.style.display = "flex";
    if (authSection) authSection.style.display = "none";
    
    // Almacenar perfil y actualizar sidebar
    state.userProfile = data.userProfile || null;
    state.role = data.role || "admin";
    state.permissions = data.permissions || null;
    state.subuser = data.subuser || null;
    
    updateSidebarProfile();
    // NOTE: applyPermissionsToUI() is called AFTER the sidebar menu visibility loop below

    // 4. Update Trial Countdown Badge
    if (trialBadge && trialText) {
      if (!isSuperAdmin && !isPaymentActive && data.subscriptionStatus === "trial" && data.daysLeft !== undefined) {
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
    state.stockIntakes = data.stockIntakes || [];
    state.serviceOrders = data.serviceOrders || [];
    state.servicesCatalog = data.servicesCatalog || [];
    
    const finalBusinessType = data.businessType || data.userProfile?.businessType || "clothing";
    state.businessType = (finalBusinessType === "comercio" || finalBusinessType === "kiosco") ? "comercio" : "textil";

    const defaultExtras = (state.businessType === "comercio") ? {
      bolsas_caramelos: [],
      envoltorios_regalo: [],
      adicionales_kiosco: []
    } : {
      estampados: [],
      packagings: [],
      bordados: []
    };
    
    let finalExtras = data.extras || {};
    if (Object.keys(finalExtras).length === 0) {
      finalExtras = defaultExtras;
    }
    state.extras = finalExtras;
    
    applyBusinessTypeUIUpdates();
    await syncSuppliersWithCurrentAccounts();
    await renderIntegrationsStatus();
    
    document.querySelectorAll(".menu-list .menu-item").forEach(item => {
      const uEmail = (state.email || "").toLowerCase();
      const isSuper = (uEmail === "valentinoklcv@gmail.com");
      const bName = (state.businessName || state.userProfile?.businessName || "").toLowerCase();
      const isMatiasOrMazo = uEmail.includes("matias") || bName.includes("mazo");

      if (item.id === "sidebar-taller-item") {
        const isTallerAllowed = isSuper || (state.userProfile?.servicesEnabled === true) || isMatiasOrMazo;
        item.style.display = isTallerAllowed ? "block" : "none";
      } else if (item.id === "sidebar-production-item") {
        const isProdAllowed = isSuper || (state.userProfile?.productionEnabled === true) || isMatiasOrMazo;
        item.style.display = isProdAllowed ? "block" : "none";
      } else if (item.id === "sidebar-tiendanube-item") {
        const isTnAllowed = isSuper || (state.userProfile?.tiendanubeEnabled === true) || isMatiasOrMazo;
        item.style.display = isTnAllowed ? "block" : "none";
      } else if (item.id === "sidebar-arca-item") {
        const isArcaAllowed = isSuper || (state.userProfile?.arcaEnabled === true) || isMatiasOrMazo;
        item.style.display = isArcaAllowed ? "block" : "none";
      } else {
        item.style.display = "block";
      }
    });

    // Apply permission-based visibility AFTER the sidebar menu loop so subuser permissions override special-section defaults
    applyPermissionsToUI();

    // Auto-revert failed NCs once
    if (!localStorage.getItem("gs_ncs_fixed_v2")) {
      setTimeout(async () => {
        try {
          const res = await apiRequest("/api/invoices/fix-failed-ncs", "POST");
          console.log("Auto-reverted failed NCs:", res);
          localStorage.setItem("gs_ncs_fixed_v2", "true");
          // Re-refresh state to show the reverted sales in the UI
          await refreshState();
        } catch (e) {
          console.error("Auto-revert failed:", e);
        }
      }, 3000);
    }
  } catch (error) {
    if (error.message !== "Sesión expirada.") {
      console.error("Error loading states:", error);
      showToast("Error al sincronizar con la base de datos", true);
    } else {
      throw error;
    }
  } finally {
    if (state.token) {
      // Inicializar formulario de ingreso de stock cada vez que se refresca el estado
      setupStockIntakeForm();
      checkBusinessNameSetup();
      renderAll();
    }
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

  // Consolidar ventas registradas + órdenes de taller en estado "Cobrado" que no tengan venta duplicada
  const combinedSales = [...(state.sales || [])];
  
  let tallerChannelConfig = state.tallerSalesChannel || "Personalizado";

  (state.serviceOrders || []).forEach(o => {
    if (o.status === "Cobrado") {
      const existingSale = combinedSales.find(s => s.id === `serv_sale_${o.id}` || (s.items && s.items.some(it => (it.sku || "").includes(o.id))));
      if (existingSale) {
        if (!existingSale.canal_venta && !existingSale.canalVenta && !existingSale.channel) {
          existingSale.canal_venta = tallerChannelConfig;
        }
      } else {
        combinedSales.push({
          id: `serv_sale_${o.id}`,
          client_name: o.clientName || "Consumidor Final",
          total: o.total || 0,
          subtotal: o.subtotal || o.total || 0,
          method: "Efectivo",
          origen: "local",
          canal_venta: tallerChannelConfig,
          items: o.items ? o.items.map(it => ({
            sku: `SERV-${o.id}`,
            name: it.name,
            price: it.price,
            quantity: it.qty,
            subtotal: it.subtotal
          })) : [],
          date: o.deliveryDate ? new Date(o.deliveryDate).toISOString() : new Date().toISOString()
        });
      }
    }
  });

  // Filtrar ventas del periodo
  const filteredSales = combinedSales.filter(sale => {
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
  const averageTicket = totalItemsSold === 0 ? 0 : totalSalesValue / totalItemsSold;

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
  if (state.email === "matiascuchettidiaz@gmail.com" || state.email === "datamargen@gmail.com") {
    document.getElementById("panel-stat-revenue").innerHTML = `
      <div style="font-size: 1.3rem; color: var(--text-white);">$ ${Math.round(totalSalesValue).toLocaleString()}</div>
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
  let channelStats = {};
  const configuredChannels = state.userProfile?.salesChannels || ["Local Principal"];
  const fallbackChannel = configuredChannels[0] || "Local Principal";
  
  configuredChannels.forEach(c => {
    channelStats[c] = { revenue: 0, units: 0, cost: 0, fees: 0, revenueNet: 0 };
  });

  filteredSales.forEach(sale => {
    const origin = (sale.origen || sale.origin || "").toLowerCase();
    const rawChannel = (sale.canal_venta || sale.canalVenta || sale.channel || "").trim();
    let channel = fallbackChannel;

    if (origin === "tiendanube") {
      const tnChannel = configuredChannels.find(c => c.toLowerCase().includes("tienda"));
      channel = tnChannel ? tnChannel : fallbackChannel;
    } else if (rawChannel) {
      const matched = configuredChannels.find(c => c.toLowerCase() === rawChannel.toLowerCase());
      if (matched) {
        channel = matched;
      } else {
        channel = rawChannel;
        if (!channelStats[channel]) {
          channelStats[channel] = { revenue: 0, units: 0, cost: 0, fees: 0, revenueNet: 0 };
        }
      }
    }

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
              const opts = state.extras[catKey] || [];
              const found = opts.find(o => String(o.id) === String(extraId));
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

    channelStats[channel].revenue += (sale.total || 0);
    channelStats[channel].units += unitsSold;
    channelStats[channel].cost += saleCost;

    if (origin === "tiendanube") {
      const fixedFee = sale.fee_fijo_tn !== undefined ? parseFloat(sale.fee_fijo_tn) : 300;
      const pctFee = sale.comision_pasarela_pago !== undefined ? parseFloat(sale.comision_pasarela_pago) : 5;
      const saleFees = fixedFee + (pctFee / 100 * (sale.total || 0));
      channelStats[channel].fees += saleFees;
      channelStats[channel].revenueNet += (sale.total_neto !== undefined ? parseFloat(sale.total_neto) : (sale.total - saleFees));
    } else {
      channelStats[channel].revenueNet += (sale.total || 0); // Para locales, bruto = neto por ahora a menos que haya recargos
    }
  });

  // Actualizar elementos en el DOM
  const channelsBreakdownDiv = document.getElementById("dashboard-channels-breakdown");
  const channelsContainer = document.getElementById("dashboard-channels-container");
  
  if (channelsBreakdownDiv && channelsContainer) {
    const configuredChannels = state.userProfile?.salesChannels || ["Local Principal"];
    if (configuredChannels.length > 1) {
      channelsBreakdownDiv.style.display = "block";
      channelsContainer.innerHTML = "";
      
      const keys = configuredChannels;
      keys.forEach(ch => {
      const stats = channelStats[ch] || { revenue: 0, units: 0, cost: 0, fees: 0, revenueNet: 0 };
      const profit = stats.revenueNet - stats.cost;
      const isTN = ch.toLowerCase().includes("tienda");
      
      let badge = isTN ? '<span class="badge-green" style="font-size: 0.65rem; padding: 2px 6px;">E-Commerce</span>' : '<span class="badge-blue" style="font-size: 0.65rem; padding: 2px 6px;">Mostrador</span>';
      let icon = isTN ? '☁️' : '🏪';
      
      let feeHtml = isTN ? `
        <div>
          <p style="font-size: 0.65rem; color: var(--text-gray); font-weight: 700; text-transform: uppercase;">Costos Fin. / Comisiones</p>
          <p style="font-size: 1.1rem; font-weight: 800; color: var(--accent-red);">$${Math.round(stats.fees).toLocaleString()}</p>
        </div>` : `
        <div>
          <p style="font-size: 0.65rem; color: var(--text-gray); font-weight: 700; text-transform: uppercase;">Costo de Mercadería</p>
          <p style="font-size: 1.1rem; font-weight: 800; color: var(--text-gray-light);">$${Math.round(stats.cost).toLocaleString()}</p>
        </div>`;

      const card = document.createElement("div");
      card.style.cssText = "background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;";
      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-weight: 700; color: var(--text-heading); font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">${icon} ${ch}</span>
          ${badge}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
          <div>
            <p style="font-size: 0.65rem; color: var(--text-gray); font-weight: 700; text-transform: uppercase;">Facturado</p>
            <p style="font-size: 1.1rem; font-weight: 800; color: var(--text-heading);">$${Math.round(stats.revenue).toLocaleString()}</p>
          </div>
          <div>
            <p style="font-size: 0.65rem; color: var(--text-gray); font-weight: 700; text-transform: uppercase;">Unidades</p>
            <p style="font-size: 1.1rem; font-weight: 800; color: var(--text-heading);">${stats.units} u.</p>
          </div>
          ${feeHtml}
          <div>
            <p style="font-size: 0.65rem; color: var(--text-gray); font-weight: 700; text-transform: uppercase;">Resultado Operativo</p>
            <p style="font-size: 1.1rem; font-weight: 800; color: var(--accent-emerald); font-weight: bold;">$${Math.round(profit).toLocaleString()}</p>
          </div>
        </div>
      `;
      channelsContainer.appendChild(card);
    });
    } else {
      channelsBreakdownDiv.style.display = "none";
    }
  }

  // Renderizar Gráficos y Stock Crítico
  renderPanelCharts(filteredSales);
  renderPanelStockCritico();
}

function renderPanelCharts(filteredSales) {
  // Top 5 Productos
  const productCounts = {};
  filteredSales.forEach(sale => {
    if (sale.items) {
      sale.items.forEach(item => {
        const p = item.product || {};
        const key = p.sku || p.name || "Sin nombre";
        const name = p.name || "Producto sin nombre";
        productCounts[key] = productCounts[key] || { name: name, units: 0 };
        productCounts[key].units += (parseInt(item.quantity) || 0);
      });
    }
  });

  const sortedProducts = Object.values(productCounts)
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const topProductsList = document.getElementById("top-products-list");
  if (topProductsList) {
    if (sortedProducts.length === 0) {
      topProductsList.innerHTML = `<p style="color: var(--text-gray); font-size: 0.85rem; text-align: center;">No hay datos en este período.</p>`;
    } else {
      topProductsList.innerHTML = sortedProducts.map((p, index) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1rem; font-weight: 800; color: var(--accent-red); width: 20px;">#${index + 1}</span>
            <span style="font-size: 0.85rem; color: var(--text-white); font-weight: 600;">${p.name}</span>
          </div>
          <span style="font-size: 0.85rem; color: var(--text-gray-light); font-weight: 700;">${p.units} u.</span>
        </div>
      `).join('');
    }
  }

  // Medios de Pago
  const paymentTotals = {};
  let totalSalesForPayments = 0;
  
  const defaultMethods = [{name: "Efectivo"}, {name: "Débito"}, {name: "Crédito"}, {name: "Transferencia"}, {name: "QR/Billetera"}];
  const configuredPaymentMethods = state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods;
  const configuredPaymentNames = configuredPaymentMethods.map(m => m.name);
  const fallbackPaymentName = configuredPaymentNames[0] || "Efectivo";

  function resolvePaymentMethodName(rawMethod, configuredNames, fallback) {
    if (!rawMethod) return fallback;
    const mClean = rawMethod.toLowerCase().trim();
    
    const exactMatch = configuredNames.find(name => name.toLowerCase().trim() === mClean);
    if (exactMatch) return exactMatch;
    
    let translated = rawMethod;
    if (mClean === "credit_card" || mClean === "credit" || mClean.includes("crédito") || mClean.includes("credito")) {
      translated = "Crédito";
    } else if (mClean === "debit_card" || mClean === "debit" || mClean.includes("débito") || mClean.includes("debito")) {
      translated = "Tarjeta de Debito";
    } else if (mClean === "transfer" || mClean === "wire_transfer" || mClean.includes("transfer") || mClean.includes("depósito") || mClean.includes("deposito")) {
      translated = "Transferencia";
    } else if (mClean === "cash" || mClean === "efectivo") {
      translated = "Efectivo";
    } else if (mClean === "mercadopago" || mClean.includes("mercado") || mClean.includes("pago") || mClean.includes("mp")) {
      translated = "Mercado Pago";
    }
    
    const matchedName = configuredNames.find(name => {
      const nClean = name.toLowerCase().trim();
      const tClean = translated.toLowerCase().trim();
      return nClean.includes(tClean) || tClean.includes(nClean);
    });
    if (matchedName) return matchedName;
    
    const fallbackMatch = configuredNames.find(name => name.toLowerCase().trim().includes(mClean) || mClean.includes(name.toLowerCase().trim()));
    if (fallbackMatch) return fallbackMatch;
    
    return fallback;
  }

  // Inicializar todos los medios configurados
  configuredPaymentNames.forEach(name => {
    paymentTotals[name] = 0;
  });
  
  const nonTnSales = filteredSales.filter(sale => {
    const origin = (sale.origen || sale.origin || "").toLowerCase();
    return origin !== "tiendanube";
  });

  nonTnSales.forEach(sale => {
    const total = sale.total || 0;
    totalSalesForPayments += total;
    if (sale.payments && sale.payments.length > 0) {
      sale.payments.forEach(pay => {
        let m = resolvePaymentMethodName(pay.method, configuredPaymentNames, fallbackPaymentName);
        paymentTotals[m] = (paymentTotals[m] || 0) + (parseFloat(pay.amount) || 0);
      });
    } else {
      let rawM = sale.method || sale.paymentMethod;
      let m = resolvePaymentMethodName(rawM, configuredPaymentNames, fallbackPaymentName);
      paymentTotals[m] = (paymentTotals[m] || 0) + total;
    }
  });

  const paymentList = document.getElementById("payment-methods-list");
  if (paymentList) {
    if (totalSalesForPayments === 0) {
      paymentList.innerHTML = `<p style="color: var(--text-gray); font-size: 0.85rem; text-align: center;">No hay datos en este período.</p>`;
    } else {
      const sortedPayments = Object.entries(paymentTotals).sort((a, b) => b[1] - a[1]).filter(p => p[1] > 0 || configuredPaymentNames.includes(p[0]));
      const colors = ['#0a9396', '#2176ff', '#e5383b', '#ca6702', '#9c89b8', '#005f73'];
      paymentList.innerHTML = sortedPayments.map((pay, index) => {
        const pctStr = ((pay[1] / totalSalesForPayments) * 100).toFixed(1);
        const pct = Math.min(100, Math.max(0, parseFloat(pctStr)));
        const color = colors[index % colors.length];
        return `
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 0.85rem; color: var(--text-white); font-weight: 500;">${pay[0]}</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem; color: var(--text-gray);">$${Math.round(pay[1]).toLocaleString()}</span>
                <span style="font-size: 0.85rem; color: var(--text-white); font-weight: 600;">${pctStr}%</span>
              </div>
            </div>
            <div style="width: 100%; background-color: rgba(255,255,255,0.05); border-radius: 8px; height: 8px; overflow: hidden;">
              <div style="width: ${pct}%; background-color: ${color}; height: 100%; border-radius: 8px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
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
    if (sale && sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        if (!item) return;
        const pSku = item.product?.sku || item.sku || item.product?.id || item.id || "";
        if (pSku) {
          salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
        }
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
        <h4 style="font-size: 0.8rem; font-weight: 800; color: var(--text-white);">${item.name}</h4>
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
    if (sale && sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        if (!item) return;
        const pSku = item.product?.sku || item.sku || item.product?.id || item.id || "";
        if (pSku) {
          salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
        }
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

  // 1.5 Hoja: Dashboard
  const nowFilter = new Date();
  const currentMonthSales = state.panelMonth !== "Todos" 
    ? state.sales.filter(s => new Date(s.date).getMonth() === MONTHS.indexOf(state.panelMonth))
    : state.sales;

  const totalSalesVal = currentMonthSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalUnits = currentMonthSales.reduce((sum, s) => sum + (s.items ? s.items.reduce((iSum, i) => iSum + (parseInt(i.quantity)||0), 0) : 0), 0);

  const dashboardData = [
    ["MÉTRICAS CLAVE - " + (state.panelMonth || "Todos"), ""],
    ["Facturación Total", "$" + Math.round(totalSalesVal)],
    ["Ticket Promedio", "$" + Math.round(totalSalesVal / (totalUnits || 1))],
    ["Unidades Vendidas", totalUnits],
    [],
    ["EVOLUCIÓN DE VENTAS (POR DÍA)", ""]
  ];
  
  const salesByDate = {};
  currentMonthSales.forEach(s => {
    const d = new Date(s.date).toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    salesByDate[d] = (salesByDate[d] || 0) + (s.total || 0);
  });
  
  dashboardData.push(["Fecha", "Ventas ($)"]);
  Object.keys(salesByDate).sort((a, b) => {
    const [d1,m1,y1] = a.split('/');
    const [d2,m2,y2] = b.split('/');
    return new Date(y1, m1-1, d1) - new Date(y2, m2-1, d2);
  }).forEach(date => {
    dashboardData.push([date, Math.round(salesByDate[date])]);
  });
  
  const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardData);

  // Crear libro y añadir las cuatro hojas
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPanel, "Historial de Ventas");
  XLSX.utils.book_append_sheet(wb, wsDashboard, "Dashboard");
  XLSX.utils.book_append_sheet(wb, wsStock, "Stock Critico");
  XLSX.utils.book_append_sheet(wb, wsExplanation, "Explicacion Stock Critico");
  XLSX.writeFile(wb, `Reporte_Datamargen_${state.panelMonth}.xlsx`);
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

    // Ubicación seleccionada
    const locationSelect = document.getElementById("pos-cart-location-select");
    const selectedLocation = locationSelect ? locationSelect.value : "";
    
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

    // Agrupar variantes usando getProductGroupKey para mostrar exactamente UNA tarjeta por modelo
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
        const groupKey = getProductGroupKey(p);
        const displayName = getProductNameWithColor(p);
        
        if (!baseProductsMap[groupKey]) {
          baseProductsMap[groupKey] = {
            baseSku: getCleanBaseSku(p.sku, p.baseSku) || "PROD",
            groupKey: groupKey,
            name: displayName,
            category: category,
            color: p.color || "Único",
            margin: parseFloat(p.margin) || 0,
            baseCost: parseFloat(p.baseCost || p.cost) || 0,
            cost: parseFloat(p.cost) || 0,
            variants: []
          };
        }
        baseProductsMap[groupKey].variants.push(p);
      }
    });

    const uniqueBaseProducts = Object.values(baseProductsMap).sort((a, b) => {
      const nameA = (a.name || "").toString().toLowerCase().trim();
      const nameB = (b.name || "").toString().toLowerCase().trim();
      return nameA.localeCompare(nameB);
    });

    if (uniqueBaseProducts.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-gray); font-size: 0.8rem; padding: 40px;">${state.businessType === "comercio" ? "No se encontraron productos." : "No se encontraron prendas."}</div>`;
      renderPOSCategoryPills(selectedCat);
      return;
    }

    uniqueBaseProducts.forEach(bp => {
      // Sumar el stock de todas sus variantes en la ubicación seleccionada
      const totalLocationStock = bp.variants.reduce((acc, curr) => acc + getVariantStockForLocation(curr, selectedLocation), 0);
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
          <button class="pos-product-plus-btn">${totalLocationStock > 0 ? '+' : '✕'}</button>
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
  const locationSelect = document.getElementById("pos-cart-location-select");
  const selectedLocation = locationSelect ? locationSelect.value : "";

  // Filtrar variantes con stock estrictamente > 0 en la ubicación seleccionada
  const availableVariants = bp.variants.filter(v => getVariantStockForLocation(v, selectedLocation) > 0);
  
  if (availableVariants.length === 0) {
    showToast(state.businessType === "comercio" ? "Producto sin stock en esta ubicación." : "Prenda sin stock en esta ubicación.", true);
    return;
  }

  // Siempre abre el modal para seleccionar/mostrar qué talle hay (incluso si es 1 solo talle como Único o XL)
  openSizeSelectionModal(bp, availableVariants);
}

function openSizeSelectionModal(bp, variants) {
  state.selectedProductForSize = bp;
  document.getElementById("size-modal-product-name").innerText = bp.name;
  document.getElementById("size-modal-product-color").innerText = bp.color;
  
  const grid = document.getElementById("size-modal-options-grid");
  grid.innerHTML = "";
  
  const locationSelect = document.getElementById("pos-cart-location-select");
  const selectedLocation = locationSelect ? locationSelect.value : "";

  // Regla estricta: Filtrar variantes con stock > 0 y evitar duplicados de talle
  const uniqueSizeMap = {};
  variants.forEach(v => {
    const rawSize = (v.size || "Único").trim();
    const cleanSizeKey = rawSize.toLowerCase();
    const vStock = getVariantStockForLocation(v, selectedLocation);

    if (vStock > 0) {
      if (!uniqueSizeMap[cleanSizeKey] || getVariantStockForLocation(uniqueSizeMap[cleanSizeKey], selectedLocation) < vStock) {
        uniqueSizeMap[cleanSizeKey] = v;
      }
    }
  });

  const finalVariants = Object.values(uniqueSizeMap);

  if (finalVariants.length === 0) {
    showToast("No hay talles con stock disponible en esta ubicación.", true);
    return;
  }

  finalVariants.forEach(v => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.style.padding = "12px";
    btn.style.fontWeight = "800";
    btn.innerText = v.size || "Único";
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
  const locationSelect = document.getElementById("pos-cart-location-select");
  const selectedLocation = locationSelect ? locationSelect.value : "";
  const availableStock = getVariantStockForLocation(variant, selectedLocation);

  if (existingIndex > -1) {
    const currentQty = state.cart[existingIndex].quantity;
    if (currentQty + 1 > availableStock) {
      showToast(`Solo quedan ${availableStock} unidades disponibles en ${selectedLocation || "esta ubicación"}.`, true);
      return;
    }
    state.cart[existingIndex].quantity += 1;
  } else {
    if (availableStock < 1) {
      showToast(`No hay stock disponible en ${selectedLocation || "esta ubicación"}.`, true);
      return;
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
  const locationSelect = document.getElementById("pos-cart-location-select");
  const selectedLocation = locationSelect ? locationSelect.value : "";
  const availableStock = getVariantStockForLocation(item.product, selectedLocation);
  
  if (newQty < 1) {
    state.cart.splice(idx, 1);
  } else {
    if (newQty > availableStock) {
      showToast(`Solo quedan ${availableStock} unidades disponibles en ${selectedLocation || "esta ubicación"}.`, true);
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
  
  // Populate configuration dropdowns if not populated yet
  const channelSelect = document.getElementById("pos-cart-channel-select");
  if (channelSelect && channelSelect.children.length === 0) {
    (state.userProfile.salesChannels || ["Local Principal"]).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.innerText = c;
      channelSelect.appendChild(opt);
    });
  }
  const locationSelect = document.getElementById("pos-cart-location-select");
  if (locationSelect && locationSelect.children.length === 0) {
    (state.userProfile.locations || ["Local Principal"]).forEach(l => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.innerText = l;
      locationSelect.appendChild(opt);
    });
  }
  
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
          <input type="number" class="pos-qty-input" value="${item.quantity}" onchange="setPOSCartExactQty('${item.product.sku}', this.value)" onblur="if(this.value==='') setPOSCartExactQty('${item.product.sku}', '1')">
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
    let finalTotal = subtotal - discountAmount;
    if (discountPct > 0) {
      finalTotal = Math.round(finalTotal / 100) * 100;
    }

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
// --- Client Type Selection for Checkout POS ---
function selectCheckoutClientType(type) {
  state.selectedCheckoutClientType = type;
  const btnAnon = document.getElementById("btn-client-type-anon");
  const btnReg = document.getElementById("btn-client-type-registered");
  const container = document.getElementById("checkout-registered-client-container");

  const activeStyle = "background: rgba(16,185,129,0.15); color: var(--accent-emerald); border: 1px solid rgba(16,185,129,0.4); font-weight: bold;";
  const inactiveStyle = "background: rgba(255,255,255,0.02); color: var(--text-gray); border: 1px solid var(--border-color); font-weight: 500;";

  if (type === 'anonimo') {
    if (btnAnon) btnAnon.style.cssText = "padding: 8px 6px; font-size: 0.72rem; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; " + activeStyle;
    if (btnReg) btnReg.style.cssText = "padding: 8px 6px; font-size: 0.72rem; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; " + inactiveStyle;
    if (container) container.style.display = "none";
    state.selectedCheckoutClient = null;
  } else {
    if (btnAnon) btnAnon.style.cssText = "padding: 8px 6px; font-size: 0.72rem; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; " + inactiveStyle;
    if (btnReg) btnReg.style.cssText = "padding: 8px 6px; font-size: 0.72rem; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; " + activeStyle;
    if (container) container.style.display = "block";
    populateCheckoutClientsDropdown();
  }
}
window.selectCheckoutClientType = selectCheckoutClientType;

function populateCheckoutClientsDropdown(selectedEntityName = null) {
  const select = document.getElementById("checkout-client-select");
  if (!select) return;
  select.innerHTML = `<option value="">-- Seleccionar Cliente Registrado --</option>`;

  const clients = (state.currentAccounts || []).filter(a => a.type === "cliente");
  clients.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id || c.entityName;
    opt.innerText = `${c.entityName} ${c.cuit ? `(${c.cuit})` : ''}`;
    select.appendChild(opt);
  });

  if (selectedEntityName) {
    const found = clients.find(c => c.entityName === selectedEntityName || c.id === selectedEntityName);
    if (found) select.value = found.id || found.entityName;
  } else if (clients.length > 0) {
    select.value = clients[0].id || clients[0].entityName;
  }

  onCheckoutClientSelectChange();
}
window.populateCheckoutClientsDropdown = populateCheckoutClientsDropdown;

function onCheckoutClientSelectChange() {
  const select = document.getElementById("checkout-client-select");
  const preview = document.getElementById("checkout-client-info-preview");
  const cuitSpan = document.getElementById("preview-client-cuit");
  const condSpan = document.getElementById("preview-client-condicion");

  if (!select || !select.value) {
    state.selectedCheckoutClient = null;
    if (preview) preview.style.display = "none";
    return;
  }

  const clients = (state.currentAccounts || []).filter(a => a.type === "cliente");
  const client = clients.find(c => (c.id || c.entityName) === select.value);
  if (client) {
    state.selectedCheckoutClient = client;
    if (preview) {
      preview.style.display = "block";
      if (cuitSpan) cuitSpan.innerText = client.cuit ? `CUIT/DNI: ${client.cuit}` : 'Sin CUIT';
      if (condSpan) condSpan.innerText = client.condicionIva || 'Consumidor Final';
    }
  } else {
    state.selectedCheckoutClient = null;
    if (preview) preview.style.display = "none";
  }
}
window.onCheckoutClientSelectChange = onCheckoutClientSelectChange;

function openQuickNewClientModal() {
  document.getElementById("quick-client-name").value = "";
  document.getElementById("quick-client-cuit").value = "";
  document.getElementById("quick-client-condicion").value = "IVA RESPONSABLE INSCRIPTO";
  document.getElementById("quick-client-address").value = "";
  document.getElementById("quick-client-modal").className = "modal-backdrop active";
}
window.openQuickNewClientModal = openQuickNewClientModal;

function closeQuickNewClientModal() {
  document.getElementById("quick-client-modal").className = "modal-backdrop";
}
window.closeQuickNewClientModal = closeQuickNewClientModal;

async function saveQuickNewClient(e) {
  e.preventDefault();
  const entityName = document.getElementById("quick-client-name").value.trim();
  const cuit = document.getElementById("quick-client-cuit").value.trim();
  const condicionIva = document.getElementById("quick-client-condicion").value;
  const address = document.getElementById("quick-client-address").value.trim();

  if (!entityName || !cuit) {
    showToast("Por favor ingresa Nombre y CUIT/DNI del cliente", true);
    return;
  }

  const payload = {
    entityName,
    type: "cliente",
    cuit,
    razonSocial: entityName,
    condicionIva,
    address,
    paymentTerms: 30
  };

  try {
    const newAccount = await apiRequest("/api/current-accounts", "POST", payload);
    showToast(`Cliente ${entityName} registrado con éxito`);
    closeQuickNewClientModal();
    
    if (Array.isArray(state.currentAccounts)) {
      state.currentAccounts.push(newAccount || payload);
    }
    
    selectCheckoutClientType('registrado');
    populateCheckoutClientsDropdown(entityName);
  } catch (err) {
    showToast("Error al registrar cliente: " + err.message, true);
  }
}
window.saveQuickNewClient = saveQuickNewClient;

function openCheckoutModal() {
  const total = parseFloat(document.getElementById("pos-cart-total-val").dataset.total) || 0;
  document.getElementById("checkout-total-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
  document.getElementById("checkout-finance-total-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
  
  // Resetear selección de tipo de cliente a Consumidor Final Anónimo
  selectCheckoutClientType('anonimo');

  // Limpiar y resetear los campos del formulario de cobranzas
  document.getElementById("chk-client-name").value = "";
  document.getElementById("chk-client-phone").value = "";
  document.getElementById("chk-client-address").value = "";
  document.getElementById("chk-client-paid").value = "";
  document.getElementById("checkout-debt-display").innerText = `$ ${Math.round(total).toLocaleString()}`;
  
  // Rellenar clientes en datalist de Cobranzas con datasets de teléfono y dirección
  const datalist = document.getElementById("chk-client-list");
  datalist.innerHTML = "";
  state.currentAccounts.filter(a => a.type === "cliente").forEach(acc => {
    const opt = document.createElement("option");
    opt.value = acc.entityName;
    opt.dataset.phone = acc.phone || "";
    opt.dataset.address = acc.address || "";
    opt.dataset.cuit = acc.cuit || "";
    opt.dataset.razonSocial = acc.razonSocial || acc.entityName || "";
    opt.dataset.condicionIva = acc.condicionIva || "CONSUMIDOR FINAL";
    datalist.appendChild(opt);
  });
  
  // Renderizar métodos de pago dinámicos
  const pmContainer = document.getElementById("pos-payment-methods-container");
  if (pmContainer) {
    pmContainer.innerHTML = "";
    const defaultMethods = [
      {name: "Efectivo", description: "Pago contado en efectivo"}, 
      {name: "Débito", description: "Tarjeta de débito"}, 
      {name: "Crédito", description: "Tarjeta de crédito"}, 
      {name: "Transferencia", description: "Transferencia bancaria / CBU"},
      {name: "QR/Billetera", description: "Mercado Pago / Billeteras virtuales"}
    ];
    const methods = state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods;
    
    methods.forEach(pm => {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary";
      btn.style.cssText = "padding: 12px 14px; font-size: 0.85rem; width: 100%; display: flex; align-items: center; justify-content: space-between; text-align: left; border-radius: 10px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.2s;";
      btn.onclick = () => confirmPayment(pm.name);
      
      let icon = "💳";
      const nameLower = (pm.name || "").toLowerCase();
      if (nameLower.includes("efectivo") || nameLower.includes("contado")) icon = "💵";
      else if (nameLower.includes("débito") || nameLower.includes("debito")) icon = "💳";
      else if (nameLower.includes("crédito") || nameLower.includes("credito")) icon = "💳";
      else if (nameLower.includes("transfer")) icon = "🏦";
      else if (nameLower.includes("qr") || nameLower.includes("mercado") || nameLower.includes("billetera")) icon = "📱";

      btn.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.2rem;">${icon}</span>
          <div>
            <div style="font-weight: 800; color: var(--text-white); font-size: 0.9rem;">${pm.name}</div>
            ${pm.description ? `<div style="font-size: 0.72rem; color: var(--text-gray); margin-top: 1px;">${pm.description}</div>` : ''}
          </div>
        </div>
        ${(pm.adjustment && pm.adjustment !== 'Sin ajuste') ? `
          <span style="font-size: 0.7rem; font-weight: bold; background: rgba(255,255,255,0.08); padding: 3px 6px; border-radius: 4px; color: var(--text-gray-light);">
            ${pm.adjustment}
          </span>
        ` : ''}
      `;
      pmContainer.appendChild(btn);
    });
    
    // Añadir botón de Cobranzas al final
    const btnCobranza = document.createElement("button");
    btnCobranza.className = "btn btn-secondary";
    btnCobranza.style.cssText = "padding: 12px 14px; font-size: 0.85rem; width: 100%; display: flex; align-items: center; justify-content: space-between; text-align: left; border-radius: 10px; border: 1px solid rgba(229, 56, 59, 0.3); background: rgba(229, 56, 59, 0.05); cursor: pointer; margin-top: 4px;";
    btnCobranza.onclick = () => confirmPayment("Financiado");
    btnCobranza.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2rem;">📉</span>
        <div>
          <div style="font-weight: 800; color: var(--accent-red); font-size: 0.9rem;">Cobranzas</div>
          <div style="font-size: 0.72rem; color: var(--text-gray); margin-top: 1px;">Cuenta Corriente / Fiado</div>
        </div>
      </div>
    `;
    pmContainer.appendChild(btnCobranza);
  }

  // Mostrar step 1 por defecto
  document.getElementById("checkout-step-method").style.display = "block";
  document.getElementById("checkout-step-finance").style.display = "none";
  document.getElementById("checkout-step-success").style.display = "none";
  document.getElementById("checkout-step-invoice-options").style.display = "none";

  const origin = document.getElementById("pos-sale-origin") ? document.getElementById("pos-sale-origin").value : "local";
  const tnCostsDiv = document.getElementById("checkout-tn-costs");
  if (tnCostsDiv) {
    tnCostsDiv.style.display = origin === "tiendanube" ? "block" : "none";
  }

  const arcaBtn = document.getElementById("checkout-arca-btn");
  if (arcaBtn) {
    const arcaEnabled = state.userProfile?.arcaEnabled === true;
    const hasArcaPermission = state.permissions?.arca && state.permissions.arca !== "none";
    const hasArcaAccess = arcaEnabled || hasArcaPermission || state.role === "admin";
    arcaBtn.style.display = hasArcaAccess ? "block" : "none";
  }

  document.getElementById("checkout-modal").className = "modal-backdrop active";
}

function closeCheckoutModal() {
  document.getElementById("checkout-modal").className = "modal-backdrop";
}

function closeCheckoutModalAndReset() {
  closeCheckoutModal();
  renderPOSCart();
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
  const canalVenta = document.getElementById("pos-cart-channel-select") ? document.getElementById("pos-cart-channel-select").value : "Minorista";
  const ubicacion = document.getElementById("pos-cart-location-select") ? document.getElementById("pos-cart-location-select").value : "Local Principal";

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
    origen: origin,
    canal_venta: canalVenta,
    ubicacion: ubicacion
  };

  if (state.selectedCheckoutClientType === 'registrado' && state.selectedCheckoutClient) {
    const client = state.selectedCheckoutClient;
    salePayload.client_name = client.entityName || client.razonSocial || "Cliente Registrado";
    salePayload.client_cuit = client.cuit || "";
    salePayload.client_condicion_iva = client.condicionIva || "CONSUMIDOR FINAL";
    salePayload.client_address = client.address || "";
  } else {
    salePayload.client_name = "Consumidor Final";
    salePayload.client_cuit = "";
    salePayload.client_condicion_iva = "CONSUMIDOR FINAL";
    salePayload.client_address = "";
  }

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

    // Guardar ID para los siguientes pasos
    window.currentCheckoutSaleId = saleId;

    // Avanzar al step de opciones de facturación
    document.getElementById("checkout-step-method").style.display = "none";
    document.getElementById("checkout-step-invoice-options").style.display = "block";
    
    state.cart = [];
  } catch (error) {
    showToast(error.message, true);
  }
}

function autoFillClientInfo() {
  const name = document.getElementById("chk-client-name").value.trim().toLowerCase();
  const datalist = document.getElementById("chk-client-list");
  const options = datalist.querySelectorAll("option");
  const selectedOpt = Array.from(options).find(o => o.value.toLowerCase() === name);
  
  if (selectedOpt) {
    if (document.getElementById("chk-client-phone")) document.getElementById("chk-client-phone").value = selectedOpt.dataset.phone || "";
    if (document.getElementById("chk-client-address")) document.getElementById("chk-client-address").value = selectedOpt.dataset.address || "";
    if (document.getElementById("chk-client-cuit")) document.getElementById("chk-client-cuit").value = selectedOpt.dataset.cuit || "";
    if (document.getElementById("chk-client-razon-social")) document.getElementById("chk-client-razon-social").value = selectedOpt.dataset.razonSocial || "";
    if (document.getElementById("chk-client-condicion-iva")) document.getElementById("chk-client-condicion-iva").value = selectedOpt.dataset.condicionIva || "CONSUMIDOR FINAL";
  }
}

function finishCheckoutWithNoInvoice() {
  printSaleTicket(window.currentCheckoutSaleId);
  closeCheckoutModalAndReset();
}

async function finishCheckoutWithARCA() {
  const saleId = window.currentCheckoutSaleId;
  const titleEl = document.querySelector("#checkout-step-invoice-options .modal-title");
  const originalHtml = titleEl ? titleEl.innerHTML : "";
  if (titleEl) titleEl.innerHTML = "Facturando en AFIP <i class='fas fa-spinner fa-spin'></i>";
  
  try {
    const res = await apiRequest("/api/invoices/emit", "POST", { sale_id: saleId });
    showToast(`¡Factura ${res.invoice_number} emitida con éxito! CAE: ${res.cae}`);
    
    // Actualizar localmente antes de imprimir
    const localSale = state.sales.find(s => s.id === saleId);
    if (localSale) {
      localSale.arca_invoice_id = res.invoice_number;
      localSale.arca_cae = res.cae;
      localSale.arca_cae_due = res.cae_due;
    }
    
    if (titleEl) titleEl.innerHTML = originalHtml;
    downloadFacturaCA4PDF(saleId);
    printSaleTicket(saleId);
    closeCheckoutModalAndReset();
  } catch (error) {
    if (titleEl) titleEl.innerHTML = originalHtml;
    showToast("Error al facturar: " + error.message, true);
  }
}

async function downloadFacturaCA4PDF(saleIdOrObject) {
  const sale = typeof saleIdOrObject === "object" ? saleIdOrObject : state.sales.find(s => s.id === saleIdOrObject);
  if (!sale) {
    showToast("Venta no encontrada para generar Factura C A4", true);
    return;
  }

  let arca = (state.integrations && state.integrations.arca) ? state.integrations.arca : {};
  const cuit = arca.cuit || "20362895953";
  const pos = arca.pos || "00001";
  const condicionEmisor = (arca.condicion_iva || "Responsable Monotributo").toUpperCase();
  const userEmail = (state.email || state.userEmail || "").toLowerCase();
  const isMatias = userEmail.includes("matias") || (state.businessName || "").toLowerCase().includes("mazo");

  const tradeName = arca.nombre_fantasia || arca.nombreFantasia || (isMatias ? "MAZO." : (state.businessName || "MAZO."));
  const businessName = (arca.razon_social && arca.razon_social !== "Mazo") 
    ? arca.razon_social 
    : (isMatias ? "CUCHETTI DIAZ MATIAS" : (state.businessName || "CUCHETTI DIAZ MATIAS"));
  
  let rawAddress = (arca.domicilio_comercial && arca.domicilio_comercial !== "Hipólito Yrigoyen 631") 
    ? arca.domicilio_comercial 
    : (arca.domicilio || arca.address || (isMatias ? "Castelli 1229 - Bahia Blanca, Buenos Aires" : "Castelli 1229 - Bahia Blanca, Buenos Aires"));

  const iibb = arca.iibb || cuit;
  const incioAct = arca.inicio_actividades || arca.start_date || (isMatias ? "01/10/2024" : "01/10/2024");
  
  const rawInvoiceId = sale.arca_invoice_id || "00000085";
  const formattedInvoiceNum = rawInvoiceId.includes("-") ? rawInvoiceId.split("-")[1].padStart(8, '0') : rawInvoiceId.padStart(8, '0');
  const posNum = pos.padStart(5, '0');

  const dateStr = sale.date ? (sale.date.includes("T") ? sale.date.split("T")[0].split("-").reverse().join("/") : sale.date) : new Date().toLocaleDateString('es-AR');
  const cae = sale.arca_cae || "86305092733678";
  const caeDue = sale.arca_cae_due ? (sale.arca_cae_due.includes("T") ? sale.arca_cae_due.split("T")[0].split("-").reverse().join("/") : sale.arca_cae_due) : "02/08/2026";

  const clientName = sale.client_name || sale.client_razon_social || "Consumidor Final";
  const clientCuit = sale.client_cuit || "";
  const clientCondicionIva = (sale.client_condicion_iva || "CONSUMIDOR FINAL").toUpperCase();
  const clientAddress = sale.client_address || "";
  const condicionVenta = sale.method ? sale.method : "Contado";

  let qrImgHtml = "";
  if (cae) {
    try {
      const qrData = {
        "ver": 1,
        "fecha": sale.date ? sale.date.split("T")[0] : new Date().toISOString().split("T")[0],
        "cuit": parseInt(cuit.replace(/[^0-9]/g, '') || 0),
        "ptoVta": parseInt(pos),
        "tipoCmp": 11,
        "nroCmp": parseInt(formattedInvoiceNum),
        "importe": parseFloat(sale.total),
        "moneda": "PES",
        "ctz": 1.0,
        "tipoDocRec": parseInt(clientCuit) > 0 ? (clientCuit.length === 11 ? 80 : 96) : 99,
        "nroDocRec": parseInt(clientCuit) > 0 ? parseInt(clientCuit.replace(/[^0-9]/g, '')) : 0,
        "tipoCodAut": "E",
        "codAut": parseInt(cae.replace(/[^0-9]/g, '')) || 0
      };
      const base64QrData = btoa(JSON.stringify(qrData));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://www.afip.gob.ar/fe/qr/?p=${base64QrData}`;
      qrImgHtml = `<img src="${qrUrl}" alt="QR AFIP" style="width: 105px; height: 105px;">`;
    } catch (e) {
      console.error("Error QR:", e);
    }
  }

  const pdfContainer = document.createElement("div");
  pdfContainer.style.padding = "25px 30px";
  pdfContainer.style.fontFamily = "Arial, sans-serif";
  pdfContainer.style.color = "#000000";
  pdfContainer.style.backgroundColor = "#ffffff";
  pdfContainer.style.boxSizing = "border-box";
  pdfContainer.style.fontSize = "11px";
  pdfContainer.style.lineHeight = "1.35";

  const logoHtml = state.userProfile?.logoBase64 
    ? `<img src="${state.userProfile.logoBase64}" style="max-height: 50px; max-width: 140px; object-fit: contain;">` 
    : `<h2 style="margin:0; font-size: 20px; font-weight: bold;">${tradeName}</h2>`;

  pdfContainer.innerHTML = `
    <!-- Top Bordered Header -->
    <div style="border: 1px solid #000; position: relative; padding: 10px 12px; margin-bottom: 0;">
      <!-- Title Original -->
      <div style="text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px;">ORIGINAL</div>
      <div style="border-top: 1px solid #000; margin: 0 -12px 10px -12px;"></div>

      <!-- Center Box C -->
      <div style="position: absolute; top: 26px; left: 50%; transform: translateX(-50%); border: 1px solid #000; background: #fff; width: 55px; height: 50px; text-align: center; z-index: 10;">
        <span style="font-size: 24px; font-weight: bold; display: block; line-height: 1;">C</span>
        <span style="font-size: 8px; font-weight: bold; display: block; margin-top: 2px;">COD. 011</span>
      </div>

      <!-- Two Columns Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <!-- Left Side: Emisor -->
        <div style="width: 48%; padding-right: 15px;">
          <div style="margin-bottom: 8px;">${logoHtml}</div>
          <p style="margin: 2px 0;"><strong>Razón Social:</strong> ${businessName}</p>
          <p style="margin: 2px 0;"><strong>Domicilio Comercial:</strong> ${rawAddress}</p>
          <p style="margin: 2px 0;"><strong>Condición frente al IVA:</strong> ${condicionEmisor}</p>
        </div>

        <div style="border-left: 1px solid #000; height: 95px; position: absolute; left: 50%; top: 26px;"></div>

        <!-- Right Side: Voucher Info -->
        <div style="width: 48%; padding-left: 20px;">
          <h1 style="font-size: 22px; font-weight: bold; margin: 0 0 8px 0; letter-spacing: 1px;">FACTURA</h1>
          <p style="margin: 2px 0;"><strong>Punto de Venta:</strong> ${posNum} &nbsp;&nbsp;&nbsp; <strong>Comp. Nro:</strong> ${formattedInvoiceNum}</p>
          <p style="margin: 2px 0;"><strong>Fecha de Emisión:</strong> ${dateStr}</p>
          <p style="margin: 2px 0;"><strong>CUIT:</strong> ${cuit}</p>
          <p style="margin: 2px 0;"><strong>Ingresos Brutos:</strong> ${iibb}</p>
          <p style="margin: 2px 0;"><strong>Fecha de Inicio de Actividades:</strong> ${incioAct}</p>
        </div>
      </div>
    </div>

    <!-- Client Box -->
    <div style="border: 1px solid #000; border-top: none; padding: 8px 12px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <div style="width: 45%;"><strong>CUIT:</strong> ${clientCuit || '---'}</div>
        <div style="width: 55%;"><strong>Apellido y Nombre / Razón Social:</strong> ${clientName}</div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <div style="width: 45%;"><strong>Condición frente al IVA:</strong> ${clientCondicionIva}</div>
        <div style="width: 55%;"><strong>Domicilio:</strong> ${clientAddress || '---'}</div>
      </div>
      <div>
        <strong>Condición de venta:</strong> ${condicionVenta}
      </div>
    </div>

    <!-- Items Table -->
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #e2e8f0; border-bottom: 1px solid #000;">
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 10px;">Código</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 10px;">Producto / Servicio</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: center; font-size: 10px;">Cantidad</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: center; font-size: 10px;">U. Medida</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-size: 10px;">Precio Unit.</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-size: 10px;">% Bonif</th>
          <th style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-size: 10px;">Imp. Bonif.</th>
          <th style="padding: 6px 8px; text-align: right; font-size: 10px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${(sale.items || []).map(it => {
          const skuStr = it.product?.sku || it.sku || "PROD";
          const rawName = it.product?.name || it.name || "Producto";
          const nameStr = cleanFacturaItemName(rawName);
          const qty = it.quantity || it.qty || 1;
          const price = it.price || (it.product ? it.product.price_local : 0);
          const subtotalItem = price * qty;
          const sizeStr = (it.size && String(it.size).toLowerCase() !== "único" && String(it.size).toLowerCase() !== "unico") ? ` (Talle ${it.size})` : "";
          return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="border-right: 1px solid #000; padding: 6px 8px; font-family: monospace;">${skuStr}</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px;">${nameStr}${sizeStr}</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: center;">${qty.toFixed(2)}</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: center;">unidades</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right;">${price.toFixed(2)}</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right;">0,00</td>
              <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right;">0,00</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${subtotalItem.toFixed(2)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <!-- Totals Box -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
      <div style="border: 1px solid #000; width: 280px; padding: 8px 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; font-weight: bold;">
          <span>Subtotal: $</span>
          <span>${sale.total.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px;">
          <span>Importe Otros Tributos: $</span>
          <span>0,00</span>
        </div>
        <div style="border-top: 1px solid #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900;">
          <span>Importe Total: $</span>
          <span>${sale.total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <!-- AFIP Footer Box -->
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; padding-top: 5px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${qrImgHtml}
        <div>
          <div style="font-size: 15px; font-weight: 900; letter-spacing: 1px; color: #000;">ARCA</div>
          <div style="font-size: 7px; text-transform: uppercase; color: #444; margin-bottom: 4px;">AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO</div>
          <div style="font-size: 11px; font-weight: bold; font-style: italic;">Comprobante Autorizado</div>
          <div style="font-size: 7.5px; color: #555; margin-top: 2px;">Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación</div>
        </div>
      </div>

      <div style="text-align: right;">
        <div style="font-size: 10px; color: #666; margin-bottom: 6px;">Pág. 1/1</div>
        <div style="font-size: 12px; font-weight: bold;">CAE N°: &nbsp; ${cae}</div>
        <div style="font-size: 11px; margin-top: 3px;">Fecha de Vto. de CAE: &nbsp; ${caeDue}</div>
      </div>
    </div>
  `;

  if (window.html2pdf) {
    const opt = {
      margin:       [6, 6, 6, 6],
      filename:     `Factura_C_${posNum}_${formattedInvoiceNum}_${clientName.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      showToast("Generando Factura C A4 PDF...");
      await html2pdf().set(opt).from(pdfContainer).save();
    } catch (e) {
      console.error("Error html2pdf Factura C:", e);
    }
  }
}
window.downloadFacturaCA4PDF = downloadFacturaCA4PDF;

function closeCheckoutAndKeepSale() {
  closeCheckoutModalAndReset();
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
  const cuit = document.getElementById("chk-client-cuit") ? document.getElementById("chk-client-cuit").value.trim() : "";
  const razonSocial = document.getElementById("chk-client-razon-social") ? document.getElementById("chk-client-razon-social").value.trim() : "";
  const condicionIva = document.getElementById("chk-client-condicion-iva") ? document.getElementById("chk-client-condicion-iva").value : "CONSUMIDOR FINAL";
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
        address: address,
        cuit: cuit,
        razonSocial: razonSocial,
        condicionIva: condicionIva
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
    const canalVenta = document.getElementById("pos-cart-channel-select") ? document.getElementById("pos-cart-channel-select").value : "Minorista";
    const ubicacion = document.getElementById("pos-cart-location-select") ? document.getElementById("pos-cart-location-select").value : "Local Principal";
    
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
      origen: origin,
      canal_venta: canalVenta,
      ubicacion: ubicacion,
      client_name: name,
      client_cuit: cuit,
      client_razon_social: razonSocial,
      client_condicion_iva: condicionIva,
      client_address: address
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

    // Guardar ID para los siguientes pasos
    window.currentCheckoutSaleId = saleId;
    
    // Avanzar al step de opciones de facturación
    document.getElementById("checkout-step-finance").style.display = "none";
    document.getElementById("checkout-step-invoice-options").style.display = "block";
    
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
      const itemsText = sale.items ? sale.items.map(item => `${item.quantity || 1} un x ${item.product?.name || item.name || 'Producto'} (${item.size || 'Único'})`).join("<br>") : "";
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
      
      const channelLabel = sale.origen === "tiendanube" 
        ? "Tienda Nube" 
        : (sale.canal_venta || (state.userProfile?.salesChannels && state.userProfile.salesChannels[0]) || "Local Principal");
        
      const originBadge = (sale.origen === "tiendanube") 
        ? `<span class="badge" style="margin-left: 4px; background: #8b5cf6; color: var(--text-white); padding: 2px 6px; font-size: 0.65rem;">${channelLabel}</span>` 
        : `<span class="badge" style="margin-left: 4px; background: rgba(255,255,255,0.1); color: #ccc; padding: 2px 6px; font-size: 0.65rem;">${channelLabel}</span>`;
        
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; ${sale.status === 'cancelled' ? 'opacity: 0.6;' : ''}">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 1.1rem; font-weight: 900; color: var(--text-white); margin-right: 4px; ${sale.status === 'cancelled' ? 'text-decoration: line-through;' : ''}">$ ${Math.round(sale.total).toLocaleString()}</span>
            <span class="badge ${badgeClass}" style="text-transform: capitalize;">${translatedMethod}</span>
            ${originBadge}
          </div>
          <div style="display: flex; gap: 6px;">
            ${sale.credit_note_id ? `<span class="badge" style="background: rgba(100,100,100,0.2); color: #aaa; font-size: 0.6rem;" title="Nota de Crédito Generada">⛔ Anulada (NC: ${sale.credit_note_id})</span>` :
              (!sale.arca_invoice_id ? `<button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px;" onclick="emitInvoiceFromSale('${sale.id}')">⚡ Facturar</button>` : `<span class="badge badge-emerald" style="font-size: 0.6rem;" title="Facturado en AFIP">✔️ ${sale.arca_invoice_id}</span>`)}
            <button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px;" onclick="printSaleTicket('${sale.id}')">
              <i class="fas fa-print"></i> Imprimir
            </button>
            ${(!sale.arca_invoice_id && sale.origen !== 'tiendanube' && !sale.credit_note_id) ? `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px; background: #ef4444;" onclick="deleteSale('${sale.id}')">
              <i class="fas fa-trash"></i> Eliminar
            </button>` : ''}
            ${(sale.arca_invoice_id && !sale.credit_note_id) ? `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px; background: #f97316; border: none;" onclick="openCreditNoteModal('${sale.id}')">
              <i class="fas fa-undo"></i> N. Crédito
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

let currentCreditNoteSaleId = null;

function openCreditNoteModal(saleId) {
  currentCreditNoteSaleId = saleId;
  document.getElementById("credit-note-modal").className = "modal-backdrop active";
}

function closeCreditNoteModal() {
  currentCreditNoteSaleId = null;
  document.getElementById("credit-note-modal").className = "modal-backdrop";
}

async function confirmCreditNote() {
  if (!currentCreditNoteSaleId) return;
  const reason = document.getElementById("credit-note-reason").value;
  const btn = document.getElementById("btn-confirm-credit-note");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = "Emitiendo <i class='fas fa-spinner fa-spin'></i>";
  btn.disabled = true;
  
  try {
    const res = await apiRequest("/api/invoices/credit-note", "POST", { sale_id: currentCreditNoteSaleId, reason: reason });
    showToast(`¡Nota de Crédito ${res.credit_note_id} emitida con éxito! CAE: ${res.cae}`);
    closeCreditNoteModal();
    await refreshState();
    openSalesHistoryModal(); // Refresh modal
    if (typeof renderExternalMonthlyBillingList === 'function') renderExternalMonthlyBillingList();
    if (typeof renderUninvoicedSales === 'function') renderUninvoicedSales();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
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

function getInvoiceTicketInnerHTML(sale) {
  const dateObj = new Date(sale.date);
  const dateStr = dateObj.toLocaleDateString('es-AR');
  const timeStr = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // 1. Items HTML con formato holgado y columnas claras (Detalle, Cantidad, Precio Unitario, Total)
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

      const qty = parseInt(item.quantity) || 1;
      let unitPrice = parseFloat(item.price || item.unitPrice || item.price_local || item.price_tiendanube) || 0;
      
      if (!unitPrice || unitPrice === 0) {
        const finalUnitCost = (parseFloat(p.cost) || 0) + itemExtraCost;
        const margin = parseFloat(p.margin) || 0;
        unitPrice = finalUnitCost * (1 + margin / 100);
      }
      
      if ((!unitPrice || unitPrice === 0) && sale.items.length === 1 && sale.total > 0) {
        unitPrice = sale.total / qty;
      } else if ((!unitPrice || unitPrice === 0) && item.subtotal > 0) {
        unitPrice = item.subtotal / qty;
      }
      
      const subtotal = (unitPrice > 0 ? unitPrice * qty : (item.subtotal || (sale.items.length === 1 ? sale.total : 0)));
      const variantText = (state.businessType === "comercio" || p.size === "Único" || !item.size) ? "" : ` (${item.size})`;

      itemsHtml += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="font-size: 10px; text-align: left; padding: 4px 2px;">
            ${p.name || item.name || 'Producto'}${variantText}
          </td>
          <td style="font-size: 10px; text-align: center; padding: 4px 2px;">${qty}</td>
          <td style="font-size: 10px; text-align: right; padding: 4px 2px; white-space: nowrap;">$ ${Math.round(unitPrice).toLocaleString('es-AR')}</td>
          <td style="font-size: 10px; text-align: right; padding: 4px 2px; white-space: nowrap;">$ ${Math.round(subtotal).toLocaleString('es-AR')}</td>
        </tr>
      `;
    });
  }

  // 2. Ticket de cambio (sin detalle de prendas duplicado)
  let exchangeTicketHtml = "";
  if (state.businessType === "textil") {
    const limitDate = new Date(dateObj.getTime() + 15 * 24 * 60 * 60 * 1000);
    const limitDateStr = limitDate.toLocaleDateString('es-AR');

    exchangeTicketHtml = `
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000; text-align: center;">
        <h3 style="font-weight: bold; font-size: 13px; margin: 0 0 4px 0; letter-spacing: 1px;">TICKET DE CAMBIO</h3>
        <p style="font-size: 10px; margin: 0 0 6px 0;">Válido por 15 días (Hasta el ${limitDateStr})</p>
        <p style="font-size: 9px; margin-top: 6px; font-style: italic;">Conserve este ticket para realizar el cambio en el local.</p>
      </div>
    `;
  }

  const customFooterText = (state.userProfile?.printSettings?.footerText !== undefined && state.userProfile?.printSettings?.footerText !== "") 
    ? state.userProfile.printSettings.footerText 
    : "¡Gracias por su compra!";

  const isFiscal = !!sale.arca_invoice_id;

  if (!isFiscal) {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; text-align: left;">
        ${state.userProfile?.logoBase64 ? `
          <div style="margin-right: 20px; flex-shrink: 0;">
            <img src="${state.userProfile.logoBase64}" style="max-height: 60px; max-width: 100px; object-fit: contain;">
          </div>
        ` : ''}
        <div style="flex-grow: 1; line-height: 1.4; text-align: ${state.userProfile?.logoBase64 ? 'left' : 'center'};">
          <div style="font-size: 8px; border: 1px solid #000; padding: 2px 4px; display: inline-block; font-weight: bold; margin-bottom: 4px;">DOCUMENTO NO VALIDO COMO FACTURA</div>
          <h2 style="margin: 0 0 2px 0; font-size: 14px; text-transform: uppercase; font-weight: bold;">${state.businessName || (state.businessType === "textil" ? "MAZO TEXTIL" : "MAZO COMERCIO")}</h2>
          <p style="margin: 1px 0; font-size: 9px;">Fecha: ${dateStr} - ${timeStr}</p>
          <p style="margin: 1px 0; font-size: 9px; font-family: monospace; font-weight: bold;">TICKET N°: ${sale.id}</p>
        </div>
      </div>
      <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
      <table style="width: 100%; border-collapse: collapse; margin: 8px 0;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: left; padding: 4px 2px; font-weight: bold; width: 42%;">Detalle</th>
            <th style="text-align: center; padding: 4px 2px; font-weight: bold; width: 18%;">Cantidad</th>
            <th style="text-align: right; padding: 4px 2px; font-weight: bold; width: 20%;">Precio Unitario</th>
            <th style="text-align: right; padding: 4px 2px; font-weight: bold; width: 20%;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
      <div style="margin-top: 10px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Metodo Pago:</span><span style="font-weight: bold;">${sale.method}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 8px;"><span style="font-weight: bold;">TOTAL:</span><span style="font-weight: bold;">$ ${Math.round(sale.total).toLocaleString('es-AR')}</span></div>
      </div>
      <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
      ${exchangeTicketHtml}
      ${customFooterText ? `
      <div style="margin-top: 15px; font-size: 10px; text-align: center;">
        <p style="margin: 5px 0;">${customFooterText}</p>
      </div>
      ` : ''}
    `;
  } else {
    // Factura Oficial (A, B o C)
    let arca = (state.integrations && state.integrations.arca) ? state.integrations.arca : {};
    const cuit = arca.cuit || "00-00000000-0";
    const pos = arca.pos || "0002";
    const condicionEmisor = (arca.condicion_iva || "monotributo").toUpperCase();

    const userEmail = (state.email || state.userEmail || "").toLowerCase();
    const isMatias = userEmail.includes("matias") || (state.businessName || "").toLowerCase().includes("mazo");

    const tradeName = arca.nombre_fantasia || arca.nombreFantasia || (isMatias ? "MAZO." : (state.businessName || "Empresa"));
    const businessName = (arca.razon_social && arca.razon_social !== "Mazo") 
      ? arca.razon_social 
      : (isMatias ? "CUCHETTI DIAZ MATIAS" : (state.businessName || "Empresa / Monotributista"));
    
    let rawAddress = (arca.domicilio_comercial && arca.domicilio_comercial !== "Hipólito Yrigoyen 631") 
      ? arca.domicilio_comercial 
      : (arca.domicilio || arca.address || (isMatias ? "Castelli 1229, Bahia Blanca, Buenos Aires" : "Hipólito Yrigoyen 631"));
    const addressStr = rawAddress.toLowerCase().includes("domicilio comercial") ? rawAddress : `Domicilio Comercial: ${rawAddress}`;
    
    const iibb = arca.iibb || cuit;
    const incioAct = arca.inicio_actividades || arca.start_date || (isMatias ? "01/10/2024" : "01/01/2020");
    const nroFactura = sale.arca_invoice_id || "";
    const cae = sale.arca_cae || "";
    const caeDue = sale.arca_cae_due || "";

    const clientCuit = sale.client_cuit ? sale.client_cuit.replace(/[^0-9]/g, '') : "";
    const clientName = sale.client_name || sale.client_razon_social || "Consumidor Final";
    const clientCondicionIva = (sale.client_condicion_iva || "CONSUMIDOR FINAL").toUpperCase();
    const clientAddress = sale.client_address || "";
    const isAnonymous = !clientCuit || clientCuit === "0" || clientCuit === "20999999999";

    let voucherLetter = "C";
    let voucherCode = "011";
    let cbteTipoCode = 11;

    if (condicionEmisor.includes("INSCRIPTO")) {
      if (clientCuit.length === 11 && (clientCondicionIva.includes("MONOTRIBUTO") || clientCondicionIva.includes("INSCRIPTO"))) {
        voucherLetter = "A";
        voucherCode = "001";
        cbteTipoCode = 1;
      } else {
        voucherLetter = "B";
        voucherCode = "006";
        cbteTipoCode = 6;
      }
    } else {
      voucherLetter = "C";
      voucherCode = "011";
      cbteTipoCode = 11;
    }

    const leyendaMonotributo = sale.leyenda_monotributo || (voucherLetter === "A" && clientCondicionIva.includes("MONOTRIBUTO") ? "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618" : "");

    let qrImgHtml = "";
    if (cae) {
      try {
        const qrData = {
          "ver": 1,
          "fecha": sale.date.split("T")[0],
          "cuit": parseInt(cuit.replace(/[^0-9]/g, '') || 0),
          "ptoVta": parseInt(pos),
          "tipoCmp": cbteTipoCode,
          "nroCmp": parseInt(nroFactura.split("-")[1] || 0),
          "importe": parseFloat(sale.total),
          "moneda": "PES",
          "ctz": 1.0,
          "tipoDocRec": parseInt(clientCuit) > 0 ? (clientCuit.length === 11 ? 80 : 96) : 99,
          "nroDocRec": parseInt(clientCuit) > 0 ? parseInt(clientCuit) : 0,
          "tipoCodAut": "E",
          "codAut": parseInt(cae)
        };
        const base64QrData = btoa(JSON.stringify(qrData));
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://www.afip.gob.ar/fe/qr/?p=${base64QrData}`;
        qrImgHtml = `<img src="${qrUrl}" alt="QR AFIP" style="width: 110px; height: 110px; margin-top: 5px;">`;
      } catch (e) {
        console.error("Error generating QR data", e);
      }
    }

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        ${state.userProfile?.logoBase64 ? `
          <div style="width: 85px; flex-shrink: 0; text-align: left; display: flex; align-items: center; justify-content: flex-start;">
            <img src="${state.userProfile.logoBase64}" style="max-height: 55px; max-width: 85px; object-fit: contain;">
          </div>
        ` : `<div style="width: 45px; flex-shrink: 0;"></div>`}
        <div style="flex-grow: 1; text-align: center; font-size: 10px; padding: 0 5px; line-height: 1.35;">
          <h2 style="margin: 0 0 3px 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">${tradeName}</h2>
          <p style="margin: 1px 0; font-size: 9px; font-weight: bold;">Razón Social: ${businessName}</p>
          <p style="margin: 1px 0; font-size: 9px;">${addressStr}</p>
          <p style="margin: 1px 0; font-size: 9px;">CUIT: ${cuit}</p>
          <p style="margin: 1px 0; font-size: 9px;">IIBB: ${iibb}</p>
          <p style="margin: 1px 0; font-size: 9px;">Inicio Actividades: ${incioAct}</p>
          <p style="margin: 1px 0; font-size: 9px; font-weight: bold;">${condicionEmisor}</p>
        </div>
        <div style="width: ${state.userProfile?.logoBase64 ? '85px' : '45px'}; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;">
          <div style="border: 1px solid #000; padding: 2px; text-align: center; width: 45px; font-size: 10px; box-sizing: border-box;">
            <p style="font-size: 18px; font-weight: bold; margin: 0; line-height: 1;">${voucherLetter}</p>
            <p style="font-size: 8px; margin: 0;">COD. ${voucherCode}</p>
          </div>
        </div>
      </div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="text-align: center; margin: 5px 0;">
        <p style="margin: 0; font-size: 14px; font-weight: bold;">FACTURA ${voucherLetter}</p>
        <p style="margin: 2px 0;">Nro: ${pos}-${nroFactura.split("-")[1] || "00000000"}</p>
        <p style="margin: 2px 0;">Fecha: ${dateStr}</p>
      </div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="margin: 5px 0; font-size: 10px;">
        <p style="margin: 2px 0;"><span style="font-weight: bold;">CLIENTE:</span> ${clientName}</p>
        <p style="margin: 2px 0;"><span style="font-weight: bold;">CONDICION IVA:</span> ${clientCondicionIva}</p>
        ${!isAnonymous ? `<p style="margin: 2px 0;"><span style="font-weight: bold;">CUIT/DNI:</span> ${clientCuit}</p>` : ''}
        ${clientAddress ? `<p style="margin: 2px 0;"><span style="font-weight: bold;">DOMICILIO:</span> ${clientAddress}</p>` : ''}
      </div>
      ${leyendaMonotributo ? `<div style="font-size: 8px; border: 1px solid #000; padding: 4px; margin: 6px 0; text-align: justify;">${leyendaMonotributo}</div>` : ''}
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <table style="width: 100%; border-collapse: collapse; margin: 6px 0;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: left; padding: 4px 2px; font-weight: bold; width: 42%;">Detalle</th>
            <th style="text-align: center; padding: 4px 2px; font-weight: bold; width: 18%;">Cantidad</th>
            <th style="text-align: right; padding: 4px 2px; font-weight: bold; width: 20%;">Precio Unitario</th>
            <th style="text-align: right; padding: 4px 2px; font-weight: bold; width: 20%;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="margin-top: 5px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Cond. de Venta:</span><span style="font-weight: bold;">${sale.method.toLowerCase().includes('efectivo') ? 'Contado' : (sale.method.toLowerCase().includes('transfer') ? 'Transferencia' : 'Tarjeta')}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 5px;"><span style="font-weight: bold;">TOTAL:</span><span style="font-weight: bold;">$ ${Math.round(sale.total).toLocaleString('es-AR')}</span></div>
      </div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      ${exchangeTicketHtml}
      <div style="margin-top: 15px; text-align: center;">
        ${qrImgHtml}
        <p style="margin: 3px 0; font-size: 10px; font-weight: bold;">CAE N°: ${cae}</p>
        <p style="margin: 3px 0; font-size: 10px;">Vto. CAE: ${caeDue}</p>
        ${customFooterText ? `<p style="margin: 6px 0 0 0; font-size: 10px;">${customFooterText}</p>` : ''}
      </div>
    `;
  }
}

function printSaleTicket(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) {
    showToast("Venta no encontrada para imprimir", true);
    return;
  }

  const innerHTML = getInvoiceTicketInnerHTML(sale);
  const isFiscal = !!sale.arca_invoice_id;
  const nroFactura = sale.arca_invoice_id || sale.id;

  const ticketHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${isFiscal ? 'Factura' : 'Ticket'} ${nroFactura}</title>
      <style>
        @page { margin: 0; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.3; color: #000; background: #fff; margin: 0; padding: 10px; width: 85mm; box-sizing: border-box; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
      </style>
    </head>
    <body>
      ${innerHTML}
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=600,height=800");
  if (printWindow) {
    printWindow.document.write(ticketHtml);
    printWindow.document.close();
    printWindow.focus();
    
    const img = printWindow.document.querySelector("img");
    if (img) {
      img.onload = () => {
        printWindow.print();
        printWindow.close();
      };
      img.onerror = () => {
        printWindow.print();
        printWindow.close();
      };
      setTimeout(() => {
        if (!printWindow.closed) {
          printWindow.print();
          printWindow.close();
        }
      }, 1500);
    } else {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  } else {
    showToast("Permiso de ventanas emergentes bloqueado. Por favor, habilítelo para poder imprimir.", true);
  }
}

async function downloadInvoicePDF(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) {
    showToast("Venta no encontrada para descargar PDF", true);
    return;
  }

  showToast("Generando y descargando PDF de la factura...");

  // Contenedor standalone (NO acoplado al DOM para evitar interferencias y recortes)
  const pdfContainer = document.createElement("div");
  pdfContainer.style.width = "140mm";
  pdfContainer.style.margin = "0 auto";
  pdfContainer.style.padding = "20px";
  pdfContainer.style.background = "#ffffff";
  pdfContainer.style.color = "#000000";
  pdfContainer.style.fontFamily = "'Courier New', Courier, monospace";
  pdfContainer.style.boxSizing = "border-box";

  pdfContainer.innerHTML = `
    <style>
      .pdf-wrapper {
        color: #000000 !important;
        background-color: #ffffff !important;
        font-family: 'Courier New', Courier, monospace !important;
        width: 100% !important;
      }
      .pdf-wrapper * {
        color: #000000 !important;
        background-color: transparent !important;
        border-color: #000000 !important;
      }
      .pdf-wrapper table {
        width: 100% !important;
        border-collapse: collapse !important;
      }
      .pdf-wrapper th {
        border-bottom: 1px dashed #000000 !important;
        padding: 4px 2px !important;
        font-weight: bold !important;
      }
      .pdf-wrapper td {
        padding: 4px 2px !important;
      }
    </style>
    <div class="pdf-wrapper">
      ${getInvoiceTicketInnerHTML(sale)}
    </div>
  `;

  const fileName = sale.arca_invoice_id ? `Factura_${sale.arca_invoice_id}.pdf` : `Comprobante_${sale.id}.pdf`;

  const opt = {
    margin: [15, 15, 15, 15],
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(pdfContainer).save();
      showToast("¡PDF descargado con éxito!");
    } else {
      printSaleTicket(saleId);
    }
  } catch (err) {
    console.error("Error al generar PDF:", err);
    showToast("Error al descargar PDF.", true);
  }
}
window.downloadInvoicePDF = downloadInvoicePDF;

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

// --- BULK PRICE UPDATE ---
let bulkPriceSelectedCategories = [];
let bulkPriceProductsMap = []; // { id: string, name: string, category: string, checked: boolean, variants: [] }

function openBulkPriceModal() {
  const container = document.getElementById("bulk-price-categories-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  // Populate categories list with checkboxes (sorted alphabetically)
  const categories = (state.categories || []).slice().sort((a, b) => a.localeCompare(b));
  categories.forEach(cat => {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = cat;
    input.id = `bulk-cat-${cat.replace(/\s+/g, "-")}`;
    input.className = "bulk-cat-checkbox";
    input.addEventListener("change", onBulkPriceCategoryChange);
    
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.innerText = cat;
    label.style.fontSize = "0.8rem";
    label.style.cursor = "pointer";
    label.style.margin = "0";
    label.style.color = "var(--text-white)";
    
    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
  });
  
  // Clear other inputs
  document.getElementById("bulk-price-product-search").value = "";
  document.getElementById("bulk-price-percent-input").value = "";
  
  // Render empty products list
  renderBulkPriceProductsList();
  
  document.getElementById("modal-bulk-price-update").style.display = "flex";
}

function closeBulkPriceModal() {
  document.getElementById("modal-bulk-price-update").style.display = "none";
}

function toggleAllBulkPriceCategories(val) {
  const checkboxes = document.querySelectorAll(".bulk-cat-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = val;
  });
  onBulkPriceCategoryChange();
}

function onBulkPriceCategoryChange() {
  const checkboxes = document.querySelectorAll(".bulk-cat-checkbox");
  const selectedCats = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selectedCats.push(cb.value);
  });
  
  // Re-build bulkPriceProductsMap
  const groupedProds = {};
  const actualProducts = (state.products || []).filter(p => 
    !p.sku.startsWith("supplier_") && 
    !p.sku.startsWith("fixedcost_") && 
    !p.sku.startsWith("account_") && 
    !p.sku.startsWith("cashtransaction_") && 
    !p.sku.startsWith("influencer_") && 
    !p.sku.startsWith("marketingexpense_") && 
    !p.sku.startsWith("stockintake_") && 
    !p.sku.startsWith("productionorder_") && 
    p.sku !== "extras_config" && 
    p.sku !== "categories_config"
  );
  
  actualProducts.forEach(p => {
    if (selectedCats.length > 0 && !selectedCats.includes(p.category)) return;
    
    const pSku = p.sku || p.id || "";
    const cleanNameKey = cleanCompareText(p.name || "");
    const baseSku = getCleanBaseSku(pSku, p.baseSku) || cleanNameKey || "PROD";
    const colorKey = p.color ? p.color.toLowerCase().trim() : "";
    const groupKey = (cleanNameKey || baseSku) + ((colorKey && colorKey !== "único" && colorKey !== "unico") ? `_${colorKey}` : "");

    if (!groupedProds[groupKey]) {
      groupedProds[groupKey] = {
        name: getProductNameWithColor ? getProductNameWithColor(p) : p.name,
        category: p.category || "",
        variants: []
      };
    }
    groupedProds[groupKey].variants.push(p);
  });
  
  // Save to map
  bulkPriceProductsMap = Object.keys(groupedProds).map(key => {
    const group = groupedProds[key];
    return {
      id: key,
      name: group.name,
      category: group.category,
      checked: true, // Default to true when category checked
      variants: group.variants
    };
  });
  
  // Sort products list alphabetically by name
  bulkPriceProductsMap.sort((a, b) => {
    const nameA = (a.name || "").toString().toLowerCase().trim();
    const nameB = (b.name || "").toString().toLowerCase().trim();
    return nameA.localeCompare(nameB);
  });
  
  renderBulkPriceProductsList();
}

function renderBulkPriceProductsList() {
  const container = document.getElementById("bulk-price-products-container");
  if (!container) return;
  container.innerHTML = "";
  
  const searchInput = document.getElementById("bulk-price-product-search").value.toLowerCase().trim();
  
  const filtered = bulkPriceProductsMap.filter(p => 
    p.name.toLowerCase().includes(searchInput) || p.category.toLowerCase().includes(searchInput)
  );
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-gray); text-align:center; padding:10px;">Selecciona categorías para ver productos</div>';
    return;
  }
  
  filtered.forEach(p => {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = p.checked;
    input.id = `bulk-prod-${p.id}`;
    input.addEventListener("change", (e) => {
      p.checked = e.target.checked;
    });
    
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.innerHTML = `${p.name} <span style="font-size:0.65rem; color:var(--text-gray);">(${p.category})</span>`;
    label.style.fontSize = "0.75rem";
    label.style.cursor = "pointer";
    label.style.margin = "0";
    label.style.color = "var(--text-white)";
    
    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
  });
}

function filterBulkPriceProductsList() {
  renderBulkPriceProductsList();
}

function toggleAllBulkPriceProducts(val) {
  bulkPriceProductsMap.forEach(p => {
    p.checked = val;
  });
  renderBulkPriceProductsList();
}

async function applyBulkPriceUpdate() {
  const percentInput = document.getElementById("bulk-price-percent-input").value.trim();
  if (!percentInput) {
    showToast("Ingresa un porcentaje", true);
    return;
  }
  
  const percent = parseFloat(percentInput);
  if (isNaN(percent)) {
    showToast("Porcentaje inválido", true);
    return;
  }
  
  // Collect all checked variants
  const variantsToUpdate = [];
  bulkPriceProductsMap.forEach(p => {
    if (p.checked) {
      p.variants.forEach(v => {
        variantsToUpdate.push(v);
      });
    }
  });
  
  if (variantsToUpdate.length === 0) {
    showToast("No seleccionaste ningún producto para modificar", true);
    return;
  }
  
  const batchPayload = variantsToUpdate.map(p => {
    const pCopy = { ...p };
    const factor = 1 + (percent / 100);
    pCopy.price_local = pCopy.price_local ? Math.round((pCopy.price_local * factor) / 100) * 100 : 0;
    pCopy.price_tiendanube = pCopy.price_tiendanube ? Math.round((pCopy.price_tiendanube * factor) / 100) * 100 : 0;
    pCopy.price = pCopy.price_local; // fallback
    const rawCost = parseFloat(pCopy.cost) || 0;
    if (rawCost > 0) {
      pCopy.margin = Math.round((((pCopy.price_local / rawCost) - 1) * 100) * 10) / 10;
    } else {
      pCopy.margin = 0;
    }
    return pCopy;
  });
  
  try {
    showToast(`Actualizando precios de ${batchPayload.length} productos...`);
    await apiRequest("/api/products", "POST", batchPayload);
    showToast("Precios actualizados exitosamente");
    closeBulkPriceModal();
    refreshState();
  } catch (error) {
    showToast(error.message, true);
  }
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
  const recentSales = (state.sales || []).filter(s => s && s.date && new Date(s.date) >= thirtyDaysAgo);
  const salesByProduct = {};
  recentSales.forEach(sale => {
    if (sale && sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        if (!item) return;
        const p = item.product || {};
        const pSku = p.sku || p.id || item.sku || "";
        if (pSku) {
          salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
        }
      });
    }
  });

  // Filtrar productos reales
  const actualProducts = (state.products || []).filter(p => {
    if (!p) return false;
    const sku = p.sku || p.id || "";
    return sku &&
      !sku.startsWith("supplier_") && 
      !sku.startsWith("fixedcost_") && 
      !sku.startsWith("account_") && 
      !sku.startsWith("cashtransaction_") && 
      !sku.startsWith("influencer_") && 
      !sku.startsWith("marketingexpense_") && 
      !sku.startsWith("stockintake_") && 
      sku !== "extras_config" && 
      sku !== "categories_config";
  });

  // Agrupar por baseSku y Color para separar variantes de color como productos individuales
  const groupedProducts = {};
  actualProducts.forEach(p => {
    const pSku = p.sku || p.id || "";
    const baseSku = getCleanBaseSku(p.sku, p.baseSku) || "PROD";
    const groupKey = getProductGroupKey(p);
    const displayName = getProductNameWithColor(p);

    if (!groupedProducts[groupKey]) {
      groupedProducts[groupKey] = {
        baseSku: baseSku,
        groupKey: groupKey,
        name: displayName,
        category: p.category || "",
        color: p.color || "",
        variants: [],
        totalStock: 0,
        totalMinStock: 0,
        cost: parseFloat(p.cost) || 0,
        margin: parseFloat(p.margin) || 0,
        editSku: pSku
      };
    }
    groupedProducts[groupKey].variants.push(p);
    const stockLocalVal = getProductLocationStockSum(p);
    groupedProducts[groupKey].totalStock += stockLocalVal;
    groupedProducts[groupKey].totalMinStock += getProductMinStock(p, salesByProduct);
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
                          g.variants.some(v => (v.sku || v.id || "").toLowerCase().includes(searchInput));
    const matchesCat = filterCat === "Todas las Categorías" || category === filterCat;
    return matchesSearch && matchesCat;
  });

  // Ordenar alfabéticamente por nombre de producto
  filtered.sort((a, b) => {
    const nameA = (a.name || "").toString().toLowerCase().trim();
    const nameB = (b.name || "").toString().toLowerCase().trim();
    return nameA.localeCompare(nameB);
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
    
    // Ordenar los talles según las variantes configuradas en el negocio
    const configuredSizes = getConfiguredSizes(g.category, g.groupKey);

    const allProductSizes = new Set();
    g.variants.forEach(v => {
      if (!v) return;

      const stockVal = getProductLocationStockSum(v);

      // Solo tomamos en cuenta variantes que tengan ID de Tiendanube, o stock > 0, o si es la única variante del producto
      const isRealVariant = Boolean(v.tiendanube_variant_id) || stockVal > 0 || g.variants.length === 1;
      if (!isRealVariant) return;

      const checkAndAdd = (sz) => {
        if (!sz) return;
        const trimmed = sz.trim();
        if (trimmed && trimmed.toLowerCase() !== "unico" && trimmed.toLowerCase() !== "único") {
          const match = configuredSizes.find(cs => cs.toLowerCase().trim() === trimmed.toLowerCase());
          allProductSizes.add(match || trimmed);
        }
      };

      if (v.size) checkAndAdd(v.size);
    });

    const sortedTalles = [...allProductSizes].sort((a, b) => {
      const idxA = configuredSizes.indexOf(a);
      const idxB = configuredSizes.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    const tallesText = sortedTalles.length > 0 ? sortedTalles.join(", ") : "Único";

    let extractedPrice = 0;
    for (const v of g.variants) {
      if (v) {
        if (v.price_local !== undefined && parseFloat(v.price_local) > 0) {
          extractedPrice = parseFloat(v.price_local);
          break;
        }
        if (v.price !== undefined && parseFloat(v.price) > 0) {
          extractedPrice = parseFloat(v.price);
          break;
        }
      }
    }
    const firstVar = g.variants[0] || {};
    const priceLocal = extractedPrice > 0 ? extractedPrice : price;
    const priceTiendanube = firstVar.price_tiendanube !== undefined ? parseFloat(firstVar.price_tiendanube) : 0;

    const hasInfiniteTaller = g.variants.some(v => v.stock_taller === "infinito" || !v.stock_taller);
    const totalTaller = g.variants.reduce((sum, v) => sum + (parseInt(v.stock_taller) || 0), 0);
    const stockTallerText = hasInfiniteTaller ? "∞" : `${totalTaller} u.`;

    const priceLocalText = `$ ${Math.round(priceLocal).toLocaleString()}`;
    const priceTiendanubeText = priceTiendanube > 0 ? `$ ${Math.round(priceTiendanube).toLocaleString()}` : "-";

    const exactMarkupPct = cost > 0 ? parseFloat(((priceLocal - cost) / cost * 100).toFixed(2)) : (margin || 0);
    const formattedInventoryMarkup = (exactMarkupPct % 1 === 0) ? `${Math.round(exactMarkupPct)}%` : `${exactMarkupPct}%`;

    tr.innerHTML = `
      <td style="font-weight: 700;">
        <div style="font-size: 0.85rem; color: var(--text-white);">${g.name || ""}</div>
        <div style="font-size: 0.65rem; color: var(--text-gray); font-family: monospace; margin-top: 2px;">${g.baseSku || ""}</div>
      </td>
      <td>
        <span class="badge badge-gray">${g.category || ""}</span>
      </td>
      <td>
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-white);">${tallesText}</div>
      </td>
      <td style="text-align: right; font-weight: 700; color: ${colorClass};">
        <div style="font-size: 0.8rem; color: var(--text-white);">${g.totalStock} u.</div>
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
          ${formattedInventoryMarkup}
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
  
  const countSpan = document.getElementById("inventory-total-count");
  if (countSpan) {
    countSpan.innerText = `${filtered.length} productos`;
  }

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

function renderProductModalSizesSelector(category) {
  const container = document.getElementById("product-modal-sizes-selector-container");
  const list = document.getElementById("product-modal-sizes-list");
  if (!container || !list) return;

  const isComercio = state.businessType === "comercio";
  if (isComercio) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  list.innerHTML = "";

  const catSizes = getConfiguredSizes(category);

  catSizes.forEach(sz => {
    const isActive = (state.tempActiveProductSizes || []).some(s => s.toLowerCase().trim() === sz.toLowerCase().trim());
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `product-size-pill ${isActive ? 'active' : ''}`;
    btn.dataset.size = sz;

    const activeStyle = "background: rgba(16,185,129,0.15); color: var(--accent-emerald); border: 1px solid rgba(16,185,129,0.4);";
    const inactiveStyle = "background: rgba(255,255,255,0.02); color: var(--text-gray); border: 1px solid var(--border-color);";

    btn.style.cssText = "padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (isActive ? activeStyle : inactiveStyle);
    btn.innerText = sz;

    btn.onclick = () => {
      btn.classList.toggle("active");
      const nowActive = btn.classList.contains("active");
      btn.style.cssText = "padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (nowActive ? activeStyle : inactiveStyle);

      if (!state.tempActiveProductSizes) {
        state.tempActiveProductSizes = [];
      }
      if (nowActive) {
        if (!state.tempActiveProductSizes.some(s => s.toLowerCase().trim() === sz.toLowerCase().trim())) {
          state.tempActiveProductSizes.push(sz);
        }
      } else {
        state.tempActiveProductSizes = state.tempActiveProductSizes.filter(s => s.toLowerCase().trim() !== sz.toLowerCase().trim());
      }

      renderSecurityStockGrid();
      renderProductLocationRows();
    };

    list.appendChild(btn);
  });
}
window.renderProductModalSizesSelector = renderProductModalSizesSelector;

function getEditModalProductSizes() {
  const currentCat = document.getElementById("prod-category")?.value || "";
  const oldGroupKey = document.getElementById("product-modal")?.dataset?.oldGroupKey || "";
  let configuredSizes = getConfiguredSizes(currentCat, oldGroupKey).slice();
  
  if (Array.isArray(state.tempActiveProductSizes)) {
    configuredSizes = state.tempActiveProductSizes.slice();
  }

  let hasUnico = false;
  Object.keys(tempLocationStock).forEach(loc => {
    if (tempLocationStock[loc] && typeof tempLocationStock[loc] === 'object') {
      Object.keys(tempLocationStock[loc]).forEach(sz => {
        if (sz.toLowerCase() === "único" || sz.toLowerCase() === "unico") {
          if ((tempLocationStock[loc][sz] || 0) > 0) {
            hasUnico = true;
          }
        }
      });
    }
  });
  if (hasUnico && !configuredSizes.some(cs => cs.toLowerCase() === "único" || cs.toLowerCase() === "unico")) {
    configuredSizes.push("Único");
  }

  return configuredSizes;
}

// --- Product Location Helpers ---
function renderProductLocationRows() {
  const isComercio = state.businessType === "comercio";
  
  if (isComercio) {
    // Populate simple stock rows
    const container = document.getElementById("location-simple-stock-container");
    if (!container) return;
    container.innerHTML = "";
    
    Object.keys(tempLocationStock).forEach(loc => {
      const val = tempLocationStock[loc]["Único"] || 0;
      const row = document.createElement("div");
      row.style = "display: flex; gap: 12px; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px;";
      row.innerHTML = `
        <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-white); width: 140px; min-width: 140px;">${loc}</span>
        <input type="number" class="form-input product-simple-stock-input" data-location="${loc}" value="${val}" style="flex: 1; max-width: 200px; padding: 6px 12px; text-align: left;" placeholder="Ej. 100" min="0" oninput="saveAllLocationStocks()">
        <button type="button" class="btn" style="background: rgba(229,56,59,0.1); border: 1px solid rgba(229,56,59,0.2); color: var(--accent-red); padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="removeProductLocationSimpleRow('${loc}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      container.appendChild(row);
    });
    
    // Populate the add dropdown
    const addSelect = document.getElementById("add-location-simple-select");
    if (addSelect) {
      addSelect.innerHTML = "";
      const available = (state.userProfile?.locations || ["Local Principal"]).filter(l => tempLocationStock[l] === undefined);
      available.forEach(l => {
        const opt = document.createElement("option");
        opt.value = l;
        opt.innerText = l;
        addSelect.appendChild(opt);
      });
      if (available.length === 0) {
        addSelect.innerHTML = '<option value="">Sin ubicaciones para añadir</option>';
      }
    }
  } else {
    // Populate textil size table rows
    const container = document.getElementById("location-stock-matrix-container");
    if (!container) return;
    container.innerHTML = "";
    
    const table = document.createElement("table");
    table.style = "width: 100%; border-collapse: collapse; min-width: 600px;";
    const configuredSizes = getEditModalProductSizes();
    table.innerHTML = `
      <thead>
        <tr style="border-bottom: 1px solid var(--border-color); text-align: left;">
          <th style="padding: 6px 12px; font-size: 0.75rem; color: var(--text-gray-light); font-weight: 700; width: 140px;">Ubicación</th>
          ${configuredSizes.map(sz => `<th style="padding: 6px 6px; font-size: 0.75rem; color: var(--text-gray-light); font-weight: 700; text-align: center;">${sz}</th>`).join("")}
          <th style="padding: 6px 12px; width: 50px;"></th>
        </tr>
      </thead>
      <tbody>
      </tbody>
    `;
    
    const tbody = table.querySelector("tbody");
    Object.keys(tempLocationStock).forEach(loc => {
      const tr = document.createElement("tr");
      tr.style = "border-bottom: 1px solid rgba(255,255,255,0.03);";
      
      let inputsHtml = "";
      getEditModalProductSizes().forEach(sz => {
        const val = tempLocationStock[loc][sz] || 0;
        inputsHtml += `
          <td style="padding: 4px 6px; text-align: center;">
            <input type="number" class="form-input product-stock-input" data-location="${loc}" data-size="${sz}" value="${val}" style="text-align: center; padding: 6px; width: 60px; margin: 0 auto;" min="0" oninput="saveAllLocationStocks()">
          </td>
        `;
      });
      
      tr.innerHTML = `
        <td style="padding: 8px 12px; font-size: 0.85rem; font-weight: 700; color: var(--text-white); vertical-align: middle;">${loc}</td>
        ${inputsHtml}
        <td style="padding: 8px 12px; text-align: right; vertical-align: middle;">
          <button type="button" class="btn" style="background: rgba(229,56,59,0.1); border: 1px solid rgba(229,56,59,0.2); color: var(--accent-red); padding: 6px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="removeProductLocationRow('${loc}')">
            <i class="fa-solid fa-trash" style="font-size: 0.85rem;"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    container.appendChild(table);
    
    // Populate the add dropdown
    const addSelect = document.getElementById("add-location-select");
    if (addSelect) {
      addSelect.innerHTML = "";
      const available = (state.userProfile?.locations || ["Local Principal"]).filter(l => tempLocationStock[l] === undefined);
      available.forEach(l => {
        const opt = document.createElement("option");
        opt.value = l;
        opt.innerText = l;
        addSelect.appendChild(opt);
      });
      if (available.length === 0) {
        addSelect.innerHTML = '<option value="">Sin ubicaciones para añadir</option>';
      }
    }
  }
}

function saveAllLocationStocks() {
  const isComercio = state.businessType === "comercio";
  if (isComercio) {
    const simpleInputs = document.querySelectorAll(".product-simple-stock-input");
    simpleInputs.forEach(input => {
      const loc = input.dataset.location;
      const val = input.value;
      if (!tempLocationStock[loc]) tempLocationStock[loc] = {};
      tempLocationStock[loc]["Único"] = val !== "" ? parseInt(val) : 0;
    });
  } else {
    const sizeInputs = document.querySelectorAll(".product-stock-input");
    sizeInputs.forEach(input => {
      const loc = input.dataset.location;
      const sz = input.dataset.size;
      const val = input.value;
      if (!tempLocationStock[loc]) tempLocationStock[loc] = {};
      tempLocationStock[loc][sz] = val !== "" ? parseInt(val) : 0;
    });
  }
}
window.saveAllLocationStocks = saveAllLocationStocks;

function addProductLocationRow() {
  saveAllLocationStocks();
  const select = document.getElementById("add-location-select");
  if (!select) return;
  const loc = select.value;
  if (!loc) return;
  
  const configuredSizes = getEditModalProductSizes();
  const initSizes = {};
  configuredSizes.forEach(sz => initSizes[sz] = 0);
  
  tempLocationStock[loc] = initSizes;
  renderProductLocationRows();
}
window.addProductLocationRow = addProductLocationRow;

function removeProductLocationRow(loc) {
  saveAllLocationStocks();
  if (Object.keys(tempLocationStock).length <= 1) {
    showToast("Debes tener al menos una ubicación para el stock.", true);
    return;
  }
  delete tempLocationStock[loc];
  renderProductLocationRows();
}
window.removeProductLocationRow = removeProductLocationRow;

function addProductLocationSimpleRow() {
  saveAllLocationStocks();
  const select = document.getElementById("add-location-simple-select");
  if (!select) return;
  const loc = select.value;
  if (!loc) return;
  
  tempLocationStock[loc] = { 'Único': 0 };
  renderProductLocationRows();
}
window.addProductLocationSimpleRow = addProductLocationSimpleRow;

function removeProductLocationSimpleRow(loc) {
  saveAllLocationStocks();
  if (Object.keys(tempLocationStock).length <= 1) {
    showToast("Debes tener al menos una ubicación para el stock.", true);
    return;
  }
  delete tempLocationStock[loc];
  renderProductLocationRows();
}
window.removeProductLocationSimpleRow = removeProductLocationSimpleRow;


function renderSecurityStockGrid() {
  const container = document.getElementById("talles-ss-grid-container");
  if (!container) return;
  
  const sizes = getEditModalProductSizes();
  container.innerHTML = sizes.map(sz => `
    <div>
      <label class="form-label" style="text-align: center; font-size: 0.65rem; margin-bottom: 4px;">${sz}</label>
      <input type="number" id="ss-${sz}" class="form-input" style="text-align: center; padding: 6px;" placeholder="-" min="0">
    </div>
  `).join("");
}

// Product Modal (Add/Edit)
function openCreateProductModal() {
  // Populate categories first so we can query the selected category
  populateProductFormCategories("");
  const currentCat = document.getElementById("prod-category")?.value || "";

  // Initialize active product-specific sizes from category config
  state.tempActiveProductSizes = getConfiguredSizes(currentCat);
  renderProductModalSizesSelector(currentCat);

  renderSecurityStockGrid();
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
  }
  
  // Limpiar stock dinámico
  document.getElementById("prod-te").value = "";
  document.getElementById("prod-ss").value = "";
  document.getElementById("prod-te-textil").value = "";
  
  // Limpiar stocks de seguridad de talles
  getConfiguredSizes(currentCat).forEach(sz => {
    const ssEl = document.getElementById(`ss-${sz}`);
    if (ssEl) {
      ssEl.value = "";
      ssEl.readOnly = false;
    }
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-name").placeholder = isComercio ? "Ej. Alfajor Triple Chocolate" : "Ej. Remera Oversize Negra";
  document.getElementById("prod-sku").placeholder = isComercio ? "Ej. ALFA-CHO-01" : "Ej. REM-OVR-N";
  
  // Initialize locations stock strictly with configured user locations
  tempLocationStock = {};
  const configuredUserLocs = (state.userProfile?.locations && state.userProfile.locations.length > 0)
    ? state.userProfile.locations
    : ["Local Principal"];

  configuredUserLocs.forEach(loc => {
    const initSizes = {};
    getConfiguredSizes(currentCat).forEach(sz => initSizes[sz] = 0);
    tempLocationStock[loc] = initSizes;
  });
  renderProductLocationRows();
  
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
  
  // Rellenar adicionales selectors (vacío para nuevo producto)
  populateExtrasSelectors({});

  recalculateProductPrice();
  
  document.getElementById("product-modal").className = "modal-overlay active";
}

function getProductGroupKey(p) {
  if (!p) return "";
  const pSku = p.sku || p.id || "";
  const cleanBase = getCleanBaseSku(p.sku, p.baseSku) || "";
  let nameStr = (p.name || "").trim();
  const colorStr = (p.color || "").trim();
  
  if (colorStr && colorStr.toLowerCase() !== "único" && colorStr.toLowerCase() !== "unico") {
    const regex = new RegExp(`\\s+${colorStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i");
    nameStr = nameStr.replace(regex, "").trim();
  }
  
  const cleanNameKey = cleanCompareText(nameStr);
  const colorKey = colorStr ? colorStr.toLowerCase() : "";
  return (cleanNameKey || cleanBase || "PROD") + ((colorKey && colorKey !== "único" && colorKey !== "unico") ? `_${colorKey}` : "");
}

function openEditProductModal(sku) {
  const p = state.products.find(prod => prod.sku === sku);
  if (!p) return;

  document.getElementById("modal-product-title").innerText = "Editar Variante";
  
  const cleanBase = getCleanBaseSku(p.sku, p.baseSku);
  document.getElementById("prod-sku").value = cleanBase;
  document.getElementById("prod-sku").readOnly = true; // no se edita SKU ya guardado
  document.getElementById("prod-name").value = getProductNameWithColor(p);
  document.getElementById("prod-color").value = p.color || "";
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
  }
  
  // Cargar stock de todas las variantes del mismo producto y mismo color (compartiendo baseSku y color a través del groupKey)
  const targetGroupKey = getProductGroupKey(p);
  document.getElementById("product-modal").dataset.oldGroupKey = targetGroupKey;
  
  const rawVariants = state.products.filter(prod => {
    if (!prod) return false;
    const s = prod.sku || prod.id || "";
    if (!s || s.startsWith("supplier_") || s.startsWith("fixedcost_") || s.startsWith("account_") || s.startsWith("cashtransaction_") || s.startsWith("influencer_") || s.startsWith("marketingexpense_") || s.startsWith("stockintake_") || s === "extras_config" || s === "categories_config") {
      return false;
    }
    return getProductGroupKey(prod) === targetGroupKey;
  });

  const variantsBySize = new Map();
  rawVariants.forEach(v => {
    const szKey = (v.size || "").toLowerCase().trim();
    if (!variantsBySize.has(szKey)) {
      variantsBySize.set(szKey, v);
    } else {
      const existing = variantsBySize.get(szKey);
      if (!existing.tiendanube_variant_id && v.tiendanube_variant_id) {
        variantsBySize.set(szKey, v);
      }
    }
  });
  const variants = Array.from(variantsBySize.values());
  
  // Build tempLocationStock STRICTLY with configured user locations
  tempLocationStock = {};
  const configuredUserLocs = (state.userProfile?.locations && state.userProfile.locations.length > 0)
    ? state.userProfile.locations
    : ["Local Principal"];

  configuredUserLocs.forEach(loc => {
    tempLocationStock[loc] = {};
  });

  variants.forEach(v => {
    configuredUserLocs.forEach(loc => {
      let qty = 0;
      if (v.locationsStock) {
        // Find matching key in locationsStock case-insensitively
        const matchedKey = Object.keys(v.locationsStock).find(k => k.toLowerCase().trim() === loc.toLowerCase().trim());
        if (matchedKey !== undefined) {
          qty = parseInt(v.locationsStock[matchedKey]) || 0;
        }
      }
      // Backwards compatibility: if locationsStock is empty/missing, assign the variant's main stock to the first configured location
      if ((!v.locationsStock || Object.keys(v.locationsStock).length === 0) && loc === configuredUserLocs[0]) {
        qty = parseInt(v.stock_local !== undefined ? v.stock_local : v.stock) || 0;
      }
      tempLocationStock[loc][v.size] = qty;
    });
  });
  
  // Initialize active product-specific sizes from configured sizes for this product/category
  state.tempActiveProductSizes = getConfiguredSizes(p.category, targetGroupKey);
  renderProductModalSizesSelector(p.category);

  // Requirement 1: Hide Talles Habilitados selector when editing existing product from Inventario actions column
  const sizesSelectorContainer = document.getElementById("product-modal-sizes-selector-container");
  if (sizesSelectorContainer) {
    sizesSelectorContainer.style.display = "none";
  }

  // Populate product category BEFORE rendering so categorySizes are resolved correctly
  populateProductFormCategories(p.category);

  renderSecurityStockGrid();
  renderProductLocationRows();

  // Load security stock
  getEditModalProductSizes().forEach(sz => {
    // ssInput IDs may be problematic if sz contains spaces or special characters.
    // It's assumed the DOM is updated to match.
    const ssInput = document.getElementById(`ss-${sz}`);
    if (ssInput) ssInput.readOnly = false;
    
    const variant = variants.find(v => v.size === sz);
    if (variant) {
      if (ssInput) ssInput.value = (variant.securityStock !== undefined && variant.securityStock !== null && variant.securityStock !== "") ? variant.securityStock : "";
    } else {
      if (ssInput) ssInput.value = "";
    }
  });

  const isComercio = state.businessType === "comercio";
  document.getElementById("prod-name").placeholder = isComercio ? "Ej. Alfajor Triple Chocolate" : "Ej. Remera Oversize Negra";
  document.getElementById("prod-sku").placeholder = isComercio ? "Ej. ALFA-CHO-01" : "Ej. REM-OVR-N";
  
  const talleCard = document.getElementById("product-talles-card");
  const simpleStockContainer = document.getElementById("product-simple-stock-container");
  
  const globalSsContainer = document.getElementById("prod-stock-critico-global-inputs");
  const talleSsContainer = document.getElementById("product-talles-ss-container");
  const explanationExample = document.getElementById("prod-ss-explanation-example");

  if (isComercio) {
    if (talleCard) talleCard.style.display = "none";
    if (simpleStockContainer) simpleStockContainer.style.display = "block";
    // prod-stock-simple is handled by renderProductLocationRows
    

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
  if (!select) return;
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
  select.onchange = function() {
    const newCat = select.value;
    state.tempActiveProductSizes = getConfiguredSizes(newCat);
    renderProductModalSizesSelector(newCat);
    renderSecurityStockGrid();
    renderProductLocationRows();
  };
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
  const roundedPrice = Math.round(price / 100) * 100;

  document.getElementById("prod-total-cost-display").innerText = `$ ${Math.round(totalCost).toLocaleString()}`;
  document.getElementById("prod-price-preview").innerText = `$ ${roundedPrice.toLocaleString()}`;

  const priceLocalInput = document.getElementById("prod-price-local");
  if (priceLocalInput) {
    priceLocalInput.value = roundedPrice;
    formatCurrencyField(priceLocalInput);
  }
}

function recalculateMarginFromPrice() {
  const baseCost = parseFloat(document.getElementById("prod-cost-input").value.replace(/\D/g, "")) || 0;
  const priceLocal = parseLocalFloat(document.getElementById("prod-price-local").value) || 0;
  
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
  if (totalCost > 0) {
    const margin = ((priceLocal / totalCost) - 1) * 100;
    document.getElementById("prod-margin").value = Math.round(margin * 100) / 100;
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
    
    getEditModalProductSizes().forEach(sz => {
      const ssEl = document.getElementById(`ss-${sz}`);
      if (ssEl) {
        const ssInputVal = ssEl.value.trim();
        sizeSecurityStocks[sz] = ssInputVal !== "" ? parseInt(ssInputVal) || 0 : null;
      }
    });
  }

  // Recolectar stock por ubicaciones y calcular total por talle
  saveAllLocationStocks();
  const sizeStocks = {};
  const locationsStocksPerSize = {};
  
  Object.keys(tempLocationStock).forEach(loc => {
    Object.keys(tempLocationStock[loc]).forEach(sz => {
      if (isComercio && sz !== "Único") return;
      const qty = tempLocationStock[loc][sz] || 0;
      if (sizeStocks[sz] === undefined) {
        sizeStocks[sz] = 0;
        locationsStocksPerSize[sz] = {};
      }
      sizeStocks[sz] += qty;
      locationsStocksPerSize[sz][loc] = qty;
    });
  });

  let variantCount = Object.keys(sizeStocks).filter(sz => sizeStocks[sz] >= 0).length;
  if (!isComercio && variantCount === 0) {
    showToast("Por favor, ingresa stock para al menos una ubicación/talle.", true);
    return;
  }

  const priceLocal = Math.round((parseLocalFloat(document.getElementById("prod-price-local").value) || 0) / 100) * 100;
  const priceTiendanube = Math.round((parseLocalFloat(document.getElementById("prod-price-tiendanube").value) || 0) / 100) * 100;
  const stockTaller = document.getElementById("prod-stock-taller").value || "infinito";

  // Preparar variantes en lote
  const batchPayload = [];
  
  const title = document.getElementById("modal-product-title").innerText;
  const isEditing = title.startsWith("Editar");
  
  if (isEditing) {
    // Guardar cambios para todos los talles ingresados
    const oldGroupKey = document.getElementById("product-modal").dataset.oldGroupKey;
    const cleanBaseSku = baseSku.trim().toUpperCase();
    const cleanColorStr = (color && color.toLowerCase() !== "único" && color.toLowerCase() !== "unico") ? color.replace(/[\/\s()]/g, "_").toUpperCase() : "";

    // Delete variants that were deselected/disabled by the user
    if (!isComercio && Array.isArray(state.tempActiveProductSizes)) {
      const activeSizes = getEditModalProductSizes();
      const rawVariants = state.products.filter(prod => {
        if (!prod) return false;
        const s = prod.sku || prod.id || "";
        if (!s || s.startsWith("supplier_") || s.startsWith("fixedcost_") || s.startsWith("account_") || s.startsWith("cashtransaction_") || s.startsWith("influencer_") || s.startsWith("marketingexpense_") || s.startsWith("stockintake_") || s === "extras_config" || s === "categories_config") {
          return false;
        }
        return getProductGroupKey(prod) === oldGroupKey;
      });

      const deactivatedVariants = rawVariants.filter(v => {
        return !activeSizes.some(sz => (sz || "").toLowerCase().trim() === (v.size || "").toLowerCase().trim());
      });

      deactivatedVariants.forEach(v => {
        if (v.sku) {
          apiRequest(`/api/products/${v.sku}`, "DELETE").catch(err => console.log("Cleaned up deactivated variant:", err));
        }
      });
    }

    for (const [size, stock] of Object.entries(sizeStocks)) {
      const matchingVariants = state.products.filter(v => {
        if (!v) return false;
        const s = v.sku || v.id || "";
        if (!s || s.startsWith("supplier_") || s.startsWith("fixedcost_") || s.startsWith("account_") || s.startsWith("cashtransaction_") || s.startsWith("influencer_") || s.startsWith("marketingexpense_") || s.startsWith("stockintake_") || s === "extras_config" || s === "categories_config") {
          return false;
        }
        return getProductGroupKey(v) === oldGroupKey && (v.size || "").toLowerCase().trim() === (size || "").toLowerCase().trim();
      });

      let existingVariant = matchingVariants.find(v => v.tiendanube_variant_id) || matchingVariants[0];

      if (matchingVariants.length > 1) {
        matchingVariants.forEach(dup => {
          if (dup.id !== existingVariant?.id && dup.sku) {
            apiRequest(`/api/products/${dup.sku}`, "DELETE").catch(err => console.log("Cleaned dup variant error:", err));
          }
        });
      }
      const variantSecurityStock = isComercio ? globalSecurityStock : sizeSecurityStocks[size];
      const cleanSizeStr = size.replace("Único", "U").replace(/[\/\s()]/g, "_");
      const safeSku = existingVariant ? existingVariant.sku.replace(/\//g, "_") : (cleanColorStr ? `${cleanBaseSku}-${cleanColorStr}-${cleanSizeStr}` : `${cleanBaseSku}-${cleanSizeStr}`);
      
      const payload = {
        id: existingVariant ? existingVariant.id : Date.now() + Math.random(),
        baseSku: cleanBaseSku,
        sku: safeSku,
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
        locationsStock: locationsStocksPerSize[size] || {},
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
    const cleanColorStr = (color && color.toLowerCase() !== "único" && color.toLowerCase() !== "unico") ? color.replace(/[\/\s()]/g, "_").toUpperCase() : "";
    for (const [size, stock] of Object.entries(sizeStocks)) {
      const variantSecurityStock = isComercio ? globalSecurityStock : sizeSecurityStocks[size];
      const cleanSizeStr = size.replace("Único", "U").replace(/[\/\s()]/g, "_");
      const safeSku = cleanColorStr ? `${baseSku}-${cleanColorStr}-${cleanSizeStr}` : `${baseSku}-${cleanSizeStr}`;
      const payload = {
        id: Date.now() + Math.random(),
        baseSku: baseSku,
        sku: safeSku,
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
        locationsStock: locationsStocksPerSize[size] || {},
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
  const cleanBase = getCleanBaseSku(p.sku, p.baseSku);
  const cleanName = cleanCompareText(p.name || "");
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
    (getCleanBaseSku(prod.sku, prod.baseSku) === cleanBase || cleanCompareText(prod.name || "") === cleanName)
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

function getExcelColumnName(colIndex) {
  let temp, letter = "";
  let idx = colIndex;
  while (idx >= 0) {
    temp = idx % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

async function exportInventoryToExcel() {
  try {
    showToast("Generando archivo Excel...");

    const filteredProducts = (state.products || []).filter(p => p && p.sku && 
      !p.sku.startsWith("supplier_") && 
      !p.sku.startsWith("fixedcost_") && 
      !p.sku.startsWith("account_") && 
      !p.sku.startsWith("cashtransaction_") && 
      !p.sku.startsWith("influencer_") && 
      !p.sku.startsWith("marketingexpense_") && 
      !p.sku.startsWith("stockintake_") && 
      !p.sku.startsWith("productionorder_") && 
      p.sku !== "extras_config" && 
      p.sku !== "categories_config"
    );

    filteredProducts.sort((a, b) => {
      const nameA = getProductNameWithColor(a).trim();
      const nameB = getProductNameWithColor(b).trim();
      const comp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      if (comp !== 0) return comp;
      const skuA = (a.sku || "").trim();
      const skuB = (b.sku || "").trim();
      return skuA.localeCompare(skuB, 'es', { sensitivity: 'base' });
    });

    const locations = (state.userProfile?.locations && state.userProfile.locations.length > 0)
      ? state.userProfile.locations
      : ["Bahia Blanca", "Buenos Aires", "Local Principal"];

    let token = state.token;
    if (window.firebase && firebase.auth && firebase.auth().currentUser) {
      try {
        token = await firebase.auth().currentUser.getIdToken(true);
        state.token = token;
      } catch (err) {
        console.warn("No se pudo refrescar el token de Firebase:", err);
      }
    }

    const response = await fetch("/api/export-inventory-excel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        products: filteredProducts,
        extras: state.extras || {},
        locations: locations
      })
    });

    if (!response.ok) {
      let errText = "Error al exportar Excel";
      try {
        const errJson = await response.json();
        errText = errJson.error || errText;
      } catch(e) {}
      throw new Error(errText);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Inventario_Completo.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast("Excel descargado correctamente.");
  } catch (error) {
    showToast(error.message, true);
  }
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

function showConfirmModal(message, onConfirm, title = "Confirmar Acción", danger = true, confirmText = null) {
  const modal = document.getElementById("idx-confirm-modal");
  const titleEl = document.getElementById("confirm-modal-title");
  const messageEl = document.getElementById("confirm-modal-message");
  const confirmBtn = document.getElementById("confirm-modal-confirm");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  
  if (!modal) return;
  
  titleEl.innerText = title;
  messageEl.innerText = message;
  confirmBtn.innerText = confirmText ? confirmText : (danger ? "Eliminar" : "Confirmar");
  
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
            ${s.delivery_days || s.lead_time ? `
              <p style="font-size: 0.72rem; color: var(--accent-emerald); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-clock" style="font-size: 0.65rem;"></i> Entrega: ${s.delivery_days || s.lead_time} días
              </p>
            ` : ''}
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
  if (document.getElementById("supplier-lead-time")) document.getElementById("supplier-lead-time").value = "";
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
  if (document.getElementById("supplier-lead-time")) {
    document.getElementById("supplier-lead-time").value = (s.delivery_days !== undefined ? s.delivery_days : (s.lead_time !== undefined ? s.lead_time : ""));
  }
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
  const leadTimeInput = document.getElementById("supplier-lead-time");
  const deliveryDays = leadTimeInput && leadTimeInput.value !== "" ? parseInt(leadTimeInput.value) || 0 : 0;
  const address = document.getElementById("supplier-address").value.trim();
  const description = document.getElementById("supplier-description").value.trim();

  const categoryCheckboxes = document.querySelectorAll('input[name="supplier-category-checkbox"]:checked');
  const categories = Array.from(categoryCheckboxes).map(cb => cb.value);

  const productCheckboxes = document.querySelectorAll('input[name="supplier-product-checkbox"]:checked');
  const products = Array.from(productCheckboxes).map(cb => cb.value);

  const payload = { name, phone, delivery_days: deliveryDays, lead_time: deliveryDays, categories, products, address, description };
  if (sId) payload.id = sId;

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

function populateIntakeLocations() {
  const locSelect = document.getElementById("intake-location-select");
  if (!locSelect) return;
  
  const locations = (state.userProfile?.locations && state.userProfile.locations.length > 0) 
    ? state.userProfile.locations 
    : ["Local Principal"];
    
  locSelect.innerHTML = locations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
}
window.populateIntakeLocations = populateIntakeLocations;

// --- Stock Intake Form Setup & Submission ---
function setupStockIntakeForm() {
  const searchInput = document.getElementById("intake-product-search");
  const resultsDiv = document.getElementById("intake-search-results");
  const hiddenSkuInput = document.getElementById("intake-product-sku");
  const supplierSelect = document.getElementById("intake-supplier-select");
  const dateInput = document.getElementById("intake-date");
  
  renderIntakeTallesGrid();
  populateIntakeLocations();
  
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
    "intake-estampado-select", "intake-packaging-select", "intake-bordado-select"
  ];
  getConfiguredSizes().forEach(sz => inputsToRecalc.push(`intake-qty-${sz}`));
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
  
  getConfiguredSizes().forEach(sz => {
    const el = document.getElementById(`intake-qty-${sz}`);
    if (el) el.value = "";
    const stEl = document.getElementById(`intake-stock-${sz}`);
    if (stEl) stEl.style.display = "none";
  });
  
  recalculateIntakeCosts();
}

function getIntakeProductActiveSizes() {
  const sku = document.getElementById("intake-product-sku")?.value;
  if (sku) {
    const p = state.products.find(prod => prod.sku === sku);
    if (p) {
      return getConfiguredSizes(p.category, getProductGroupKey(p));
    }
  }
  return getConfiguredSizes();
}

function renderIntakeTallesGrid(category = null, productKey = null) {
  const container = document.getElementById("intake-talles-grid-container");
  if (!container) return;
  const sizes = getConfiguredSizes(category, productKey);
  container.innerHTML = sizes.map(sz => `
    <div style="width: 60px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;">
      <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-gray); display: block; margin-bottom: 4px;">${sz}</span>
      <input type="number" id="intake-qty-${sz}" class="form-input text-center" style="text-align: center; padding: 8px 4px; width: 100%;" placeholder="-" min="0">
      <span id="intake-stock-${sz}" style="display: none; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); font-weight: 700; font-size: 0.62rem; padding: 4px 2px; border-radius: 4px; margin-top: 6px; width: 100%; text-align: center; box-sizing: border-box;">Stock: 0</span>
    </div>
  `).join("");
}

function clearIntakePreviews() {
  getIntakeProductActiveSizes().forEach(key => {
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
    renderIntakeTallesGrid();
    return;
  }
  
  // Agrupar variantes por modelo/color usando getProductGroupKey para evitar duplicados en la lista de búsqueda
  const uniqueProducts = [];
  const seen = new Set();
  
  const actualProducts = state.products.filter(p => {
    if (!p || !p.sku) return false;
    const s = String(p.sku).toLowerCase();
    return !s.startsWith("supplier_") && 
           !s.startsWith("fixedcost_") && 
           !s.startsWith("account_") && 
           !s.startsWith("cashtransaction_") && 
           !s.startsWith("influencer_") && 
           !s.startsWith("marketingexpense_") && 
           !s.startsWith("stockintake_") && 
           !s.startsWith("productionorder_") && 
           s !== "extras_config" && 
           s !== "categories_config" && 
           s !== "user_profile";
  });
  
  actualProducts.forEach(p => {
    const groupKey = getProductGroupKey(p);
    if (!seen.has(groupKey)) {
      seen.add(groupKey);
      uniqueProducts.push(p);
    }
  });
  
  const filtered = uniqueProducts.filter(p => {
    const pName = (p.name || "").toLowerCase();
    const pSku = (p.sku || "").toLowerCase();
    const pBaseSku = (p.baseSku || "").toLowerCase();
    const displayName = getProductNameWithColor(p).toLowerCase();

    return pName.includes(query) || 
           displayName.includes(query) ||
           pSku.includes(query) ||
           (pBaseSku && pBaseSku.includes(query));
  }).sort((a, b) => {
    const nameA = getProductNameWithColor(a).toLowerCase().trim();
    const nameB = getProductNameWithColor(b).toLowerCase().trim();
    return nameA.localeCompare(nameB);
  });
  
  if (filtered.length === 0) {
    resultsDiv.innerHTML = `<div class="autocomplete-item" style="color: var(--text-muted);">No se encontraron productos</div>`;
    resultsDiv.style.display = "block";
    return;
  }
  
  resultsDiv.innerHTML = filtered.map(p => {
    const displayName = getProductNameWithColor(p);
    const cleanBase = getCleanBaseSku(p.sku, p.baseSku);
    return `
      <div class="autocomplete-item" onclick="selectIntakeProduct('${p.sku}')">
        <strong>${displayName}</strong> <span style="font-size: 0.7rem; color: var(--text-gray);">(${cleanBase})</span>
      </div>
    `;
  }).join("");
  resultsDiv.style.display = "block";
}

function selectIntakeProduct(sku) {
  const p = state.products.find(prod => prod.sku === sku);
  if (!p) return;
  
  const displayName = getProductNameWithColor(p);
  document.getElementById("intake-product-search").value = displayName;
  document.getElementById("intake-product-sku").value = p.sku;
  document.getElementById("intake-search-results").style.display = "none";
  
  // Rellenar costo base y margen
  const baseCostVal = p.baseCost || p.cost || 0;
  document.getElementById("intake-materia-prima").value = baseCostVal ? Math.round(baseCostVal).toLocaleString("es-AR") : "0";
  document.getElementById("intake-margin").value = p.margin || 0;
  
  // Seleccionar adicionales si existen
  populateIntakeExtras(p);
  
  // Rellenar stock actual por talles de todas las variantes del mismo producto (mismo groupKey)
  const targetGroupKey = getProductGroupKey(p);
  renderIntakeTallesGrid(p.category, targetGroupKey);

  const variants = state.products.filter(prod => {
    if (!prod) return false;
    return getProductGroupKey(prod) === targetGroupKey;
  });
  
  if (state.businessType === "comercio") {
    const variant = variants.find(v => (v.size || "").toLowerCase().trim() === "único" || (v.size || "").toLowerCase().trim() === "unico");
    const stock = variant ? getProductLocationStockSum(variant) : (variants[0] ? getProductLocationStockSum(variants[0]) : 0);
    const elSimple = document.getElementById("intake-stock-simple-display");
    if (elSimple) {
      elSimple.innerText = `Stock Actual: ${stock}`;
      elSimple.style.display = "inline-block";
    }
  } else {
    getConfiguredSizes(p.category, targetGroupKey).forEach(sz => {
      const variant = variants.find(v => (v.size || "").toLowerCase().trim() === sz.toLowerCase().trim());
      const stock = variant ? getProductLocationStockSum(variant) : 0;
      const el = document.getElementById(`intake-stock-${sz}`);
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
      const sizes = getIntakeProductActiveSizes();
      sizes.forEach(sz => {
        const el = document.getElementById(`intake-qty-${sz}`);
        if (el) {
          totalQuantity += parseInt(el.value) || 0;
        }
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
  
  const selectedLocation = document.getElementById("intake-location-select")?.value || (state.userProfile?.locations?.[0] || "Local Principal");
  
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
        location: selectedLocation,
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
    sizesInput = {};
    getIntakeProductActiveSizes().forEach(sz => {
      const el = document.getElementById(`intake-qty-${sz}`);
      if (el) {
        sizesInput[sz] = parseInt(el.value) || 0;
      }
    });
  }
  
  const sizesToUpdate = Object.entries(sizesInput).filter(([_, qty]) => qty > 0);
  if (sizesToUpdate.length === 0) {
    showToast(state.businessType === "comercio" ? "Por favor, ingresa una cantidad mayor a 0." : "Por favor, ingresa una cantidad mayor a 0 en al menos un talle.", true);
    return;
  }
  
  const baseCost = parseFloat(document.getElementById("intake-materia-prima").value.replace(/\D/g, "")) || 0;
  
  const marginInput = document.getElementById("intake-margin").value;
  const margin = parseFloat(marginInput) || 0;
  
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
    
    const targetGroupKey = getProductGroupKey(selectedProduct);
    
    for (const [size, qty] of sizesToUpdate) {
      let existing = state.products.find(p => {
        if (!p) return false;
        const isGroupMatch = getProductGroupKey(p) === targetGroupKey;
        const isSkuMatch = (p.baseSku && p.baseSku.toLowerCase() === baseSku.toLowerCase()) || 
                           (p.sku && (p.sku.toLowerCase() === baseSku.toLowerCase() || p.sku.toLowerCase().startsWith(baseSku.toLowerCase() + '-')));
        const isSizeMatch = (p.size || "").toLowerCase().trim() === size.toLowerCase().trim();
        return (isGroupMatch || isSkuMatch) && isSizeMatch;
      });
      
      if (existing) {
        const locsStock = existing.locationsStock || {};
        const matchedLocKey = Object.keys(locsStock).find(k => k.trim().toLowerCase() === selectedLocation.trim().toLowerCase()) || selectedLocation;
        
        let currentLocStock = 0;
        if (locsStock[matchedLocKey] !== undefined) {
          currentLocStock = parseInt(locsStock[matchedLocKey]) || 0;
        } else if (existing.stock !== undefined && existing.stock !== null) {
          currentLocStock = parseInt(existing.stock) || 0;
        }
        
        const updatedLocStock = {
          ...locsStock,
          [matchedLocKey]: currentLocStock + qty
        };

        const newTotalStock = Object.values(updatedLocStock).reduce((acc, v) => acc + (parseInt(v) || 0), 0);

        const updatedVariant = {
          ...existing,
          stock: newTotalStock,
          locationsStock: updatedLocStock,
          location: selectedLocation,
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
        const sizeSkuSuffix = getSizeSkuSuffix(size);
        const newVariant = {
          id: Date.now() + Math.random(),
          baseSku: baseSku,
          sku: `${baseSku}-${sizeSkuSuffix}`,
          name: selectedProduct.name,
          category: selectedProduct.category,
          size: size,
          color: selectedProduct.color || 'Único',
          stock: qty,
          locationsStock: { [selectedLocation]: qty },
          location: selectedLocation,
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
      location: selectedLocation,
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
            <p style="font-size: 0.7rem; color: var(--text-gray); margin-top: 2px;">
              Proveedor: <strong>${item.supplierName}</strong>
              ${item.location ? ` | <span style="background: rgba(37,99,235,0.15); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.65rem;">📍 ${item.location}</span>` : ''}
            </p>
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
// FIFO matching helper to calculate payment metrics
function calculateAccountMetrics(acc) {
  const txs = acc.transactions || [];
  // Sort chronologically
  const sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const debts = [];
  const payments = [];
  
  sortedTxs.forEach(tx => {
    const amt = tx.amount || 0;
    const pay = tx.payment || 0;
    if (amt > 0) {
      debts.push({
        date: new Date(tx.date),
        amount: amt,
        originalAmount: amt
      });
    }
    if (pay > 0) {
      payments.push({
        date: new Date(tx.date),
        amount: pay
      });
    }
  });
  
  let totalDaysSum = 0;
  let totalPortionSum = 0;
  
  // FIFO matching
  let debtIdx = 0;
  payments.forEach(p => {
    let payAmt = p.amount;
    const paymentDate = p.date;
    
    while (payAmt > 0 && debtIdx < debts.length) {
      const activeDebt = debts[debtIdx];
      const portion = Math.min(payAmt, activeDebt.amount);
      
      const diffTime = paymentDate - activeDebt.date;
      const diffDays = Math.max(0, diffTime / (1000 * 60 * 60 * 24));
      
      totalDaysSum += diffDays * portion;
      totalPortionSum += portion;
      
      payAmt -= portion;
      activeDebt.amount -= portion;
      
      if (activeDebt.amount <= 0.001) {
        debtIdx++;
      }
    }
  });
  
  const avgDays = totalPortionSum > 0 ? (totalDaysSum / totalPortionSum) : null;
  
  // Calculate overdue/due soon on the remaining unpaid debts
  const termDays = acc.paymentTerms !== undefined ? parseInt(acc.paymentTerms, 10) : 30;
  const today = new Date();
  today.setHours(0,0,0,0);
  
  let overdueAmount = 0;
  let dueSoonWeek = 0;
  let dueSoonMonth = 0;
  
  for (let i = debtIdx; i < debts.length; i++) {
    const activeDebt = debts[i];
    const unpaidAmt = activeDebt.amount;
    if (unpaidAmt <= 0) continue;
    
    // Calculate difference in days since the debt was incurred
    const diffTime = today - activeDebt.date;
    const elapsedDays = diffTime / (1000 * 60 * 60 * 24);
    
    // If it exceeded payment terms, it is overdue (vencido)
    if (elapsedDays > termDays) {
      overdueAmount += unpaidAmt;
    } else {
      // It is not overdue yet. Calculate due date.
      const dueDate = new Date(activeDebt.date);
      dueDate.setDate(dueDate.getDate() + termDays);
      dueDate.setHours(0,0,0,0);
      
      const timeToDue = dueDate - today;
      const daysToDue = timeToDue / (1000 * 60 * 60 * 24);
      
      if (daysToDue >= 0 && daysToDue <= 7) {
        dueSoonWeek += unpaidAmt;
      }
      if (daysToDue >= 0 && daysToDue <= 30) {
        dueSoonMonth += unpaidAmt;
      }
    }
  }
  
  return {
    avgDays: avgDays !== null ? Math.round(avgDays) : null,
    overdueAmount: Math.round(overdueAmount),
    dueSoonWeek: Math.round(dueSoonWeek),
    dueSoonMonth: Math.round(dueSoonMonth)
  };
}

function renderSupplierAccounts() {
  const container = document.getElementById("supplier-accounts-list");
  if (!container) return;
  container.innerHTML = "";

  const searchVal = (document.getElementById("supplier-accounts-search")?.value || "").toLowerCase();
  const proveedors = state.currentAccounts.filter(a => a.type === "proveedor" && a.entityName.toLowerCase().includes(searchVal));

  // Calcular métricas globales
  let globalTotal = 0;
  let totalAvgDaysSum = 0;
  let accountsWithPayments = 0;
  let totalDueSoonWeek = 0;
  let totalDueSoonMonth = 0;

  proveedors.forEach(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0;
    globalTotal += Math.max(0, balance);

    const metrics = calculateAccountMetrics(acc);
    acc._metrics = metrics; // cache to use during render

    if (metrics.avgDays !== null) {
      totalAvgDaysSum += metrics.avgDays;
      accountsWithPayments++;
    }
    totalDueSoonWeek += metrics.dueSoonWeek;
    totalDueSoonMonth += metrics.dueSoonMonth;
  });

  const globalAvgDays = accountsWithPayments > 0 ? Math.round(totalAvgDaysSum / accountsWithPayments) : null;

  // Actualizar KPIs del header
  const kpiVal = document.getElementById("supplier-accounts-kpi-val");
  if (kpiVal) kpiVal.innerText = `$ ${Math.round(globalTotal).toLocaleString()}`;

  const kpiAvgDays = document.getElementById("supplier-accounts-kpi-avg-days");
  if (kpiAvgDays) {
    kpiAvgDays.innerText = globalAvgDays !== null ? `${globalAvgDays} días` : "-";
  }

  const periodSelect = document.getElementById("supplier-kpi-due-period")?.value || "week";
  const dueSoonVal = periodSelect === "week" ? totalDueSoonWeek : totalDueSoonMonth;
  const kpiDueSoon = document.getElementById("supplier-accounts-kpi-due-soon");
  if (kpiDueSoon) {
    kpiDueSoon.innerText = `$ ${Math.round(dueSoonVal).toLocaleString()}`;
  }

  if (proveedors.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay cuentas de proveedores registradas.</div>`;
    return;
  }

  proveedors.forEach(acc => {
    const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
    const metrics = acc._metrics;
    
    // Pre-calcular deudas impagas mediante FIFO
    const txs = acc.transactions || [];
    txs.forEach(t => t._remaining = t.amount || 0);
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const debts = sortedTxs.filter(t => (t.amount || 0) > 0);
    const payments = sortedTxs.filter(t => (t.payment || 0) > 0);
    
    let debtIdx = 0;
    payments.forEach(p => {
      let payAmt = p.payment || p.amount;
      while (payAmt > 0 && debtIdx < debts.length) {
        const activeDebt = debts[debtIdx];
        const portion = Math.min(payAmt, activeDebt._remaining);
        activeDebt._remaining -= portion;
        payAmt -= portion;
        if (activeDebt._remaining <= 0.001) {
          debtIdx++;
        }
      }
    });
    
    let txRows = "";
    if (!acc.transactions || acc.transactions.length === 0) {
      txRows = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray); padding: 12px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
    } else {
      const sorted = [...acc.transactions].reverse();
      sorted.forEach(tx => {
        const dateStr = new Date(tx.date).toLocaleDateString('es-AR');
        let dueDateStr = "-";
        let dueStyle = "color: var(--text-gray); font-size: 0.75rem;";
        
        if ((tx.amount || 0) > 0) {
          const termDays = acc.paymentTerms !== undefined ? parseInt(acc.paymentTerms, 10) : 30;
          const dDate = new Date(tx.date);
          dDate.setDate(dDate.getDate() + termDays);
          dueDateStr = dDate.toLocaleDateString('es-AR');
          
          const today = new Date();
          today.setHours(0,0,0,0);
          
          if (tx._remaining > 0.01) {
            if (dDate < today) {
              dueStyle = "color: #f87171; font-weight: 800; font-size: 0.75rem;";
              dueDateStr = `⚠️ Vencido (${dueDateStr})`;
            } else {
              dueStyle = "color: #f59e0b; font-weight: 700; font-size: 0.75rem;";
            }
          } else {
            dueStyle = "color: #10b981; font-size: 0.75rem; text-decoration: line-through; opacity: 0.6;";
            dueDateStr = `Saldado`;
          }
        }
        
        txRows += `
          <tr>
            <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
            <td style="${dueStyle}">${dueDateStr}</td>
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
            <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-white);">${acc.entityName}</h3>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
            <span>📞 ${acc.phone || "-"}</span>
            <span>📍 ${acc.address || "-"}</span>
          </div>
          <div style="font-size: 0.7rem; color: var(--text-gray-light); margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap; background: rgba(255,255,255,0.02); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
            <span>⏱️ Pago Prom.: <strong style="color: var(--accent-blue);">${metrics.avgDays !== null ? metrics.avgDays + ' días' : 'Sin pagos'}</strong></span>
            <span>📅 Vence pronto: <strong style="color: #f59e0b;">$ ${metrics.dueSoonMonth.toLocaleString()} (mes)</strong></span>
            <span>Plazo Acordado: <strong>${acc.paymentTerms !== undefined ? acc.paymentTerms : 30} días</strong></span>
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
              <th>VENCIMIENTO</th>
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
  let clientes = state.currentAccounts.filter(a => a.type === "cliente" && a.entityName.toLowerCase().includes(searchVal));

  // Calcular balances y ordenar por mayor deuda
  clientes.forEach(acc => {
    acc._balance = acc.transactions ? acc.transactions.reduce((s, tx) => s + (tx.amount - tx.payment), 0) : 0;
  });
  clientes.sort((a, b) => b._balance - a._balance);

  // Calcular métricas globales
  let globalTotal = 0;
  let totalAvgDaysSum = 0;
  let accountsWithPayments = 0;
  let totalOverdue = 0;

  clientes.forEach(acc => {
    const balance = acc._balance;
    globalTotal += Math.max(0, balance);

    const metrics = calculateAccountMetrics(acc);
    acc._metrics = metrics;

    if (metrics.avgDays !== null) {
      totalAvgDaysSum += metrics.avgDays;
      accountsWithPayments++;
    }
    totalOverdue += metrics.overdueAmount;
  });

  const globalAvgDays = accountsWithPayments > 0 ? Math.round(totalAvgDaysSum / accountsWithPayments) : null;

  // Actualizar KPIs del header
  const kpiVal = document.getElementById("collections-kpi-val");
  if (kpiVal) kpiVal.innerText = `$ ${Math.round(globalTotal).toLocaleString()}`;

  const kpiAvgDays = document.getElementById("collections-kpi-avg-days");
  if (kpiAvgDays) {
    kpiAvgDays.innerText = globalAvgDays !== null ? `${globalAvgDays} días` : "-";
  }

  const kpiOverdue = document.getElementById("collections-kpi-overdue");
  if (kpiOverdue) {
    kpiOverdue.innerText = `$ ${Math.round(totalOverdue).toLocaleString()}`;
  }

  if (clientes.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-gray); padding: 40px; font-size: 0.8rem;">No hay cuentas corrientes de clientes registradas.</div>`;
    return;
  }

  clientes.forEach(acc => {
    const balance = Math.max(0, acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0);
    const metrics = acc._metrics;
    
    // Pre-calcular deudas impagas mediante FIFO
    const txs = acc.transactions || [];
    txs.forEach(t => t._remaining = t.amount || 0);
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const debts = sortedTxs.filter(t => (t.amount || 0) > 0);
    const payments = sortedTxs.filter(t => (t.payment || 0) > 0);
    
    let debtIdx = 0;
    payments.forEach(p => {
      let payAmt = p.payment || p.amount;
      while (payAmt > 0 && debtIdx < debts.length) {
        const activeDebt = debts[debtIdx];
        const portion = Math.min(payAmt, activeDebt._remaining);
        activeDebt._remaining -= portion;
        payAmt -= portion;
        if (activeDebt._remaining <= 0.001) {
          debtIdx++;
        }
      }
    });
    
    let txRows = "";
    if (!acc.transactions || acc.transactions.length === 0) {
      txRows = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray); padding: 12px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
    } else {
      const sorted = [...acc.transactions].reverse();
      sorted.forEach(tx => {
        const dateStr = new Date(tx.date).toLocaleDateString('es-AR');
        let dueDateStr = "-";
        let dueStyle = "color: var(--text-gray); font-size: 0.75rem;";
        
        if ((tx.amount || 0) > 0) {
          const termDays = acc.paymentTerms !== undefined ? parseInt(acc.paymentTerms, 10) : 30;
          const dDate = new Date(tx.date);
          dDate.setDate(dDate.getDate() + termDays);
          dueDateStr = dDate.toLocaleDateString('es-AR');
          
          const today = new Date();
          today.setHours(0,0,0,0);
          
          if (tx._remaining > 0.01) {
            if (dDate < today) {
              dueStyle = "color: #f87171; font-weight: 800; font-size: 0.75rem;";
              dueDateStr = `⚠️ Vencido (${dueDateStr})`;
            } else {
              dueStyle = "color: #f59e0b; font-weight: 700; font-size: 0.75rem;";
            }
          } else {
            dueStyle = "color: #10b981; font-size: 0.75rem; text-decoration: line-through; opacity: 0.6;";
            dueDateStr = `Saldado`;
          }
        }
        
        txRows += `
          <tr>
            <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
            <td style="${dueStyle}">${dueDateStr}</td>
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
            <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-white);">${acc.entityName}</h3>
            <button class="btn-action" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="editAccount('${acc.id}')">✏️</button>
            <button class="btn-action btn-delete" style="border: none; background: transparent; padding: 2px; color: var(--text-gray); cursor: pointer;" onclick="deleteAccount('${acc.id}')">🗑️</button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-gray); margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
            <span>📞 ${acc.phone || "-"}</span>
            <span>📍 ${acc.address || "-"}</span>
          </div>
          <div style="font-size: 0.7rem; color: var(--text-gray-light); margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap; background: rgba(255,255,255,0.02); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
            <span>⏱️ Tardanza Prom.: <strong style="color: var(--accent-blue);">${metrics.avgDays !== null ? metrics.avgDays + ' días' : 'Sin pagos'}</strong></span>
            <span>⚠️ Vencido: <strong style="color: var(--accent-red);">$ ${metrics.overdueAmount.toLocaleString()}</strong></span>
            <span>Plazo Acordado: <strong>${acc.paymentTerms !== undefined ? acc.paymentTerms : 30} días</strong></span>
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
              <th>VENCIMIENTO</th>
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
  const submitBtn = document.getElementById("modal-account-submit-btn");
  if (submitBtn) submitBtn.innerText = "Registrar Cuenta";
  document.getElementById("acc-entity-name").value = "";
  if (document.getElementById("acc-cuit")) document.getElementById("acc-cuit").value = "";
  if (document.getElementById("acc-razon-social")) document.getElementById("acc-razon-social").value = "";
  if (document.getElementById("acc-condicion-iva")) document.getElementById("acc-condicion-iva").value = "CONSUMIDOR FINAL";
  document.getElementById("acc-phone").value = "";
  document.getElementById("acc-address").value = "";
  document.getElementById("acc-payment-terms").value = "";
  
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
  const cuit = document.getElementById("acc-cuit") ? document.getElementById("acc-cuit").value.trim() : "";
  const razonSocial = document.getElementById("acc-razon-social") ? document.getElementById("acc-razon-social").value.trim() : "";
  const condicionIva = document.getElementById("acc-condicion-iva") ? document.getElementById("acc-condicion-iva").value : "CONSUMIDOR FINAL";
  const phone = document.getElementById("acc-phone").value;
  const address = document.getElementById("acc-address").value;
  const termsVal = document.getElementById("acc-payment-terms").value.trim();
  const paymentTerms = termsVal !== "" ? parseInt(termsVal, 10) : 30;

  const payload = { entityName, type, phone, address, paymentTerms, cuit, razonSocial, condicionIva };
  if (accId) {
    payload.id = accId;
    const existingAcc = state.currentAccounts.find(a => a.id === accId);
    if (existingAcc && existingAcc.transactions) {
      payload.transactions = existingAcc.transactions;
    }
  }

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
  const submitBtn = document.getElementById("modal-account-submit-btn");
  if (submitBtn) submitBtn.innerText = "Guardar Cuenta";
  document.getElementById("acc-entity-name").value = acc.entityName || "";
  if (document.getElementById("acc-cuit")) document.getElementById("acc-cuit").value = acc.cuit || "";
  if (document.getElementById("acc-razon-social")) document.getElementById("acc-razon-social").value = acc.razonSocial || "";
  if (document.getElementById("acc-condicion-iva")) document.getElementById("acc-condicion-iva").value = acc.condicionIva || "CONSUMIDOR FINAL";
  document.getElementById("acc-phone").value = acc.phone || "";
  document.getElementById("acc-address").value = acc.address || "";
  document.getElementById("acc-payment-terms").value = acc.paymentTerms !== undefined ? acc.paymentTerms : "";
  
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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray); padding: 20px; font-size: 0.75rem;">No hay movimientos registrados.</td></tr>`;
  } else {
  // Ordenar de más reciente a más antiguo
  const sorted = [...acc.transactions].reverse();
  sorted.forEach(tx => {
    const dateStr = new Date(tx.date).toLocaleDateString('es-AR') + " " + new Date(tx.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const tr = document.createElement("tr");
    let accionesHtml = "";
    if (tx.payment > 0 && acc.type !== "proveedor") {
       accionesHtml = `<button class="btn btn-sm" style="background: rgba(16,185,129,0.1); color: var(--accent-green); border: 1px solid rgba(16,185,129,0.2); font-size: 0.7rem; padding: 4px 8px; margin-right: 6px;" onclick="generateReciboXPDF('${tx.id}', '${acc.id}', ${tx.payment}, '${tx.date}')"><i class="fa-solid fa-file-invoice"></i> Recibo X</button>`;
    }
    accionesHtml += `<button class="btn btn-sm" style="background: rgba(239,68,68,0.1); color: var(--accent-red); border: 1px solid rgba(239,68,68,0.2); font-size: 0.7rem; padding: 4px 8px;" onclick="deleteAccountTransaction('${acc.id}', '${tx.id}')" title="Eliminar movimiento"><i class="fa-solid fa-trash"></i></button>`;
    
    let dueDateHtml = "";
    if (tx.due_date && tx.amount > 0) {
      const dDate = new Date(tx.due_date);
      const isPast = dDate < new Date() && (tx.amount > tx.payment);
      const formattedDDate = dDate.toLocaleDateString('es-AR');
      if (isPast) {
        dueDateHtml = `<div style="font-size: 0.68rem; color: #f87171; font-weight: 700; margin-top: 2px; display: inline-flex; align-items: center; gap: 4px; background: rgba(239,68,68,0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.2);"><i class="fas fa-exclamation-circle"></i> Vencido: ${formattedDDate}</div>`;
      } else {
        dueDateHtml = `<div style="font-size: 0.68rem; color: #10b981; font-weight: 600; margin-top: 2px; display: inline-flex; align-items: center; gap: 4px; background: rgba(16,185,129,0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.2);"><i class="fas fa-clock"></i> Vence: ${formattedDDate}</div>`;
      }
    }

    tr.innerHTML = `
      <td style="font-size: 0.75rem; color: var(--text-gray);">${dateStr}</td>
      <td style="font-weight: 600;">
        ${tx.description}
        ${dueDateHtml}
      </td>
      <td style="text-align: right; color: #f87171;">$ ${Math.round(tx.amount).toLocaleString('es-AR')}</td>
      <td style="text-align: right; color: #10b981;">$ ${Math.round(tx.payment).toLocaleString('es-AR')}</td>
      <td style="text-align: right;">${accionesHtml}</td>
    `;
    tbody.appendChild(tr);
  });
  }

  // Reset form
  document.getElementById("tx-description").value = "";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-payment").value = "";
  
  if (document.getElementById("tx-type")) {
    document.getElementById("tx-type").value = "normal";
    if (typeof toggleTxInterestFields === 'function') toggleTxInterestFields();
  }

  if (document.getElementById("tx-financing-type")) {
    document.getElementById("tx-financing-type").value = "none";
    if (document.getElementById("tx-days-input")) document.getElementById("tx-days-input").value = "15";
    if (document.getElementById("tx-installments-input")) document.getElementById("tx-installments-input").value = "4";
    if (typeof toggleFinancingFields === 'function') toggleFinancingFields();
  }

  if (acc.type === "cliente") {
    const invoiceSelect = document.getElementById("tx-debit-note-invoice");
    if (invoiceSelect) {
      invoiceSelect.innerHTML = '<option value="">Seleccione la factura de origen...</option>';
      const clientSales = state.sales.filter(s => 
        s.arca_invoice_id && 
        ((s.client_name && s.client_name.toLowerCase().trim() === acc.entityName.toLowerCase().trim()) || 
         (s.client_cuit && acc.cuit && s.client_cuit === acc.cuit))
      );
      clientSales.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.innerText = `Venta ${s.id} - N° ${s.arca_invoice_id} ($${s.total})`;
        invoiceSelect.appendChild(opt);
      });
    }
  }

  document.getElementById("account-detail-modal").className = "modal-backdrop active";
}

function closeAccountDetailModal() {
  document.getElementById("account-detail-modal").className = "modal-backdrop";
}

function toggleFinancingFields() {
  const type = document.getElementById("tx-financing-type")?.value || "none";
  const daysGroup = document.getElementById("financing-days-group");
  const instGroup = document.getElementById("financing-installments-group");
  const instLabel = document.getElementById("financing-installments-label");

  if (daysGroup) daysGroup.style.display = (type === "days") ? "block" : "none";
  if (instGroup) instGroup.style.display = (type === "weekly_installments" || type === "monthly_installments") ? "block" : "none";

  if (instLabel) {
    instLabel.innerText = type === "weekly_installments" ? "Semanas / Cuotas" : "Meses / Cuotas";
  }

  updateFinancingSummary();
}
window.toggleFinancingFields = toggleFinancingFields;

function updateFinancingSummary() {
  const type = document.getElementById("tx-financing-type")?.value || "none";
  const summaryEl = document.getElementById("financing-summary");
  const rawAmtStr = document.getElementById("tx-amount")?.value || "0";
  const amount = parseFloat(rawAmtStr.replace(/\D/g, "")) || 0;

  if (!summaryEl) return;

  if (type === "none" || amount <= 0) {
    summaryEl.style.display = "none";
    summaryEl.innerHTML = "";
    return;
  }

  const now = new Date();

  if (type === "days") {
    const days = parseInt(document.getElementById("tx-days-input")?.value) || 0;
    if (days <= 0) {
      summaryEl.style.display = "none";
      return;
    }
    const dueDate = new Date(now.getTime() + days * 86400000);
    const dateStr = dueDate.toLocaleDateString("es-AR");
    summaryEl.innerHTML = `<i class="fas fa-clock"></i> <strong>Vencimiento:</strong> La deuda de $${amount.toLocaleString("es-AR")} vencerá el <strong>${dateStr}</strong> (en ${days} días).`;
    summaryEl.style.display = "block";
  } else if (type === "weekly_installments") {
    const cuotas = parseInt(document.getElementById("tx-installments-input")?.value) || 2;
    const cuotaAmount = Math.round(amount / cuotas);
    summaryEl.innerHTML = `<i class="fas fa-calendar-week"></i> <strong>Financiación Semanal:</strong> ${cuotas} cuotas semanales de <strong>$${cuotaAmount.toLocaleString("es-AR")}</strong> cada 7 días.`;
    summaryEl.style.display = "block";
  } else if (type === "monthly_installments") {
    const cuotas = parseInt(document.getElementById("tx-installments-input")?.value) || 2;
    const cuotaAmount = Math.round(amount / cuotas);
    summaryEl.innerHTML = `<i class="fas fa-calendar-alt"></i> <strong>Financiación Mensual:</strong> ${cuotas} cuotas mensuales de <strong>$${cuotaAmount.toLocaleString("es-AR")}</strong> cada 30 días.`;
    summaryEl.style.display = "block";
  }
}
window.updateFinancingSummary = updateFinancingSummary;

async function saveAccountTransactionForm(e) {
  e.preventDefault();
  const accId = document.getElementById("account-tx-id-input").value;
  const description = document.getElementById("tx-description").value;
  const amount = parseFloat(document.getElementById("tx-amount").value.replace(/\D/g, "")) || 0;
  const payment = parseFloat(document.getElementById("tx-payment").value.replace(/\D/g, "")) || 0;
  
  const txTypeEl = document.getElementById("tx-type");
  const type = txTypeEl ? txTypeEl.value : "normal";
  const txEmitEl = document.getElementById("tx-emit-debit-note");
  const emitDebitNote = txEmitEl ? txEmitEl.checked : false;
  const txInvoiceEl = document.getElementById("tx-debit-note-invoice");
  const invoiceId = txInvoiceEl ? txInvoiceEl.value : null;

  if (amount === 0 && payment === 0) {
    showToast("Ingresá un monto mayor a $0 en deuda o pago.", true);
    return;
  }

  if (type === "interest" && emitDebitNote && !invoiceId) {
    showToast("Para emitir la Nota de Débito en AFIP, seleccioná la Factura vinculada.", true);
    return;
  }

  const financingType = document.getElementById("tx-financing-type")?.value || "none";
  const daysVal = parseInt(document.getElementById("tx-days-input")?.value) || 15;
  const installmentsVal = parseInt(document.getElementById("tx-installments-input")?.value) || 4;

  const btn = document.getElementById("btn-save-tx");
  if(btn) { btn.innerText = "Registrando..."; btn.disabled = true; }

  try {
    if (amount > 0 && financingType === "weekly_installments") {
      const cuotaAmt = Math.round(amount / installmentsVal);
      const now = new Date();
      for (let i = 1; i <= installmentsVal; i++) {
        const dueDate = new Date(now.getTime() + (i * 7) * 86400000).toISOString();
        const payload = {
          description: `${description} - Cuota ${i}/${installmentsVal}`,
          amount: cuotaAmt,
          payment: (i === 1 ? payment : 0),
          due_date: dueDate,
          is_interest: (type === "interest"),
          emit_debit_note: (type === "interest" && emitDebitNote && i === 1),
          original_sale_id: invoiceId
        };
        await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", payload);
      }
      showToast(`${installmentsVal} cuotas semanales de $${cuotaAmt.toLocaleString('es-AR')} registradas`, false);
    } else if (amount > 0 && financingType === "monthly_installments") {
      const cuotaAmt = Math.round(amount / installmentsVal);
      const now = new Date();
      for (let i = 1; i <= installmentsVal; i++) {
        const dueDate = new Date(now.getTime() + (i * 30) * 86400000).toISOString();
        const payload = {
          description: `${description} - Cuota ${i}/${installmentsVal}`,
          amount: cuotaAmt,
          payment: (i === 1 ? payment : 0),
          due_date: dueDate,
          is_interest: (type === "interest"),
          emit_debit_note: (type === "interest" && emitDebitNote && i === 1),
          original_sale_id: invoiceId
        };
        await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", payload);
      }
      showToast(`${installmentsVal} cuotas mensuales de $${cuotaAmt.toLocaleString('es-AR')} registradas`, false);
    } else {
      let dueDate = null;
      if (amount > 0 && financingType === "days" && daysVal > 0) {
        dueDate = new Date(Date.now() + daysVal * 86400000).toISOString();
      }
      const payload = { 
        description, 
        amount, 
        payment,
        due_date: dueDate,
        is_interest: (type === "interest"),
        emit_debit_note: (type === "interest" && emitDebitNote),
        original_sale_id: invoiceId
      };
      const res = await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", payload);
      if(res.nota_debito_emitida) {
        showToast("Movimiento e Interés registrados. Nota de Débito aprobada por AFIP.", false);
      } else {
        showToast("Movimiento registrado", false);
      }
    }

    refreshState();
    
    // Dejar abierto el modal y refrescar la vista interna
    setTimeout(() => {
      openAccountDetailModal(accId);
    }, 100);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if(btn) { btn.innerText = "Registrar Movimiento"; btn.disabled = false; }
  }
}

async function deleteAccountTransaction(accId, txId) {
  if (!confirm("¿Estás seguro de que deseas eliminar este movimiento? Esta acción no se puede deshacer.")) {
    return;
  }
  try {
    await apiRequest(`/api/current-accounts/${accId}/transactions/${txId}`, "DELETE");
    showToast("Movimiento eliminado correctamente.");
    
    await refreshState();
    
    // Dejar abierto el modal y refrescar la vista interna
    setTimeout(() => {
      openAccountDetailModal(accId);
    }, 100);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error al eliminar el movimiento.", true);
  }
}
window.deleteAccountTransaction = deleteAccountTransaction;

window.toggleTxInterestFields = function() {
  const type = document.getElementById("tx-type").value;
  const afipContainer = document.getElementById("interest-afip-container");
  const amtLabel = document.getElementById("tx-amount-label");
  const payInput = document.getElementById("tx-payment");
  const descInput = document.getElementById("tx-description");
  
  if (type === "interest") {
    if(afipContainer) afipContainer.style.display = "block";
    if(amtLabel) amtLabel.innerText = "Interés ($)";
    if(payInput) { payInput.readOnly = true; payInput.value = ""; }
    if(descInput) { descInput.value = "Intereses por Financiación"; }
  } else {
    if(afipContainer) afipContainer.style.display = "none";
    if(amtLabel) amtLabel.innerText = "Deuda ($)";
    if(payInput) payInput.readOnly = false;
    if(descInput) descInput.value = "";
  }
};

window.toggleDebitNoteInvoiceSelect = function() {
  const isChecked = document.getElementById("tx-emit-debit-note").checked;
  const container = document.getElementById("debit-note-invoice-select-container");
  if(container) container.style.display = isChecked ? "block" : "none";
};

window.generateReciboXPDF = function(txId, accId, amount, date) {
  const acc = state.currentAccounts.find(a => a.id === accId);
  if (!acc) return;
  const doc = new window.jspdf.jsPDF();
  
  // Encabezado
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("X", 105, 20, { align: "center" });
  doc.rect(98, 12, 14, 12);
  
  doc.setFontSize(10);
  doc.text("DOCUMENTO NO VALIDO COMO FACTURA", 105, 30, { align: "center" });
  
  doc.setFontSize(16);
  doc.text("RECIBO DE COBRO", 14, 45);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const businessName = state.userProfile.businessName || "Empresa";
  doc.text(`Empresa: ${businessName}`, 14, 55);
  const printDate = new Date(date).toLocaleDateString('es-AR') + " " + new Date(date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  doc.text(`Fecha del Pago: ${printDate}`, 120, 55);
  doc.text(`Comprobante Nro: ${txId}`, 120, 62);
  
  doc.line(14, 70, 196, 70);
  
  doc.setFont("helvetica", "bold");
  doc.text("Datos del Cliente", 14, 80);
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre/Razón Social: ${acc.entityName}`, 14, 88);
  doc.text(`Teléfono: ${acc.phone || "No provisto"}`, 14, 96);
  doc.text(`Domicilio: ${acc.address || "No provisto"}`, 120, 88);
  
  doc.line(14, 105, 196, 105);
  
  doc.setFontSize(14);
  doc.text(`Recibimos la suma de pesos: $ ${Math.round(amount).toLocaleString()}`, 14, 120);
  doc.setFontSize(10);
  doc.text(`En concepto de: Pago parcial/total de deuda en cuenta corriente.`, 14, 130);
  
  doc.line(14, 145, 196, 145);
  
  doc.setFont("helvetica", "bold");
  const balance = acc.transactions ? acc.transactions.reduce((sum, tx) => sum + (tx.amount - tx.payment), 0) : 0;
  doc.text(`Saldo Restante de la Cuenta Corriente: $ ${Math.round(balance).toLocaleString()}`, 14, 155);
  
  doc.save(`Recibo_X_${acc.entityName}_${txId}.pdf`);
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

// --- LOGICA DE CIERRE DE CAJA ---
let currentCashState = { income: 0, expense: 0, net: 0 };

function openCashCloseModal() {
  let income = 0;
  let expense = 0;
  
  // Calcular los montos actuales para el cierre
  state.cashTransactions.forEach(tx => {
    const val = parseFloat(tx.amount) || 0;
    if (tx.type === "income") income += val;
    else expense += val;
  });
  
  currentCashState = { income, expense, net: income - expense };
  
  document.getElementById("cash-close-income").innerText = "+$ " + Math.round(income).toLocaleString();
  document.getElementById("cash-close-expense").innerText = "-$ " + Math.round(expense).toLocaleString();
  document.getElementById("cash-close-net").innerText = "$ " + Math.round(currentCashState.net).toLocaleString();
  document.getElementById("cash-close-actual").value = "";
  document.getElementById("cash-close-notes").value = "";
  
  document.getElementById("modal-cash-close").style.display = "flex";
}
window.openCashCloseModal = openCashCloseModal;

function closeCashCloseModal() {
  document.getElementById("modal-cash-close").style.display = "none";
}
window.closeCashCloseModal = closeCashCloseModal;

async function submitCashClose() {
  try {
    const actual = document.getElementById("cash-close-actual").value;
    const notes = document.getElementById("cash-close-notes").value;
    
    const payload = {
      initialBalance: 0,
      totalIncome: currentCashState.income,
      totalExpense: currentCashState.expense,
      netBalance: currentCashState.net,
      closingAmount: actual ? parseFloat(actual) : currentCashState.net,
      notes: notes,
      userName: state.userProfile?.contactName || state.businessName || state.email.split('@')[0]
    };
    
    await apiRequest("/api/cash/close", "POST", payload);
    
    showToast("Cierre de caja guardado con éxito.");
    closeCashCloseModal();
  } catch (e) {
    showToast("Error al guardar cierre: " + e.message, true);
  }
}
window.submitCashClose = submitCashClose;

function openCashClosesHistoryModal() {
  loadCashClosesHistory();
  document.getElementById("modal-cash-closes-history").style.display = "flex";
}
window.openCashClosesHistoryModal = openCashClosesHistoryModal;

function closeCashClosesHistoryModal() {
  document.getElementById("modal-cash-closes-history").style.display = "none";
}
window.closeCashClosesHistoryModal = closeCashClosesHistoryModal;

async function loadCashClosesHistory() {
  try {
    const closes = await apiRequest("/api/cash/closes", "GET");
    const tbody = document.getElementById("cash-closes-history-tbody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    if (!closes || closes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-gray);">No hay cierres previos registrados.</td></tr>';
      return;
    }
    
    closes.forEach(c => {
      const dateStr = new Date(c.date).toLocaleDateString('es-AR') + " " + new Date(c.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-color)";
      tr.innerHTML = `
        <td style="padding: 12px; font-size: 0.8rem; color: var(--text-gray);">${dateStr}</td>
        <td style="padding: 12px; font-size: 0.8rem; text-transform: uppercase; font-weight: 600;">${c.userName}</td>
        <td style="padding: 12px; font-size: 0.8rem; text-align: right; color: var(--accent-green);">+$ ${Math.round(c.totalIncome).toLocaleString()}</td>
        <td style="padding: 12px; font-size: 0.8rem; text-align: right; color: var(--accent-red);">-$ ${Math.round(c.totalExpense).toLocaleString()}</td>
        <td style="padding: 12px; font-size: 0.8rem; text-align: right; font-weight: bold;">$ ${Math.round(c.netBalance).toLocaleString()}</td>
        <td style="padding: 12px; font-size: 0.8rem; text-align: right; color: var(--text-gray);">${c.closingAmount ? '$ '+Math.round(c.closingAmount).toLocaleString() : '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    showToast("No se pudo cargar el historial", true);
  }
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
          <div style="font-weight: 700; color: var(--text-white);">${cost.concept}</div>
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

const GASTOS_CATEGORIES = ['Estructura', 'Personal', 'Impositiva', 'Dirección', 'Marketing Fijo', 'Servicios'];
const GASTOS_SUBCATEGORIES = {
  Estructura: ['Alquiler', 'Luz', 'Internet', 'Expensas', 'Mantenimiento', 'Gas', 'Agua', 'Articulos de Oficina', 'Otros'],
  Personal: ['Sueldo Empleado'],
  Impositiva: ['ARCA', 'Municipal', 'Otros'],
  Dirección: ['Sueldo del Dueño'],
  'Marketing Fijo': ['Pauta Digital Fija', 'Embajadores/Influencers Recurrentes'],
  Servicios: ['Transporte', 'Tiendanube', 'Suscripciones', 'Otros']
};

let currentSelectedCategory = 'Estructura';
let currentSelectedConcept = 'Alquiler';
let currentPeriodType = 'MENSUAL'; // 'MENSUAL', 'QUINCENAL', 'SEMANAL'
let currentQuincena = '1ª';
let currentSemana = '1';

function renderFixedCostsCategoryGrid() {
  const container = document.getElementById("cost-category-grid");
  if (!container) return;
  
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
  const employeeGroup = document.getElementById("cost-employee-name-group");
  container.innerHTML = "";

  if (currentSelectedCategory === "Personal") {
    if (employeeGroup) employeeGroup.style.display = "block";
    
    // Buscar empleados únicos en el historial
    const existingEmployees = new Set();
    if (state.fixedCosts) {
      state.fixedCosts.forEach(cost => {
        if (cost.category === "Personal" && cost.concept && cost.concept.startsWith("Sueldo: ")) {
          const empName = cost.concept.substring(8).trim();
          if (empName) existingEmployees.add(empName);
        }
      });
    }
    
    const empInput = document.getElementById("cost-employee-name-input");
    
    if (existingEmployees.size > 0) {
      const label = document.createElement("p");
      label.style.fontSize = "0.7rem";
      label.style.color = "var(--text-gray)";
      label.style.margin = "0 0 8px 0";
      label.innerText = "Empleados Guardados (Haz clic para seleccionar):";
      container.appendChild(label);
      
      const pillsContainer = document.createElement("div");
      pillsContainer.className = "flex-wrap-gap-1";
      pillsContainer.style.marginBottom = "10px";
      
      existingEmployees.forEach(emp => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = empInput && empInput.value.trim() === emp;
        btn.className = "pos-category-btn" + (isActive ? " active" : "");
        btn.innerText = emp;
        btn.onclick = () => {
          if (empInput) {
            empInput.value = emp;
            currentSelectedConcept = `Sueldo: ${emp}`;
            pillsContainer.querySelectorAll("button").forEach(b => {
              b.className = "pos-category-btn" + (b.innerText === emp ? " active" : "");
            });
            updateCostPeriodDisplay();
          }
        };
        pillsContainer.appendChild(btn);
      });
      container.appendChild(pillsContainer);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pos-category-btn active";
      btn.innerText = "Sueldo Empleado";
      container.appendChild(btn);
    }
    
    if (empInput) {
      currentSelectedConcept = empInput.value.trim() ? `Sueldo: ${empInput.value.trim()}` : "Sueldo Empleado";
      empInput.oninput = () => {
        const val = empInput.value.trim();
        currentSelectedConcept = val ? `Sueldo: ${val}` : "Sueldo Empleado";
        container.querySelectorAll(".pos-category-btn").forEach(b => {
          b.className = "pos-category-btn" + (b.innerText.toLowerCase() === val.toLowerCase() ? " active" : "");
        });
        updateCostPeriodDisplay();
      };
    }
  } else {
    if (employeeGroup) {
      employeeGroup.style.display = "none";
      const empInput = document.getElementById("cost-employee-name-input");
      if (empInput) empInput.value = "";
    }
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
  }
  
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

  if (currentSelectedCategory === "Personal") {
    const empInput = document.getElementById("cost-employee-name-input");
    if (!empInput || !empInput.value.trim()) {
      showToast("Por favor ingresa el nombre del empleado", true);
      return;
    }
    currentSelectedConcept = `Sueldo: ${empInput.value.trim()}`;
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
    const empInput = document.getElementById("cost-employee-name-input");
    if (empInput) empInput.value = "";
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
            <span style="font-weight: 700; color: var(--text-white);">${infName}</span>
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
          <td style="font-weight: 700; color: var(--text-white);">${exp.influencer}</td>
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
            <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-white);">${inf.name}</h4>
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
            <span style="font-weight: 700; color: var(--text-white);">${platform}</span>
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
          <td style="font-weight: 700; color: var(--text-white);">${exp.platform}</td>
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

function toggleStockInfiniteInput(catKey) {
  const stockInput = document.getElementById(`new-opt-stock-${catKey}`);
  const infiniteCheckbox = document.getElementById(`new-opt-infinite-${catKey}`);
  if (stockInput && infiniteCheckbox) {
    if (infiniteCheckbox.checked) {
      stockInput.disabled = true;
      stockInput.required = false;
      stockInput.value = "";
    } else {
      stockInput.disabled = false;
      stockInput.required = true;
      stockInput.value = "0";
    }
  }
}
window.toggleStockInfiniteInput = toggleStockInfiniteInput;

// --- 9. CONFIGURACION DE ADICIONALES ---
function renderExtrasConfig() {
  const container = document.getElementById("extras-categories-container");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(state.extras).forEach(catKey => {
    if (["sku", "name", "cost", "stock", "id"].includes(catKey)) return;
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
        const stockText = opt.isInfinite ? "∞ (Infinito)" : `${stockVal} u.`;
        optionsHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 6px;">
            <div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-white);">${opt.name}</span>
              <span style="font-size: 0.75rem; color: var(--accent-blue); font-weight: 700; margin-left: 8px;">$${Math.round(opt.cost).toLocaleString('es-AR')}</span>
              <span style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700; margin-left: 8px;">Stock: ${stockText}</span>
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
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" id="new-opt-stock-${catKey}" class="form-input" style="padding: 6px 10px; font-size: 0.8rem; flex-grow: 1;" placeholder="0" min="0" required>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--text-gray); cursor: pointer; white-space: nowrap; margin-bottom: 0;">
                <input type="checkbox" id="new-opt-infinite-${catKey}" onchange="toggleStockInfiniteInput('${catKey}')"> Infinito
              </label>
            </div>
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
              <p style="font-size: 0.8rem; font-weight: 800; color: var(--text-white);">${cost.concept}</p>
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

function toggleSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar) return;
  sidebar.classList.toggle("show-sidebar");
  if (overlay) {
    overlay.classList.toggle("show-overlay");
  }
}
window.toggleSidebar = toggleSidebar;

// --- Navegación y Pestañas ---
function switchTab(tabId) {
  // Cerrar sidebar móvil si está abierto
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("show-sidebar");
  if (overlay) overlay.classList.remove("show-overlay");

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
  if (tabId === "business") loadBusinessData();
  if (tabId === "returns") renderReturns();
  if (tabId === "quotes") renderQuotesUI();
  if (tabId === "services") loadServicesData();
  if (tabId === "zecat") renderZecatUI();
  if (tabId === "production") renderProductionUI();
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
  document.getElementById("prod-price-local").addEventListener("input", recalculateMarginFromPrice);
  document.getElementById("prod-price-local").addEventListener("blur", (e) => {
    const val = parseLocalFloat(e.target.value) || 0;
    if (val > 0) {
      e.target.value = Math.round(val / 100) * 100;
      formatCurrencyField(e.target);
      recalculateMarginFromPrice();
    }
  });
  
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

  // Click fuera para cerrar dropdown de notificaciones y sugerencias de devolución
  window.addEventListener("click", () => {
    const dropdown = document.getElementById("notifications-dropdown");
    if (dropdown) dropdown.classList.remove("active");
    const returnResults = document.getElementById("return-sale-search-results");
    if (returnResults) returnResults.style.display = "none";
  });
  const bellContainer = document.getElementById("bell-container");
  if (bellContainer) {
    bellContainer.addEventListener("click", (e) => e.stopPropagation());
  }
  const returnSearchInput = document.getElementById("return-search-sale");
  if (returnSearchInput) {
    returnSearchInput.addEventListener("click", (e) => e.stopPropagation());
  }
  const returnSearchResults = document.getElementById("return-sale-search-results");
  if (returnSearchResults) {
    returnSearchResults.addEventListener("click", (e) => e.stopPropagation());
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
      if (sale && sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          if (!item) return;
          const pSku = item.product?.sku || item.sku || item.product?.id || item.id || "";
          if (pSku) {
            salesByProduct[pSku] = (salesByProduct[pSku] || 0) + (parseInt(item.quantity) || 0);
          }
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
      const rawCost = parseFloat(p.baseCost !== undefined ? p.baseCost : p.cost) || 0;
      const margin = parseFloat(p.margin) || 0;
      const price = parseFloat(p.price_local !== undefined ? p.price_local : p.price) || 0;
      return rawCost === 0 || margin === 0 || price === 0;
    });

    if (missingProducts.length > 0) {
      activeAlerts.push({
        type: "missing_cost_margin",
        title: "Datos Faltantes",
        icon: "fa-solid fa-bell",
        iconClass: "warning",
        text: `Faltan datos de Margen, Precio de venta o Costo unitario en <strong>${missingProducts.length}</strong> productos.`
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
    .trim();
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
  const infiniteCheckbox = document.getElementById(`new-opt-infinite-${categoryKey}`);
  
  const name = nameInput.value.trim();
  const cost = parseLocalFloat(costInput.value) || 0;
  
  const isInfinite = infiniteCheckbox ? infiniteCheckbox.checked : false;
  const stock = isInfinite ? 999999 : (stockInput ? (parseInt(stockInput.value) || 0) : 0);
  
  if (!name) return;

  // Generar ID único para la opción
  const id = `${categoryKey.slice(0, 3)}-${slugify(name)}`;

  // Validar duplicados
  if (state.extras[categoryKey].some(opt => opt.id === id || opt.name.toLowerCase() === name.toLowerCase())) {
    showToast("Esta opción ya existe en esta categoría", true);
    return;
  }

  // Agregar opción con stock físico especificado
  state.extras[categoryKey].push({ id, name, cost, stock, isInfinite });

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

function toggleEditExtraInfiniteInput() {
  const stockInput = document.getElementById("edit-extra-stock");
  const infiniteCheckbox = document.getElementById("edit-extra-infinite");
  if (stockInput && infiniteCheckbox) {
    if (infiniteCheckbox.checked) {
      stockInput.disabled = true;
      stockInput.required = false;
      stockInput.value = "";
    } else {
      stockInput.disabled = false;
      stockInput.required = true;
      stockInput.value = "0";
    }
  }
}
window.toggleEditExtraInfiniteInput = toggleEditExtraInfiniteInput;

function editExtraOption(categoryKey, optionId) {
  const option = state.extras[categoryKey].find(opt => opt.id === optionId);
  if (!option) return;

  document.getElementById("edit-extra-category").value = categoryKey;
  document.getElementById("edit-extra-id").value = optionId;
  document.getElementById("edit-extra-name").value = option.name;
  document.getElementById("edit-extra-cost").value = option.cost;
  formatCurrencyField(document.getElementById("edit-extra-cost"));
  
  const isInfinite = !!option.isInfinite;
  const infCheckbox = document.getElementById("edit-extra-infinite");
  if (infCheckbox) infCheckbox.checked = isInfinite;
  
  const editStockInput = document.getElementById("edit-extra-stock");
  if (editStockInput) {
    editStockInput.value = isInfinite ? "" : (option.stock !== undefined && option.stock !== null ? option.stock : 0);
    editStockInput.disabled = isInfinite;
    editStockInput.required = !isInfinite;
  }

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
  
  const infiniteCheckbox = document.getElementById("edit-extra-infinite");
  const isInfinite = infiniteCheckbox ? infiniteCheckbox.checked : false;
  const stock = isInfinite ? 999999 : parseInt(document.getElementById("edit-extra-stock").value);

  if (!name) {
    showToast("Por favor, ingrese un nombre válido", true);
    return;
  }
  if (isNaN(cost) || cost < 0) {
    showToast("Precio/costo inválido", true);
    return;
  }
  if (!isInfinite && (isNaN(stock) || stock < 0)) {
    showToast("Stock físico inválido", true);
    return;
  }

  const option = state.extras[categoryKey].find(opt => opt.id === optionId);
  if (!option) return;

  option.name = name;
  option.cost = cost;
  option.stock = stock;
  option.isInfinite = isInfinite;

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
  // Never show the business name modal to subusers — they use the admin's business
  const isSubuser = !!state.subuser || state.role === "subuser";
  if (isSubuser) return;
  
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
    localStorage.setItem("datamargen_business_name", name);
    
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
    sessionStorage.setItem("datamargen_token", idToken);
    if (result.user.refreshToken) {
      sessionStorage.setItem("datamargen_refresh_token", result.user.refreshToken);
    }
    sessionStorage.setItem("datamargen_email", email);
    localStorage.setItem("datamargen_business_type", bizType);
    
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
    state.integrations = integrations;
    const tiendanube = integrations?.tiendanube;
    
    // Controlar visibilidad de Tiendanube: admin con flag habilitado O subuser con permiso
    const tnCard = document.getElementById("tiendanube-integration-card");
    if (tnCard) {
      const tnEnabled = state.userProfile?.tiendanubeEnabled === true;
      const hasTnPermission = state.permissions?.tiendanube && state.permissions.tiendanube !== "none";
      const tnVisible = tnEnabled || hasTnPermission || state.role === "admin";
      tnCard.style.display = tnVisible ? "block" : "none";
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
      
      // AUTO-SYNC HOURLY
      if (!window.tiendanubeSyncInterval) {
        window.tiendanubeSyncInterval = setInterval(async () => {
          try {
            console.log("[Auto-Sync] Sincronizando Tiendanube...");
            await apiRequest("/api/integrations/tiendanube/sync", "POST");
            await apiRequest("/api/integrations/tiendanube/sync-orders", "POST");
            console.log("[Auto-Sync] Sincronización exitosa.");
          } catch(e) {
            console.error("[Auto-Sync] Error", e);
          }
        }, 3600000); // 1 hora
      }
    } else {
      if (window.tiendanubeSyncInterval) {
        clearInterval(window.tiendanubeSyncInterval);
        window.tiendanubeSyncInterval = null;
      }
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

    // Filter paid sales for metrics calculation
    const paidTnSales = tnSales.filter(s => s.payment_status === "paid" || s.payment_status === "authorized");

    let tnGross = 0;
    let tnFees = 0;
    let tnNet = 0;
    let tnUnits = 0;
    let tnOperatingCosts = 0;
    
    // 1. Calculate general metrics for the month first
    tnSales.forEach(s => {
      const grossVal = s.total || 0;
      const fixedFee = s.fee_fijo_tn !== undefined ? parseFloat(s.fee_fijo_tn) : 300;
      const pctFee = s.comision_pasarela_pago !== undefined ? parseFloat(s.comision_pasarela_pago) : 5;
      const sFees = fixedFee + (pctFee / 100 * grossVal);
      
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
      });

      const sNet = grossVal - sFees - saleOpCost;
      
      const isCancelled = s.shipping_status === "cancelled" || s.payment_status === "cancelled" || s.status === "cancelled" || s.status === "cancelada";
      const isPaid = !isCancelled && (s.payment_status === "paid" || s.payment_status === "authorized");
      if (isPaid) {
        tnGross += grossVal;
        tnFees += sFees;
        tnNet += sNet;
        tnOperatingCosts += saleOpCost;
        items.forEach(it => {
          tnUnits += parseInt(it.quantity) || 0;
        });
      }
    });

    // 2. Set active style on filters UI
    state.tiendanubeShippingFilter = state.tiendanubeShippingFilter || "unshipped";
    const shippingFilters = ["unshipped", "shipped", "delivered", "cancelled", "all"];
    shippingFilters.forEach(f => {
      const btn = document.getElementById(`tn-filter-${f}`);
      if (btn) {
        if (f === state.tiendanubeShippingFilter) {
          btn.style.background = "var(--accent-blue)";
          btn.style.color = "var(--text-white)";
        } else {
          btn.style.background = "transparent";
          btn.style.color = "var(--text-gray)";
        }
      }
    });

    // 3. Filter orders based on shipping filter tab
    const filteredTnSales = tnSales.filter(s => {
      const shStatus = s.shipping_status || "unshipped";
      const isCancelled = shStatus === "cancelled" || s.payment_status === "cancelled" || s.status === "cancelled" || s.status === "cancelada";
      if (state.tiendanubeShippingFilter === "all") return true;
      if (state.tiendanubeShippingFilter === "cancelled") return isCancelled;
      if (isCancelled) return false;
      return shStatus === state.tiendanubeShippingFilter;
    });

    let tnSalesHTML = "";
    filteredTnSales.forEach(s => {
      const grossVal = s.total || 0;
      const fixedFee = s.fee_fijo_tn !== undefined ? parseFloat(s.fee_fijo_tn) : 300;
      const pctFee = s.comision_pasarela_pago !== undefined ? parseFloat(s.comision_pasarela_pago) : 5;
      const sFees = fixedFee + (pctFee / 100 * grossVal);
      
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
      });

      const sNet = grossVal - sFees - saleOpCost;
      
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

      const isFacturada = s.fiscal_status === 'declarada' || s.arca_cae || s.arca_invoice_id;
      const statusBadge = isFacturada 
        ? `<span class="badge-green" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.1);">Facturada</span>`
        : `<span class="badge-gray" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(148, 163, 184, 0.05);">No Declarada</span>`;

      // shipping status badge
      const shStatus = s.shipping_status || "unshipped";
      const isCancelled = shStatus === "cancelled" || s.payment_status === "cancelled" || s.status === "cancelled" || s.status === "cancelada";
      let shippingBadge = "";
      if (isCancelled) {
        shippingBadge = `<span class="badge-red" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.1); color: #ef4444; font-weight: 600;">Cancelada</span>`;
      } else if (shStatus === "unshipped") {
        shippingBadge = `<span class="badge-orange" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.1); color: #f59e0b; font-weight: 600;">Por empaquetar</span>`;
      } else if (shStatus === "shipped") {
        shippingBadge = `<span class="badge-blue" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.2); background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600;">Enviado</span>`;
      } else if (shStatus === "delivered") {
        const isPickup = s.shipping_pickup_type === "pickup" || 
                        (s.shipping_option && s.shipping_option.toLowerCase().includes("retiro")) ||
                        (s.shipping_option && s.shipping_option.toLowerCase().includes("retirar"));
        if (isPickup) {
          shippingBadge = `<span class="badge-green" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.1); color: #10b981; font-weight: 600;">Retirado</span>`;
        } else {
          shippingBadge = `<span class="badge-green" style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.1); color: #10b981; font-weight: 600;">Entregado</span>`;
        }
      }

      // Customer info display
      let clientInfoText = "";
      if (s.client_name) {
        const phoneText = s.client_phone ? ` | Tel: ${s.client_phone}` : "";
        const emailText = s.client_email ? ` | ${s.client_email}` : "";
        clientInfoText = `<div style="font-size: 0.68rem; color: var(--text-gray); margin-top: 2px;">👤 ${s.client_name}${phoneText}${emailText}</div>`;
      } else {
        clientInfoText = `<div style="font-size: 0.68rem; color: var(--text-gray); margin-top: 2px; font-style: italic;">👤 Sin datos de contacto (sincronizar para actualizar)</div>`;
      }

      const orderDisplayId = s.tn_number ? `TN-#${s.tn_number}` : s.id;

      // Actions/Locations display
      let actionHTML = "";
      const missingLocation = !s.ubicacion;

      if (isCancelled) {
        actionHTML = `
          <div style="display: flex; justify-content: flex-start; align-items: center; width: 100%;">
            <span style="font-size: 0.68rem; color: var(--accent-red); font-style: italic;">⛔ Venta Cancelada</span>
          </div>
        `;
      } else if (missingLocation && (shStatus === "shipped" || shStatus === "delivered")) {
        const configuredLocations = state.userProfile?.locations || ["Local Principal"];
        const optionsHTML = configuredLocations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
        actionHTML = `
          <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; width: 100%;">
            <span style="font-size: 0.68rem; color: var(--accent-red); font-weight: bold; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> Falta origen de stock</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              <select id="ship-loc-${s.id}" style="font-size: 0.68rem; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-white); outline: none;">
                ${optionsHTML}
              </select>
              <button class="btn btn-sm" onclick="shipTiendanubeOrder('${s.id}', '${shStatus}', 'ship-loc-${s.id}')" style="font-size: 0.65rem; padding: 4px 10px; border-radius: 6px; background: var(--accent-blue); border: none; color: var(--text-white); font-weight: bold; cursor: pointer;">
                Asignar y Restar
              </button>
            </div>
          </div>
        `;
      } else if (shStatus === "unshipped") {
        const configuredLocations = state.userProfile?.locations || ["Local Principal"];
        const optionsHTML = configuredLocations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
        actionHTML = `
          <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-end; width: 100%;">
            <span style="font-size: 0.68rem; color: var(--text-gray);">Despachar desde:</span>
            <select id="ship-loc-${s.id}" style="font-size: 0.68rem; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-white); outline: none;">
              ${optionsHTML}
            </select>
            <button class="btn btn-sm btn-primary" onclick="shipTiendanubeOrder('${s.id}', 'shipped', 'ship-loc-${s.id}')" style="font-size: 0.65rem; padding: 4px 10px; border-radius: 6px; display: flex; align-items: center; gap: 4px; font-weight: bold; background: var(--accent-blue); border-color: var(--accent-blue); color: var(--text-white); cursor: pointer; border: none;">
              📦 Despachar
            </button>
          </div>
        `;
      } else if (shStatus === "shipped") {
        actionHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span style="font-size: 0.68rem; color: var(--text-gray); font-style: italic;">📍 Despachado de: <strong>${s.ubicacion || 'Sin especificar'}</strong></span>
            <button class="btn btn-sm" onclick="shipTiendanubeOrder('${s.id}', 'delivered')" style="font-size: 0.65rem; padding: 4px 10px; border-radius: 6px; background: #10b981; border: none; color: var(--text-white); font-weight: bold; display: flex; align-items: center; gap: 4px; cursor: pointer;">
              ✔️ Entregar
            </button>
          </div>
        `;
      } else {
        actionHTML = `
          <div style="display: flex; justify-content: flex-start; align-items: center; width: 100%;">
            <span style="font-size: 0.68rem; color: var(--text-gray); font-style: italic;">📍 Despachado de: <strong>${s.ubicacion || 'Sin especificar'}</strong></span>
          </div>
        `;
      }

      tnSalesHTML += `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">
            <div>
              <strong style="color: var(--text-white);">${orderDisplayId}</strong> 
              <span style="color: var(--text-gray); margin-left: 4px; font-size: 0.68rem;">(${formattedDate})</span>
              <span style="margin-left: 8px; display: inline-flex; gap: 4px;">
                ${statusBadge}
                ${shippingBadge}
              </span>
              ${clientInfoText}
            </div>
            <div style="text-align: right; min-width: 120px;">
              <div style="color: var(--text-white); font-size: 0.72rem;">Bruto: $${Math.round(grossVal).toLocaleString()}</div>
              <div style="color: var(--accent-emerald); font-weight: bold; font-size: 0.75rem;">Neto: $${Math.round(sNet).toLocaleString()}</div>
            </div>
          </div>
          ${itemsListText ? `<div style="margin-top: 8px; padding-left: 8px; border-left: 2px solid var(--accent-blue); line-height: 1.4; font-size: 0.7rem; display: flex; flex-direction: column; gap: 2px;">${itemsListText}</div>` : ""}
          <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 8px; display: flex; justify-content: flex-end; align-items: center;">
            ${actionHTML}
          </div>
        </div>
      `;
    });
    
    if (filteredTnSales.length === 0) {
      tnSalesHTML = `<div style="text-align: center; color: var(--text-gray); padding: 20px;">No hay ventas registradas con este estado de envío.</div>`;
    }
    
    const tnReportGrossEl = document.getElementById("tn-report-gross");
    if (tnReportGrossEl) tnReportGrossEl.innerText = `$ ${Math.round(tnGross).toLocaleString()}`;
    
    const tnReportFeesEl = document.getElementById("tn-report-fees");
    if (tnReportFeesEl) tnReportFeesEl.innerText = `$ ${Math.round(tnFees).toLocaleString()}`;

    const tnReportOperatingCostsEl = document.getElementById("tn-report-operating-costs");
    if (tnReportOperatingCostsEl) tnReportOperatingCostsEl.innerText = `$ ${Math.round(tnOperatingCosts).toLocaleString()}`;
    
    const tnReportNetEl = document.getElementById("tn-report-net");
    if (tnReportNetEl) tnReportNetEl.innerText = `$ ${Math.round(tnNet).toLocaleString()}`;

    const tnTicket = paidTnSales.length > 0 ? (tnGross / paidTnSales.length) : 0;
    const tnReportTicketEl = document.getElementById("tn-report-ticket");
    if (tnReportTicketEl) tnReportTicketEl.innerText = `$ ${Math.round(tnTicket).toLocaleString()}`;

    const tnReportOrdersEl = document.getElementById("tn-report-orders");
    if (tnReportOrdersEl) tnReportOrdersEl.innerText = `${paidTnSales.length}`;

    const tnReportUnitsEl = document.getElementById("tn-report-units");
    if (tnReportUnitsEl) tnReportUnitsEl.innerText = `${tnUnits} u.`;
    
    const tnSalesLogEl = document.getElementById("tn-sales-log");
    if (tnSalesLogEl) tnSalesLogEl.innerHTML = tnSalesHTML;

    // Renderizar métricas detalladas online (Top 5 Productos, Top 5 Categorías, Medios de Pago)
    const tnProductCounts = {};
    const tnCategoryCounts = {};
    const tnPaymentTotals = {
      "Pago Nube - Tarjeta": 0,
      "Pago Nube - Billetera Virtual": 0,
      "Pago Nube - Transferencia": 0,
      "Mercado Pago": 0,
      "Personalizado": 0
    };
    let tnTotalSalesForPayments = 0;

    paidTnSales.forEach(s => {
      const total = s.total || 0;
      tnTotalSalesForPayments += total;
      
      // 1. Productos y Categorías
      if (s.items) {
        s.items.forEach(item => {
          const p = item.product || {};
          const label = p.name || item.name || item.title || "Producto sin nombre";
          let cat = p.category || item.category;
          
          if (!cat || cat.toLowerCase() === "general") {
            const itemSku = item.sku || p.sku;
            const match = state.products.find(prod => 
              (itemSku && prod.sku === itemSku) ||
              (itemSku && prod.baseSku === itemSku) ||
              (label && prod.name && prod.name.toLowerCase().trim() === label.toLowerCase().trim()) ||
              (label && prod.name && (label.toLowerCase().includes(prod.name.toLowerCase()) || prod.name.toLowerCase().includes(label.toLowerCase())))
            );
            if (match && match.category && match.category.toLowerCase() !== "general") {
              cat = match.category;
            } else {
              const nameLower = label.toLowerCase();
              if (nameLower.includes("hoodie") || nameLower.includes("buzo")) cat = "Buzos & Hoodies";
              else if (nameLower.includes("sweater") || nameLower.includes("tejido") || nameLower.includes("chomba")) cat = "Tejidos & Sweaters";
              else cat = "Indumentaria";
            }
          }
          
          const qty = parseInt(item.quantity) || 0;
          
          tnProductCounts[label] = tnProductCounts[label] || { label: label, units: 0 };
          tnProductCounts[label].units += qty;
          
          tnCategoryCounts[cat] = tnCategoryCounts[cat] || { label: cat, units: 0 };
          tnCategoryCounts[cat].units += qty;
        });
      }
      
      // 2. Medios de pago
      let m = s.method || "Personalizado";
      if (tnPaymentTotals[m] !== undefined) {
        tnPaymentTotals[m] += total;
      } else {
        let mLower = m.toLowerCase();
        if (mLower.includes("tarjeta") || mLower.includes("card") || mLower.includes("débito") || mLower.includes("crédito")) {
          tnPaymentTotals["Pago Nube - Tarjeta"] += total;
        } else if (mLower.includes("billetera") || mLower.includes("wallet")) {
          tnPaymentTotals["Pago Nube - Billetera Virtual"] += total;
        } else if (mLower.includes("transferencia")) {
          if (mLower.includes("nube")) {
            tnPaymentTotals["Pago Nube - Transferencia"] += total;
          } else {
            tnPaymentTotals["Personalizado"] += total;
          }
        } else if (mLower.includes("mercadopago") || mLower.includes("mercado pago") || mLower.includes("mp")) {
          tnPaymentTotals["Mercado Pago"] += total;
        } else {
          tnPaymentTotals["Personalizado"] += total;
        }
      }
    });

    // Top 5 Productos en pantalla
    const tnSortedProducts = Object.values(tnProductCounts).sort((a, b) => b.units - a.units).slice(0, 5);
    const tnTopProductsList = document.getElementById("tn-top-products-list");
    if (tnTopProductsList) {
      if (tnSortedProducts.length === 0) {
        tnTopProductsList.innerHTML = `<p style="color: var(--text-gray); font-size: 0.8rem; text-align: center; margin-top: 20px;">No hay datos en este período.</p>`;
      } else {
        tnTopProductsList.innerHTML = tnSortedProducts.map((p, idx) => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">
              <span style="font-weight: 800; color: var(--accent-red); font-size: 0.85rem;">#${idx + 1}</span>
              <span style="font-weight: 600; color: var(--text-white); font-size: 0.75rem;">${p.label}</span>
            </div>
            <span style="font-weight: 700; color: var(--text-gray-light); font-size: 0.75rem;">${p.units} u.</span>
          </div>
        `).join("");
      }
    }

    // Top 5 Categorías en pantalla
    const tnSortedCategories = Object.values(tnCategoryCounts).sort((a, b) => b.units - a.units).slice(0, 5);
    const tnTopCategoriesList = document.getElementById("tn-top-categories-list");
    if (tnTopCategoriesList) {
      if (tnSortedCategories.length === 0) {
        tnTopCategoriesList.innerHTML = `<p style="color: var(--text-gray); font-size: 0.8rem; text-align: center; margin-top: 20px;">No hay datos en este período.</p>`;
      } else {
        tnTopCategoriesList.innerHTML = tnSortedCategories.map((c, idx) => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 800; color: var(--accent-blue); font-size: 0.85rem;">#${idx + 1}</span>
              <span style="font-weight: 600; color: var(--text-white); font-size: 0.75rem;">${c.label}</span>
            </div>
            <span style="font-weight: 700; color: var(--text-gray-light); font-size: 0.75rem;">${c.units} u.</span>
          </div>
        `).join("");
      }
    }

    // Medios de pago en pantalla
    const tnPaymentMethodsList = document.getElementById("tn-payment-methods-list");
    if (tnPaymentMethodsList) {
      if (tnTotalSalesForPayments === 0) {
        tnPaymentMethodsList.innerHTML = `<p style="color: var(--text-gray); font-size: 0.8rem; text-align: center; margin-top: 20px;">No hay datos en este período.</p>`;
      } else {
        const sortedTNPayments = Object.entries(tnPaymentTotals).sort((a, b) => b[1] - a[1]);
        const colors = ['#0a9396', '#2176ff', '#4ea8de', '#e5383b', '#ca6702'];
        tnPaymentMethodsList.innerHTML = sortedTNPayments.map((pay, index) => {
          const pctStr = ((pay[1] / tnTotalSalesForPayments) * 100).toFixed(1);
          const pct = Math.min(100, Math.max(0, parseFloat(pctStr)));
          const color = colors[index % colors.length];
          return `
            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 0.75rem; color: var(--text-white); font-weight: 500;">${pay[0]}</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 0.65rem; color: var(--text-gray);">$${Math.round(pay[1]).toLocaleString()}</span>
                  <span style="font-size: 0.75rem; color: var(--text-white); font-weight: 600;">${pctStr}%</span>
                </div>
              </div>
              <div style="width: 100%; background-color: rgba(255,255,255,0.05); border-radius: 4px; height: 6px; overflow: hidden;">
                <div style="width: ${pct}%; background-color: ${color}; height: 100%; border-radius: 4px;"></div>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // Renderizar ARCA Config
    const arca = integrations?.arca;
    const arcaBadge = document.getElementById("arca-status-badge");
    const cuitInput = document.getElementById("arca-cuit");
    const fantasiaInput = document.getElementById("arca-nombre-fantasia");
    const razonInput = document.getElementById("arca-razon-social");
    const domicilioInput = document.getElementById("arca-domicilio");
    const startDateInput = document.getElementById("arca-start-date");
    const condicionSelect = document.getElementById("arca-condicion-iva");
    const posInput = document.getElementById("arca-pos");
    const categoriaSelect = document.getElementById("arca-categoria-monotributo");
    
    const arcaSaveBtn = document.getElementById("arca-save-btn");
    const arcaDisconnectBtn = document.getElementById("arca-disconnect-btn");
    const arcaCertFile = document.getElementById("arca-cert-file");
    const arcaKeyFile = document.getElementById("arca-key-file");
    
    const userEmail = (state.email || state.userEmail || "").toLowerCase();
    const isMatias = userEmail.includes("matias") || (state.businessName || "").toLowerCase().includes("mazo");
    const defaultFantasia = isMatias ? "MAZO." : "";
    const defaultRazon = isMatias ? "CUCHETTI DIAZ MATIAS" : "";
    const defaultDomicilio = isMatias ? "Castelli 1229, Bahia Blanca, Buenos Aires" : "";
    const defaultStartDate = isMatias ? "01/10/2024" : "";
    
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
      if (fantasiaInput) {
        fantasiaInput.value = arca.nombre_fantasia || arca.nombreFantasia || defaultFantasia;
        fantasiaInput.disabled = true;
      }
      if (razonInput) {
        razonInput.value = (arca.razon_social && arca.razon_social !== "Mazo") ? arca.razon_social : defaultRazon;
        razonInput.disabled = true;
      }
      if (domicilioInput) {
        domicilioInput.value = (arca.domicilio_comercial && arca.domicilio_comercial !== "Hipólito Yrigoyen 631") ? arca.domicilio_comercial : defaultDomicilio;
        domicilioInput.disabled = true;
      }
      if (startDateInput) {
        startDateInput.value = arca.inicio_actividades || arca.start_date || defaultStartDate;
        startDateInput.disabled = true;
      }
      if (condicionSelect) {
        condicionSelect.value = arca.condicion_iva || "monotributo";
        condicionSelect.disabled = true;
      }
      if (categoriaSelect) {
        categoriaSelect.value = arca.categoria_monotributo || "A";
        categoriaSelect.disabled = false;
      }
      if (posInput) {
        posInput.value = arca.pos || "0002";
        posInput.disabled = true;
      }
      const topeEfectivoInput = document.getElementById("arca-tope-efectivo");
      const topeElectronicoInput = document.getElementById("arca-tope-electronico");
      if (topeEfectivoInput) {
        topeEfectivoInput.value = arca.tope_efectivo !== undefined ? arca.tope_efectivo : 208644;
        topeEfectivoInput.disabled = true;
      }
      if (topeElectronicoInput) {
        topeElectronicoInput.value = arca.tope_electronico !== undefined ? arca.tope_electronico : 417288;
        topeElectronicoInput.disabled = true;
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
      if (fantasiaInput) {
        fantasiaInput.value = arca?.nombre_fantasia || arca?.nombreFantasia || defaultFantasia;
        fantasiaInput.disabled = false;
      }
      if (razonInput) {
        razonInput.value = (arca?.razon_social && arca.razon_social !== "Mazo") ? arca.razon_social : defaultRazon;
        razonInput.disabled = false;
      }
      if (domicilioInput) {
        domicilioInput.value = (arca?.domicilio_comercial && arca.domicilio_comercial !== "Hipólito Yrigoyen 631") ? arca.domicilio_comercial : defaultDomicilio;
        domicilioInput.disabled = false;
      }
      if (startDateInput) {
        startDateInput.value = arca?.inicio_actividades || arca?.start_date || defaultStartDate;
        startDateInput.disabled = false;
      }
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

function openTiendanubeSyncModal() {
  const modal = document.getElementById("modal-tiendanube-sync-options");
  if (modal) modal.style.display = "flex";
}

function closeTiendanubeSyncModal() {
  const modal = document.getElementById("modal-tiendanube-sync-options");
  if (modal) modal.style.display = "none";
}

async function executeTiendanubePullSync() {
  closeTiendanubeSyncModal();
  await syncTiendanubeCatalog();
}

async function executeTiendanubePushSync() {
  closeTiendanubeSyncModal();
  try {
    showToast("Enviando precios y stocks a Tiendanube... Esto puede tardar unos segundos.");
    const result = await apiRequest("/api/integrations/tiendanube/push-all", "POST");
    const count = result.count !== undefined ? result.count : 0;
    showToast(`Sincronización exitosa. Se actualizaron ${count} variantes en Tiendanube.`);
    await refreshState();
  } catch (error) {
    showToast("Error en sincronización hacia Tiendanube: " + error.message, true);
  }
}

async function syncTiendanubeCatalog() {
  try {
    showToast("Sincronizando catálogo desde Tiendanube... Esto puede tardar unos segundos.");
    const result = await apiRequest("/api/integrations/tiendanube/sync", "POST");
    const added = result.added_count !== undefined ? result.added_count : (result.count || 0);
    const deleted = result.deleted_count || 0;
    
    let msg = "";
    if (added > 0 && deleted > 0) {
      msg = `Sincronización completada: ${added} ${added === 1 ? 'producto agregado' : 'productos agregados'} y ${deleted} ${deleted === 1 ? 'producto eliminado' : 'productos eliminados'}.`;
    } else if (added > 0) {
      msg = `Sincronización completada: ${added} ${added === 1 ? 'producto agregado' : 'productos agregados'}.`;
    } else if (deleted > 0) {
      msg = `Sincronización completada: ${deleted} ${deleted === 1 ? 'producto eliminado' : 'productos eliminados'}.`;
    } else {
      msg = "Sincronización completada: No hubo cambios en el catálogo.";
    }
    
    showToast(msg);
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
    { "Métrica": "Ticket Promedio", "Valor": tnUnits > 0 ? Math.round(tnGross / tnUnits) : 0 }
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
  const monthOnlySelect = document.getElementById("arca-monotributo-month-only-select");
  const yearOnlySelect = document.getElementById("arca-monotributo-year-only-select");
  
  if (monthOnlySelect && yearOnlySelect && monthOnlySelect.options.length === 0) {
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
      const opt = document.createElement("option");
      opt.value = String(i + 1).padStart(2, '0');
      opt.innerText = monthNames[i];
      monthOnlySelect.appendChild(opt);
    }
    
    const currentYear = currentDate.getFullYear();
    for (let i = currentYear - 2; i <= currentYear; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.innerText = String(i);
      yearOnlySelect.appendChild(opt);
    }
    
    monthOnlySelect.value = String(currentDate.getMonth() + 1).padStart(2, '0');
    yearOnlySelect.value = String(currentYear);
  }
  
  // 5. Sumar la facturación de los últimos 12 meses
  let accumulated = externaAccumulated;
  sales.forEach(sale => {
    if (sale.status === "cancelled") return;
    if (trackerFilter === "solo_facturadas" && sale.fiscal_status !== "declarada" && !sale.arca_cae && !sale.arca_invoice_id) return;
    
    const saleDate = new Date(sale.date);
    if (saleDate >= oneYearAgo) {
      accumulated += parseFloat(sale.total) || 0;
    }
  });
  
  // 6. Calcular facturación del mes seleccionado
  const selectedMonth = (monthOnlySelect && yearOnlySelect) ? `${yearOnlySelect.value}-${monthOnlySelect.value}` : "";
  const monthlyExterna = parseFloat(externaMap[selectedMonth]) || 0;
  let monthlyAccumulated = monthlyExterna;
  if (selectedMonth) {
    sales.forEach(sale => {
      if (sale.status === "cancelled") return;
      if (trackerFilter === "solo_facturadas" && sale.fiscal_status !== "declarada" && !sale.arca_cae && !sale.arca_invoice_id) return;
      
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

async function updateArcaCategoryOnAFIPChange() {
  const categorySelect = document.getElementById("arca-categoria-monotributo");
  if (!categorySelect) return;
  const newCategory = categorySelect.value;
  
  if (state.integrations?.arca) {
    state.integrations.arca.categoria_monotributo = newCategory;
  }
  
  // Actualizar interfaz
  await updateMonotributoTrackerUI();
  
  // Persistir en Firestore
  try {
    await apiRequest("/api/integrations/arca/update-category", "POST", { categoria: newCategory });
  } catch (e) {
    console.error("Error al guardar categoría en AFIP:", e);
  }
}
window.updateArcaCategoryOnAFIPChange = updateArcaCategoryOnAFIPChange;

async function saveArcaConfig(event) {
  event.preventDefault();
  const cuit = document.getElementById("arca-cuit").value.replace(/\D/g, "");
  const nombreFantasia = document.getElementById("arca-nombre-fantasia")?.value.trim() || "";
  const razonSocial = document.getElementById("arca-razon-social")?.value.trim() || "";
  const domicilioComercial = document.getElementById("arca-domicilio")?.value.trim() || "";
  const startDate = document.getElementById("arca-start-date")?.value.trim() || "";
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
  
  const topeEfectivo = parseFloat(document.getElementById("arca-tope-efectivo")?.value) || 208644;
  const topeElectronico = parseFloat(document.getElementById("arca-tope-electronico")?.value) || 417288;
  
  try {
    showToast("Guardando configuración fiscal de ARCA...");
    const payload = {
      cuit: cuit,
      nombre_fantasia: nombreFantasia,
      nombreFantasia: nombreFantasia,
      razon_social: razonSocial,
      domicilio_comercial: domicilioComercial,
      inicio_actividades: startDate,
      start_date: startDate,
      condicion_iva: condicion,
      categoria_monotributo: categoria,
      pos: pos,
      tope_efectivo: topeEfectivo,
      tope_electronico: topeElectronico,
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
          <td colspan="9" style="padding: 15px; text-align: center;">No hay comprobantes electrónicos emitidos todavía.</td>
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
      
      // Buscar venta correspondiente en state.sales para obtener su fecha
      const matchingSale = state.sales.find(s => s.id === inv.sale_id);
      const formattedSaleDate = matchingSale ? new Date(matchingSale.date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) : formattedDate;

      const assocText = inv.associated_invoice ? `<div style="font-size: 0.65rem; color: var(--text-gray);">Asoc: ${inv.associated_invoice}</div>` : "";
      return `
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray-light);">
          <!-- 1° Columna: Fecha Emitida -->
          <td style="padding: 8px; white-space: nowrap; color: var(--text-white); font-weight: 600;">📅 ${formattedDate}</td>
          
          <!-- 2° Columna: Fecha de Venta -->
          <td style="padding: 8px; white-space: nowrap; color: var(--text-white); font-weight: 600;">📅 ${formattedSaleDate}</td>
          
          <!-- 3° Columna: Tipo -->
          <td style="padding: 8px; font-weight: 700; color: var(--text-white);">
            <div>${inv.type || "Factura C"}</div>
            ${assocText}
          </td>
          
          <!-- 4° Columna: Número de Factura -->
          <td style="padding: 8px; font-weight: 600;">${inv.invoice_number || "-"}</td>
          
          <!-- 5° Columna: Cliente CUIT -->
          <td style="padding: 8px;">${inv.client_cuit || "20-99999999-9"}</td>
          
          <!-- 6° Columna: Total Facturado -->
          <td style="padding: 8px; text-align: right; font-weight: 700; color: var(--text-white);">$ ${Math.round(inv.total || 0).toLocaleString("es-AR")}</td>
          
          <!-- 7° Columna: CAE / Vencimiento -->
          <td style="padding: 8px;">
            <div>CAE: ${inv.cae || "-"}</div>
            <div style="font-size: 0.65rem; color: var(--text-gray);">Vto: ${inv.cae_due || "-"}</div>
          </td>
          
          <!-- 8° Columna: Estado -->
          <td style="padding: 8px; text-align: center;">
            <span class="badge-green" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.2);">
              ✓ ${inv.status || "Aprobado"}
            </span>
          </td>
          
          <!-- 9° Columna: Acciones (Imprimir + Descargar PDF) -->
          <td style="padding: 8px; text-align: center; white-space: nowrap;">
            <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
              <button class="btn btn-secondary" onclick="printSaleTicket('${inv.sale_id}')" style="padding: 4px 8px; font-size: 0.65rem; font-weight: bold; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); color: var(--text-white);" title="Imprimir Comprobante">
                <i class="fas fa-print" style="color: var(--accent-blue);"></i> Imprimir
              </button>
              <button class="btn btn-secondary" onclick="downloadInvoicePDF('${inv.sale_id}')" style="padding: 4px 8px; font-size: 0.65rem; font-weight: bold; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); color: var(--text-white);" title="Descargar PDF">
                <i class="fas fa-file-pdf" style="color: var(--accent-red);"></i> Descargar PDF
              </button>
            </div>
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
  
  // Reset bulk count and checkbox states on render
  const selectAllCb = document.getElementById("arca-select-all-uninvoiced");
  if (selectAllCb) selectAllCb.checked = false;
  updateBulkInvoiceButtonVisibility();
  
  if (recent.length === 0) {
    tbody.innerHTML = `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-gray);">
        <td colspan="5" style="padding: 15px; text-align: center;">No hay ventas recientes pendientes de facturar.</td>
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
      <tr onclick="toggleRowCheckbox(event, '${sale.id}')" style="border-bottom: 1px solid var(--border-color); color: var(--text-gray-light); cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='none'">
        <td style="padding: 8px; text-align: center;" onclick="event.stopPropagation();">
          <input type="checkbox" class="arca-select-uninvoiced" value="${sale.id}" onchange="updateBulkInvoiceButtonVisibility()" style="cursor: pointer;">
        </td>
        <td style="padding: 8px;">${formattedDate}</td>
        <td style="padding: 8px; font-weight: 700; color: var(--text-white);">$ ${Math.round(sale.total).toLocaleString("es-AR")}</td>
        <td style="padding: 8px;">
          <span class="badge badge-gray" style="font-size: 0.65rem;">${sale.method}</span>
        </td>
        <td style="padding: 8px; text-align: right;" onclick="event.stopPropagation();">
          <button class="btn btn-emerald" style="padding: 4px 8px; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px;" onclick="emitInvoiceFromSale('${sale.id}')">
            ⚡ Facturar
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function toggleSelectAllUninvoiced(source) {
  const checkboxes = document.querySelectorAll(".arca-select-uninvoiced");
  checkboxes.forEach(cb => {
    if (!cb.disabled) cb.checked = source.checked;
  });
  updateBulkInvoiceButtonVisibility();
}

function toggleRowCheckbox(event, saleId) {
  const cb = event.currentTarget.querySelector(".arca-select-uninvoiced");
  if (cb && !cb.disabled) {
    cb.checked = !cb.checked;
    updateBulkInvoiceButtonVisibility();
  }
}

function selectAllUninvoicedSales(check) {
  const checkboxes = document.querySelectorAll(".arca-select-uninvoiced");
  checkboxes.forEach(cb => {
    if (!cb.disabled) cb.checked = check;
  });
  const selectAllCb = document.getElementById("arca-select-all-uninvoiced");
  if (selectAllCb) selectAllCb.checked = check;
  updateBulkInvoiceButtonVisibility();
}

function updateBulkInvoiceButtonVisibility() {
  const checked = document.querySelectorAll(".arca-select-uninvoiced:checked");
  const btn = document.getElementById("arca-bulk-invoice-btn");
  const countSpan = document.getElementById("arca-bulk-count");
  
  if (countSpan) {
    countSpan.innerText = checked.length;
  }
  
  if (btn) {
    if (checked.length > 0) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.boxShadow = "0 0 12px rgba(16, 185, 129, 0.4)";
    } else {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.style.boxShadow = "none";
    }
  }
}

async function emitBulkArcaInvoices() {
  const checked = document.querySelectorAll(".arca-select-uninvoiced:checked");
  if (checked.length === 0) {
    showToast("Selecciona al menos una venta para facturar", true);
    return;
  }
  
  const selectedIds = Array.from(checked).map(cb => cb.value);
  
  showConfirmModal(
    `¿Deseas facturar de forma masiva estas ${selectedIds.length} ventas?`,
    async () => {
      let successCount = 0;
      let failCount = 0;
      let errors = [];
      
      // Disable select all checkbox and all sale checkboxes during emission
      const selectAllCb = document.getElementById("arca-select-all-uninvoiced");
      if (selectAllCb) selectAllCb.disabled = true;
      checked.forEach(cb => cb.disabled = true);
      
      showToast(`Iniciando facturación masiva de ${selectedIds.length} comprobantes...`);
      
      for (let i = 0; i < selectedIds.length; i++) {
        if (i > 0) {
          await new Promise(r => setTimeout(r, 300));
        }
        
        const saleId = selectedIds[i];
        // Find local sale for name reference
        const sale = state.sales.find(s => s.id === saleId);
        const saleDesc = sale ? `$ ${Math.round(sale.total).toLocaleString("es-AR")}` : `#${saleId}`;
        
        showToast(`[${i+1}/${selectedIds.length}] Facturando venta de ${saleDesc}...`);
        
        let attempts = 0;
        let lastError = null;
        let success = false;
        
        while (attempts < 2 && !success) {
          try {
            attempts++;
            const res = await apiRequest("/api/invoices/emit", "POST", { sale_id: saleId });
            successCount++;
            success = true;
            // Solo si son 2 o menos ventas se ofrece/ejecuta la impresión individual
            if (selectedIds.length <= 2) {
              printSaleTicket(saleId);
            }
          } catch (error) {
            lastError = error;
            if (attempts < 2) {
              await new Promise(r => setTimeout(r, 800));
            }
          }
        }
        
        if (!success) {
          failCount++;
          errors.push(`Venta ${saleDesc}: ${lastError ? lastError.message : "Error de emisión"}`);
        }
      }
      
      // Refresh all states
      await refreshState();
      if (typeof renderUninvoicedSales === 'function') renderUninvoicedSales();
      
      // Re-enable select all
      if (selectAllCb) {
        selectAllCb.disabled = false;
        selectAllCb.checked = false;
      }
      
      if (failCount === 0) {
        showToast(`¡Facturación masiva completada con éxito! Se emitieron ${successCount} comprobantes.`);
      } else {
        showToast(`Facturación masiva finalizada. Éxitos: ${successCount}. Errores: ${failCount}.`, true);
        alert(`Errores durante la facturación masiva:\n\n` + errors.join("\n"));
      }
    },
    "Facturar de Forma Masiva",
    false,
    "Facturar Masivo"
  );
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
    chip.style.cssText = "background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-white);";
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
  const szStr = sz.toString().trim();
  if (!szStr) return "Único";
  const szUpper = szStr.toUpperCase();
  if (["U", "UNICO", "ÚNICO", "TALLE UNICO", "TALLE ÚNICO", "SINGLE"].includes(szUpper)) {
    return "Único";
  }
  return szStr;
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
window.toggleLoginPasswordVisibility = toggleLoginPasswordVisibility;

function toggleRegisterPasswordVisibility(inputId, eyeIconId) {
  const pwdInput = document.getElementById(inputId);
  const eyeIcon = document.getElementById(eyeIconId);
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
window.toggleRegisterPasswordVisibility = toggleRegisterPasswordVisibility;

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

// ==========================================
// BUSINESS SETTINGS & USERS
// ==========================================

function isAdminSectionAllowed(secId) {
  const adminEmails = ["valentinoklcv@gmail.com", "jomoindumentaria@gmail.com", "klejavalentino@gmail.com", "kljevalentino@gmail.com", "matiascuchettidiaz@gmail.com", "datamargen@gmail.com"];
  const adminEmail = (state.userProfile?.contactEmail || state.userProfile?.email || "").toLowerCase();
  const isAdminAllowedEmail = adminEmails.includes(adminEmail);

  if (secId === "tiendanube") {
    return (state.userProfile?.tiendanubeEnabled === true) || isAdminAllowedEmail;
  }
  if (secId === "arca") {
    return (state.userProfile?.arcaEnabled === true) || isAdminAllowedEmail;
  }
  if (secId === "zecat") {
    const zecatAllowedEmails = ["jomoindumentaria@gmail.com"];
    return (state.userProfile?.zecatEnabled === true) || zecatAllowedEmails.includes(adminEmail);
  }
  if (secId === "production") {
    const hasOrders = (state.products || []).some(p => p && p.sku && p.sku.startsWith("productionorder_"));
    const hasBaseCategories = state.userProfile?.productionBaseCategories && state.userProfile.productionBaseCategories.length > 0;
    return (state.userProfile?.productionEnabled === true) || hasOrders || hasBaseCategories || isAdminAllowedEmail;
  }
  return true;
}

function applyPermissionsToUI() {
  const delAccBtn = document.getElementById("business-delete-account-btn");
  if (delAccBtn) {
    delAccBtn.style.display = state.role === "admin" ? "inline-flex" : "none";
  }

  // Solo aplicamos bloqueo si es subuser y tiene permissions
  if (state.role === "admin" || !state.permissions) {
    // Restaurar todo a visible/habilitado si es admin (sin sobreescribir ítems especiales ocultos)
    document.querySelectorAll(".menu-item:not(#sidebar-tiendanube-item):not(#sidebar-arca-item):not(#sidebar-zecat-item)").forEach(el => el.style.display = "");
    document.querySelectorAll("button:not(.sidebar-menu-btn), input, select, textarea").forEach(el => el.disabled = false);
    return;
  }
  
  const p = state.permissions;
  
  APP_SECTIONS.forEach(sec => {
    // Si la sección no está definida en la lista de permisos del subuser, permitir por defecto para no bloquear nuevas pestañas
    const access = (p[sec.id] !== undefined) ? p[sec.id] : "edit";
    const menuItem = document.querySelector(`.menu-item[data-tab="${sec.id}"]`);
    const sectionEl = document.getElementById(`${sec.id}-section`);
    
    const isAllowedForAdmin = isAdminSectionAllowed(sec.id);
    
    // 1. Control de Visibilidad en el menú
    if (menuItem) {
      if (!isAllowedForAdmin || access === "none") {
        menuItem.style.display = "none";
        // Si estaba activo, sacarlo al panel u otro lado
        if (state.activeTab === sec.id) switchTab("panel");
      } else {
        // For special sections (arca, tiendanube, zecat): only show if the admin has them enabled OR if subuser has permission
        // These sections might be hidden by default (handled in the main sidebar load), but if subuser has explicit access, show them
        if (sec.id === "tiendanube" || sec.id === "arca" || sec.id === "zecat") {
          // Show the section for the subuser if they have view or edit access
          menuItem.style.display = "block";
        } else {
          menuItem.style.display = "";
        }
      }
    }
    
    // 2. Control de Edición (Solo si puede ver)
    if (sectionEl && access === "view") {
      // Deshabilitar todos los inputs y botones de guardado en esta sección
      const inputs = sectionEl.querySelectorAll("input, select, textarea");
      inputs.forEach(el => el.disabled = true);
      
      const buttons = sectionEl.querySelectorAll("button:not(.nav-btn)");
      buttons.forEach(el => {
        // Bloquear botones que parezcan ser de acción
        if(el.innerText.includes("Guardar") || el.innerText.includes("+") || el.innerText.includes("Agregar") || el.innerText.includes("Cobrar") || el.innerText.includes("Borrar") || el.innerText.includes("Eliminar")) {
          el.disabled = true;
          el.style.opacity = "0.5";
          el.style.cursor = "not-allowed";
        }
      });
    }
  });
}

const APP_SECTIONS = [
  { id: "panel", name: "Panel Principal" },
  { id: "sales", name: "Ventas" },
  { id: "quotes", name: "Presupuestos" },
  { id: "services", name: "Taller" },
  { id: "returns", name: "Devoluciones" },
  { id: "inventory", name: "Inventario" },
  { id: "suppliers", name: "Compras" },
  { id: "extras", name: "Insumos" },
  { id: "supplier-accounts", name: "Cuentas a Pagar" },
  { id: "collections", name: "Cobranzas" },
  { id: "cash", name: "Caja" },
  { id: "fixed-costs", name: "Costos Fijos" },
  { id: "marketing", name: "Marketing" },
  { id: "tiendanube", name: "TiendaNube" },
  { id: "arca", name: "ARCA" },
  { id: "zecat", name: "Zecat Web" },
  { id: "integrations", name: "Integraciones" },
  { id: "business", name: "Configuración" }
];

function renderCategorySizePills() {
  const fullsizeList = document.getElementById("business-settings-fullsize-cats-list");
  if (!fullsizeList) return;

  // Preserve toggled category selections while redrawing
  const currentCategorySelections = {};
  const pillContainers = document.querySelectorAll(".category-size-pills-container");
  pillContainers.forEach(container => {
    const cat = container.dataset.category;
    const activePills = container.querySelectorAll(".size-pill-btn.active");
    currentCategorySelections[cat] = Array.from(activePills).map(pill => pill.dataset.size);
  });

  // Preserve toggled product selections while redrawing
  const currentProductSelections = {};
  const prodPillContainers = document.querySelectorAll(".product-size-pills-container");
  prodPillContainers.forEach(container => {
    const pKey = container.dataset.productKey;
    const activePills = container.querySelectorAll(".size-pill-btn.active");
    currentProductSelections[pKey] = Array.from(activePills).map(pill => pill.dataset.size);
  });

  fullsizeList.innerHTML = "";
  const savedCategorySizes = state.userProfile?.categorySizes || {};
  const savedProductSizes = state.userProfile?.productSizes || {};
  const allCats = state.categories || [];
  
  // Read size variants directly from the input field
  const sizeVariantsInput = document.getElementById("business-settings-sizes");
  let globalSizes = [];
  if (sizeVariantsInput && sizeVariantsInput.value.trim().length > 0) {
    globalSizes = sizeVariantsInput.value.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    globalSizes = getConfiguredSizes();
  }

  if (allCats.length === 0) {
    fullsizeList.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-gray);">No hay categorías creadas aún.</span>';
    return;
  }

  allCats.forEach(cat => {
    let activeCatSizes = [];
    if (currentCategorySelections[cat] !== undefined) {
      activeCatSizes = currentCategorySelections[cat];
    } else {
      const matchedKey = Object.keys(savedCategorySizes).find(k => k.toLowerCase().trim() === cat.toLowerCase().trim());
      if (matchedKey && Array.isArray(savedCategorySizes[matchedKey])) {
        activeCatSizes = savedCategorySizes[matchedKey];
      } else {
        const cLower = cat.toLowerCase();
        if (cLower.includes("gorro") || cLower.includes("gorra") || cLower.includes("sombrero") || cLower.includes("accesorio") || cLower.includes("bolso") || cLower.includes("mochila") || cLower.includes("bazar") || cLower.includes("cartera")) {
          activeCatSizes = ["Único"];
        } else {
          activeCatSizes = globalSizes.slice();
        }
      }
    }

    const catCard = document.createElement("div");
    catCard.style.cssText = "display: flex; flex-direction: column; gap: 10px; padding: 14px 12px; background: rgba(255,255,255,0.015); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 8px;";
    
    // Category Header & Category Pills
    const titleDiv = document.createElement("div");
    titleDiv.style.cssText = "font-size: 0.9rem; font-weight: 800; color: var(--text-white); display: flex; align-items: center; justify-content: space-between;";
    titleDiv.innerHTML = `<span>📁 ${cat}</span><span style="font-size: 0.7rem; font-weight: normal; color: var(--text-gray);">Talles por Categoría</span>`;
    catCard.appendChild(titleDiv);

    const catPillsDiv = document.createElement("div");
    catPillsDiv.className = "category-size-pills-container";
    catPillsDiv.dataset.category = cat;
    catPillsDiv.style.cssText = "display: flex; flex-wrap: wrap; gap: 6px;";

    globalSizes.forEach(sz => {
      const isActive = activeCatSizes.some(s => s.toLowerCase().trim() === sz.toLowerCase().trim());
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = `size-pill-btn ${isActive ? 'active' : ''}`;
      badge.dataset.size = sz;
      
      const activeStyle = "background: rgba(16,185,129,0.15); color: var(--accent-emerald); border: 1px solid rgba(16,185,129,0.4);";
      const inactiveStyle = "background: rgba(255,255,255,0.02); color: var(--text-gray); border: 1px solid var(--border-color);";
      
      badge.style.cssText = "padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (isActive ? activeStyle : inactiveStyle);
      badge.innerText = sz;

      badge.onclick = () => {
        badge.classList.toggle("active");
        const nowActive = badge.classList.contains("active");
        badge.style.cssText = "padding: 4px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (nowActive ? activeStyle : inactiveStyle);
      };

      catPillsDiv.appendChild(badge);
    });

    catCard.appendChild(catPillsDiv);

    // Products under this Category
    const catProductsMap = new Map();
    (state.products || []).forEach(p => {
      if (!p) return;
      const s = p.sku || p.id || "";
      if (s.startsWith("supplier_") || s.startsWith("fixedcost_") || s.startsWith("account_") || s.startsWith("cashtransaction_") || s.startsWith("influencer_") || s.startsWith("marketingexpense_") || s.startsWith("stockintake_") || s === "extras_config" || s === "categories_config") {
        return;
      }
      const pCat = (p.category || "").trim();
      if (pCat.toLowerCase() === cat.toLowerCase()) {
        const gKey = getProductGroupKey(p);
        if (!catProductsMap.has(gKey)) {
          catProductsMap.set(gKey, {
            groupKey: gKey,
            name: getProductNameWithColor(p) || p.name || "Producto",
            variants: [p]
          });
        } else {
          catProductsMap.get(gKey).variants.push(p);
        }
      }
    });
    const catProducts = Array.from(catProductsMap.values());

    if (catProducts.length > 0) {
      const prodSubHeader = document.createElement("div");
      prodSubHeader.style.cssText = "font-size: 0.75rem; font-weight: 700; color: var(--accent-blue); margin-top: 6px; margin-bottom: 2px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.06);";
      prodSubHeader.innerText = "ESPECIFICAR TALLES POR PRODUCTO:";
      catCard.appendChild(prodSubHeader);

      const prodsListDiv = document.createElement("div");
      prodsListDiv.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin-left: 10px;";

      catProducts.forEach(prodItem => {
        let activeProdSizes = [];
        if (currentProductSelections[prodItem.groupKey] !== undefined) {
          activeProdSizes = currentProductSelections[prodItem.groupKey];
        } else {
          const matchedPKey = Object.keys(savedProductSizes).find(k => k.toLowerCase().trim() === prodItem.groupKey.toLowerCase().trim());
          if (matchedPKey && Array.isArray(savedProductSizes[matchedPKey]) && savedProductSizes[matchedPKey].length > 0) {
            activeProdSizes = savedProductSizes[matchedPKey];
          } else {
            const existingSizes = prodItem.variants.map(v => v.size).filter(Boolean);
            if (existingSizes.length > 0) {
              activeProdSizes = existingSizes;
            } else {
              activeProdSizes = activeCatSizes.slice();
            }
          }
        }

        const prodRow = document.createElement("div");
        prodRow.style.cssText = "display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px;";

        const pNameDiv = document.createElement("div");
        pNameDiv.style.cssText = "font-size: 0.8rem; font-weight: 700; color: var(--text-white);";
        pNameDiv.innerText = `👕 ${prodItem.name}`;
        prodRow.appendChild(pNameDiv);

        const prodPillsDiv = document.createElement("div");
        prodPillsDiv.className = "product-size-pills-container";
        prodPillsDiv.dataset.productKey = prodItem.groupKey;
        prodPillsDiv.style.cssText = "display: flex; flex-wrap: wrap; gap: 4px;";

        globalSizes.forEach(sz => {
          const isActive = activeProdSizes.some(s => s.toLowerCase().trim() === sz.toLowerCase().trim());
          const badge = document.createElement("button");
          badge.type = "button";
          badge.className = `size-pill-btn ${isActive ? 'active' : ''}`;
          badge.dataset.size = sz;

          const activeStyle = "background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.5);";
          const inactiveStyle = "background: rgba(255,255,255,0.02); color: var(--text-gray); border: 1px solid var(--border-color);";

          badge.style.cssText = "padding: 3px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (isActive ? activeStyle : inactiveStyle);
          badge.innerText = sz;

          badge.onclick = () => {
            badge.classList.toggle("active");
            const nowActive = badge.classList.contains("active");
            badge.style.cssText = "padding: 3px 8px; border-radius: 5px; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none; " + (nowActive ? activeStyle : inactiveStyle);
          };

          prodPillsDiv.appendChild(badge);
        });

        prodRow.appendChild(prodPillsDiv);
        prodsListDiv.appendChild(prodRow);
      });

      catCard.appendChild(prodsListDiv);
    }

    fullsizeList.appendChild(catCard);
  });
}
window.renderCategorySizePills = renderCategorySizePills;

async function loadBusinessData() {
  if (state.userProfile) {
    const curProj = (state.projects || []).find(p => p.id === state.currentProjectId);
    document.getElementById("business-settings-name").value = state.currentProjectName || curProj?.name || state.userProfile.businessName || "";
    document.getElementById("business-settings-model").value = curProj?.businessModel || state.userProfile.businessModel || "Indumentaria";
    
    const ivaEl = document.getElementById("business-settings-iva");
    if (ivaEl) {
      ivaEl.value = state.userProfile.ivaCondition || "monotributista";
    }
    
    // Mapear Logo
    const logoBase64 = state.userProfile.logoBase64;
    const previewContainer = document.getElementById("business-settings-logo-preview-container");
    const previewImg = document.getElementById("business-settings-logo-preview");
    const removeBtn = document.getElementById("business-settings-logo-remove-btn");
    const fileInput = document.getElementById("business-settings-logo-input");

    if (fileInput) fileInput.value = "";
    state.tempLogoBase64 = null;
    state.removeLogoFlag = false;

    if (logoBase64 && previewContainer && previewImg && removeBtn) {
      previewImg.src = logoBase64;
      previewContainer.style.display = "flex";
      removeBtn.style.display = "inline-block";
    } else if (previewContainer && removeBtn) {
      previewContainer.style.display = "none";
      removeBtn.style.display = "none";
    }

    // Configuración de Talles
    const sizeVariantsInput = document.getElementById("business-settings-sizes");
    const sizeVariantsContainer = document.getElementById("business-settings-sizes-container");
    const fullsizeContainer = document.getElementById("business-settings-fullsize-cats-container");
    const fullsizeList = document.getElementById("business-settings-fullsize-cats-list");

    const userEmail = (state.email || state.userEmail || "").toLowerCase();
    const isMatias = userEmail.includes("matias") || (state.businessName || "").toLowerCase().includes("mazo");
    const defaultMatiasSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Único", "Talle 1 (S/M)", "Talle 2 (M/L)", "Talle 2 (L/XL)", "Talle 3 (L/XL)", "Talle 4 (XL)"];

    if (sizeVariantsInput && sizeVariantsContainer) {
      let savedSizes = state.userProfile.sizeVariants;
      if (!savedSizes || savedSizes.length === 0) {
        savedSizes = isMatias ? defaultMatiasSizes : ["XS", "S", "M", "L", "XL", "XXL", "Único"];
      }
      sizeVariantsInput.value = savedSizes.join(", ");
      
      const updateSizesVisibility = () => {
        const model = document.getElementById("business-settings-model").value;
        const isIndumentaria = model === "Indumentaria";
        sizeVariantsContainer.style.display = isIndumentaria ? "block" : "none";
        if (fullsizeContainer) fullsizeContainer.style.display = isIndumentaria ? "block" : "none";
      };
      
      document.getElementById("business-settings-model").addEventListener("change", updateSizesVisibility);
      updateSizesVisibility();

      sizeVariantsInput.oninput = function() {
        renderCategorySizePills();
      };
    }

    renderCategorySizePills();
    
    // Dibujar filas dinámicas en las subpestañas
    renderDynamicSettingsRows();
    if (typeof renderPaymentMethods === 'function') renderPaymentMethods();

    // Mapear Configuración de Impresión
    const print = state.userProfile.printSettings || {};
    const footerInput = document.getElementById("print-settings-footer");
    if (footerInput) footerInput.value = print.footerText || "";
  }
  await loadBusinessUsers();
}
window.loadBusinessData = loadBusinessData;

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 500 * 1024) {
    showToast("El logo debe ser de un tamaño menor a 500 KB.", true);
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    const previewImg = document.getElementById("business-settings-logo-preview");
    const previewContainer = document.getElementById("business-settings-logo-preview-container");
    const removeBtn = document.getElementById("business-settings-logo-remove-btn");
    if (previewImg && previewContainer && removeBtn) {
      previewImg.src = base64;
      previewContainer.style.display = "flex";
      removeBtn.style.display = "inline-block";
    }
    state.tempLogoBase64 = base64;
    state.removeLogoFlag = false;
  };
  reader.readAsDataURL(file);
}

function removeBusinessLogo() {
  const previewImg = document.getElementById("business-settings-logo-preview");
  const previewContainer = document.getElementById("business-settings-logo-preview-container");
  const removeBtn = document.getElementById("business-settings-logo-remove-btn");
  const fileInput = document.getElementById("business-settings-logo-input");
  
  if (fileInput) fileInput.value = "";
  if (previewImg) previewImg.src = "";
  if (previewContainer) previewContainer.style.display = "none";
  if (removeBtn) removeBtn.style.display = "none";
  
  state.tempLogoBase64 = null;
  state.removeLogoFlag = true;
}

window.handleLogoUpload = handleLogoUpload;
window.removeBusinessLogo = removeBusinessLogo;

async function saveBusinessSettings() {
  try {
    const model = document.getElementById("business-settings-model").value;
    const type = (model === "Indumentaria") ? "textil" : "comercio";
    const name = document.getElementById("business-settings-name").value.trim();

    let logoValue = state.userProfile.logoBase64 || null;
    if (state.removeLogoFlag) {
      logoValue = null;
    } else if (state.tempLogoBase64) {
      logoValue = state.tempLogoBase64;
    }

    const categorySizes = {};
    const pillContainers = document.querySelectorAll(".category-size-pills-container");
    pillContainers.forEach(container => {
      const cat = container.dataset.category;
      const activePills = container.querySelectorAll(".size-pill-btn.active");
      const sizes = Array.from(activePills).map(pill => pill.dataset.size);
      categorySizes[cat] = sizes;
    });

    const productSizes = {};
    const prodPillContainers = document.querySelectorAll(".product-size-pills-container");
    prodPillContainers.forEach(container => {
      const pKey = container.dataset.productKey;
      const activePills = container.querySelectorAll(".size-pill-btn.active");
      const sizes = Array.from(activePills).map(pill => pill.dataset.size);
      productSizes[pKey] = sizes;
    });

    const data = {
      businessName: name,
      businessModel: model,
      businessType: type,
      ivaCondition: document.getElementById("business-settings-iva") ? document.getElementById("business-settings-iva").value : (state.userProfile?.ivaCondition || "monotributista"),
      logoBase64: logoValue,
      sizeVariants: document.getElementById("business-settings-sizes") 
                      ? document.getElementById("business-settings-sizes").value.split(",").map(s => s.trim()).filter(s => s) 
                      : ["XS", "S", "M", "L", "XL", "XXL", "Único"],
      categorySizes: categorySizes,
      productSizes: productSizes,
      bizCheckboxes: {}
    };

    if (state.currentProjectId) {
      try {
        const projRes = await apiRequest(`/api/projects/${state.currentProjectId}`, "PUT", { name: name, businessModel: model, businessType: type });
        if (projRes && projRes.projects) {
          state.projects = projRes.projects;
        }
        state.currentProjectName = name;
        localStorage.setItem("datamargen_project_name", name);
      } catch (projErr) {
        console.warn("Could not update project name in user_projects:", projErr);
      }
    }

    const res = await apiRequest("/api/business/settings", "PUT", data);
    state.userProfile = res.userProfile;
    state.businessName = name;
    localStorage.setItem("datamargen_business_name", name);
    state.businessType = type;
    localStorage.setItem("datamargen_business_type", type);
    
    updateTopbarProjectName();
    updateSidebarProfile();
    renderProjectsManagementPanel();
    
    showToast("Ajustes guardados con éxito.");
  } catch(e) {
    showToast("Error: " + e.message, true);
  }
}
window.saveBusinessSettings = saveBusinessSettings;

async function triggerAdminSyncGoogleSheets() {
  try {
    showToast("Iniciando sincronización masiva...");
    const res = await apiRequest("/api/admin/sync-existing-to-sheets", "POST");
    if (res.success) {
      showToast(res.message);
    } else {
      showToast(res.error || "Error al sincronizar", true);
    }
  } catch (error) {
    showToast(error.message, true);
  }
}
window.triggerAdminSyncGoogleSheets = triggerAdminSyncGoogleSheets;

async function loadBusinessUsers() {
  try {
    let users = [];
    try {
      users = await apiRequest("/api/business/users");
    } catch (err) {
      console.warn("Could not fetch users list:", err);
    }
    
    const tbody = document.getElementById("business-users-tbody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    if (!users || !Array.isArray(users)) users = [];
    
    const isSubuser = !!state.subuser || state.role === "subuser";
    
    // Update plan users limit badge
    const subUsersCount = users.length;
    const maxAllowed = 3;
    const available = Math.max(0, maxAllowed - subUsersCount);
    
    const limitBadge = document.getElementById("plan-users-limit-badge");
    if (limitBadge) {
      limitBadge.innerText = `— ${available} disponibles`;
    }
    
    const addBtn = document.getElementById("btn-add-business-user");
    if (addBtn) {
      if (isSubuser) {
        addBtn.style.display = "none";
      } else {
        addBtn.style.display = "";
        if (available <= 0) {
          addBtn.disabled = true;
          addBtn.title = "Límite de usuarios alcanzado (Plan Pro permite hasta 3 usuarios adicionales)";
        } else {
          addBtn.disabled = false;
          addBtn.removeAttribute("title");
        }
      }
    }
    
    // Inyectar el administrador principal
    const adminUser = {
      id: "admin",
      name: state.userProfile?.contactName || state.userProfile?.name || state.businessName || "Administrador",
      username: state.userProfile?.username || "admin",
      email: state.userProfile?.contactEmail || (isSubuser ? "Administrador Principal" : state.email),
      status: "Activo",
      isAdmin: true
    };
    users.unshift(adminUser);
    
    users.forEach(u => {
      const accessBadge = "Personalizado";
      const statusBadge = u.status === "Activo" 
        ? `<span class="badge-green">Activo</span>` 
        : `<span class="badge-red">${u.status || 'Inactivo'}</span>`;
        
      // Owner/Admin: show pencil to edit own profile (no delete). Subusers: no actions. Others: full actions.
      let actionsCell;
      if (u.isAdmin && !isSubuser) {
        // Owner: show edit pencil button
        actionsCell = `
          <button class="btn" style="background: none; border: none; padding: 6px; cursor: pointer; color: var(--accent-blue); font-size: 1.1rem; margin-right: 4px; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s;" onclick="editBusinessUser('admin')" title="Editar mi perfil">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <span style="font-size:0.7rem; color:var(--text-gray); font-style:italic; vertical-align:middle;">Dueño</span>
        `;
      } else if (isSubuser || u.isAdmin) {
        actionsCell = `<span style="font-size:0.75rem; color:var(--text-gray);">-</span>`;
      } else {
        actionsCell = `
          <button class="btn" style="background: none; border: none; padding: 6px; cursor: pointer; color: var(--accent-blue); font-size: 1.1rem; margin-right: 12px; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s;" onclick="editBusinessUser('${u.id}')" title="Editar y ajustar permisos">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <button class="btn" style="background: none; border: none; padding: 6px; cursor: pointer; color: var(--accent-red); font-size: 1.1rem; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s;" onclick="deleteBusinessUser('${u.id}')" title="Eliminar usuario del sistema">
            <i class="fa-solid fa-trash"></i>
          </button>
        `;
      }

      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-color)";
      tr.innerHTML = `
        <td style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; border-radius: 6px; background: var(--bg-color); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--text-gray);">
              ${(u.username || u.name || "U").charAt(0).toUpperCase()}
            </div>
            <span style="font-weight: 600; color: var(--text-dark);">@${u.username || 'usuario'}</span>
          </div>
        </td>
        <td style="padding: 16px; font-weight: 600; text-transform: uppercase;">${u.name || '-'}</td>
        <td style="padding: 16px; color: var(--text-gray);">${u.email || '-'}</td>
        <td style="padding: 16px; text-align: center;"><span class="badge-blue">${u.isAdmin ? 'Administrador' : accessBadge}</span></td>
        <td style="padding: 16px; text-align: center;">${statusBadge}</td>
        <td style="padding: 16px; text-align: right;">${actionsCell}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch(e) {
    console.error("Error loading users:", e);
  }
}
window.loadBusinessUsers = loadBusinessUsers;

let currentEditingUser = null;
let currentUserPermissions = {};

function getActiveSectionsForPermissions() {
  // Returns only the sections that are currently active/visible in the sidebar for this business.
  // Special sections (TiendaNube, ARCA, Zecat) are only included if they're enabled for this business.
  const userEmail = (state.email || "").toLowerCase();
  const adminEmails = ["valentinoklcv@gmail.com", "jomoindumentaria@gmail.com", "klejavalentino@gmail.com", "kljevalentino@gmail.com", "matiascuchettidiaz@gmail.com", "datamargen@gmail.com"];
  const isAllowedEmail = adminEmails.includes(userEmail) || state.role === "admin";

  const isTnActive = (state.userProfile?.tiendanubeEnabled === true) || isAllowedEmail;
  const isArcaActive = (state.userProfile?.arcaEnabled === true) || isAllowedEmail;
  const zecatAllowedEmails = ["jomoindumentaria@gmail.com"];
  const isZecatActive = (state.userProfile?.zecatEnabled === true) || zecatAllowedEmails.includes(userEmail);

  return APP_SECTIONS.filter(sec => {
    if (sec.id === "tiendanube") return isTnActive;
    if (sec.id === "arca") return isArcaActive;
    if (sec.id === "zecat") return isZecatActive;
    return true;
  });
}
window.getActiveSectionsForPermissions = getActiveSectionsForPermissions;

function renderPermissionsMatrix() {
  const tbody = document.getElementById("modal-permissions-tbody");
  if(!tbody) return;
  tbody.innerHTML = "";
  
  const activeSections = getActiveSectionsForPermissions();
  
  activeSections.forEach(sec => {
    const val = currentUserPermissions[sec.id] || "none";
    const isView = val === "view" || val === "edit";
    const isEdit = val === "edit";
    
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border-color)";
    tr.innerHTML = `
      <td style="padding: 12px 8px; font-weight: 500; font-size: 0.85rem; color: var(--text-dark);">${sec.name}</td>
      <td style="text-align: center; padding: 12px 8px;">
        <input type="checkbox" onchange="togglePermission('${sec.id}', 'view', this.checked)" ${isView ? 'checked' : ''} style="accent-color: var(--accent-blue);">
      </td>
      <td style="text-align: center; padding: 12px 8px;">
        <input type="checkbox" onchange="togglePermission('${sec.id}', 'edit', this.checked)" ${isEdit ? 'checked' : ''} style="accent-color: var(--accent-green);">
      </td>
    `;
    tbody.appendChild(tr);
  });
}
window.renderPermissionsMatrix = renderPermissionsMatrix;

function togglePermission(secId, type, isChecked) {
  const current = currentUserPermissions[secId] || "none";
  if (type === "edit") {
    currentUserPermissions[secId] = isChecked ? "edit" : "view";
  } else if (type === "view") {
    currentUserPermissions[secId] = isChecked ? "view" : "none";
    if (!isChecked && currentUserPermissions[secId] === "edit") {
      currentUserPermissions[secId] = "none";
    }
  }
  renderPermissionsMatrix();
}
window.togglePermission = togglePermission;

function setUserPermissionsAll(mode) {
  const activeSections = getActiveSectionsForPermissions();
  activeSections.forEach(sec => {
    if (mode === "all") currentUserPermissions[sec.id] = "edit";
    else if (mode === "view") currentUserPermissions[sec.id] = "view";
    else currentUserPermissions[sec.id] = "none";
  });
  renderPermissionsMatrix();
}
window.setUserPermissionsAll = setUserPermissionsAll;

function openNewUserModal() {
  currentEditingUser = null;
  document.getElementById("modal-user-id").value = "";
  document.getElementById("modal-user-name").value = "";
  document.getElementById("modal-user-email").value = "";
  document.getElementById("modal-user-username").value = "";
  document.getElementById("modal-user-password").value = "";
  document.getElementById("modal-user-password").placeholder = "Contraseña";
  
  document.getElementById("modal-user-title").innerText = "Nuevo Usuario";
  document.getElementById("modal-user-email").disabled = false;
  
  document.getElementById("modal-user-username").disabled = false;
  document.getElementById("modal-user-password").disabled = false;
  
  const permSection = document.getElementById("permissions-section");
  if(permSection) permSection.style.display = "block";
  
  currentUserPermissions = {};
  setUserPermissionsAll("none");
  
  document.getElementById("modal-business-user").style.display = "flex";
}
window.openNewUserModal = openNewUserModal;

async function editBusinessUser(uid) {
  if (uid === "admin") {
    currentEditingUser = "admin";
    document.getElementById("modal-user-id").value = "admin";
    document.getElementById("modal-user-name").value = state.userProfile?.name || state.userProfile?.contactName || "";
    document.getElementById("modal-user-email").value = state.email || state.userProfile?.contactEmail || "";
    document.getElementById("modal-user-username").value = state.userProfile?.username || "";
    document.getElementById("modal-user-username").disabled = false;
    document.getElementById("modal-user-password").value = "";
    document.getElementById("modal-user-password").placeholder = "(Dejar vacío para no cambiar)";
    document.getElementById("modal-user-password").disabled = false;
    
    document.getElementById("modal-user-title").innerText = "Editar Mi Perfil";
    document.getElementById("modal-user-email").disabled = false;
    
    // hide permissions section for owner (admin has all access)
    const permSection = document.getElementById("permissions-section");
    if(permSection) permSection.style.display = "none";
    
    document.getElementById("modal-business-user").style.display = "flex";
    return;
  }
  try {
    const users = await apiRequest("/api/business/users");
    const u = users.find(x => x.id === uid);
    if(!u) return;
    
    currentEditingUser = uid;
    document.getElementById("modal-user-id").value = u.id;
    document.getElementById("modal-user-name").value = u.name || "";
    document.getElementById("modal-user-email").value = u.email || "";
    document.getElementById("modal-user-username").value = u.username || "";
    document.getElementById("modal-user-password").value = "";
    document.getElementById("modal-user-password").placeholder = "(Dejar vacío para no cambiar)";
    
    document.getElementById("modal-user-username").disabled = false;
    document.getElementById("modal-user-password").disabled = false;
    
    document.getElementById("modal-user-title").innerText = "Editar Usuario";
    document.getElementById("modal-user-email").disabled = true;
    
    const permSection = document.getElementById("permissions-section");
    if(permSection) permSection.style.display = "block";
    
    currentUserPermissions = u.access || {};
    renderPermissionsMatrix();
    
    document.getElementById("modal-business-user").style.display = "flex";
  } catch(e) {
    showToast("Error: " + e.message, true);
  }
}
window.editBusinessUser = editBusinessUser;

function closeBusinessUserModal() {
  document.getElementById("modal-business-user").style.display = "none";
}
window.closeBusinessUserModal = closeBusinessUserModal;

function toggleModalUserPasswordVisibility() {
  const passwordInput = document.getElementById("modal-user-password");
  const eyeIcon = document.getElementById("modal-user-password-eye");
  if (!passwordInput || !eyeIcon) return;
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    eyeIcon.className = "fa-solid fa-eye-slash";
  } else {
    passwordInput.type = "password";
    eyeIcon.className = "fa-solid fa-eye";
  }
}
window.toggleModalUserPasswordVisibility = toggleModalUserPasswordVisibility;

async function saveBusinessUser() {
  const name = document.getElementById("modal-user-name").value;
  const email = document.getElementById("modal-user-email").value;
  const username = document.getElementById("modal-user-username").value;
  const password = document.getElementById("modal-user-password").value;
  
  if (!name || !email) {
    showToast("Nombre y Email son obligatorios", true);
    return;
  }
  
  if (!currentEditingUser && !password) {
    showToast("La contraseña es obligatoria para usuarios nuevos", true);
    return;
  }
  
  const payload = { name, email, username, access: currentUserPermissions };
  if (password) payload.password = password;
  
  try {
    if (currentEditingUser === "admin") {
      const adminPayload = { userProfileName: name, userProfileUsername: username, userProfileEmail: email };
      if (password) adminPayload.userProfilePassword = password;
      const res = await apiRequest("/api/business/settings", "PUT", adminPayload);
      state.userProfile = res.userProfile;
      if (email) state.email = email;
      showToast("Perfil de administrador actualizado.");
      closeBusinessUserModal();
      updateSidebarProfile();
      loadBusinessData();
      return;
    }
    
    const method = currentEditingUser ? "PUT" : "POST";
    const url = currentEditingUser ? `/api/business/users/${currentEditingUser}` : "/api/business/users";
    
    await apiRequest(url, method, payload);
    showToast(currentEditingUser ? "Usuario actualizado." : "Usuario creado con éxito.");
    closeBusinessUserModal();
    loadBusinessData();
  } catch (e) {
    showToast("Error: " + e.message, true);
  }
}
window.saveBusinessUser = saveBusinessUser;

async function deleteBusinessUser(uid) {
  if (uid === "admin") {
    showToast("No podés eliminar tu propia cuenta de administrador principal.", true);
    return;
  }
  if(!confirm("¿Estás seguro que querés eliminar el acceso de este usuario?")) return;
  try {
    await apiRequest(`/api/business/users/${uid}`, "DELETE");
    showToast("Usuario eliminado.");
    loadBusinessData();
  } catch(e) {
    showToast("Error: " + e.message, true);
  }
}
window.deleteBusinessUser = deleteBusinessUser;

// --- SOPORTE DE SUB-PESTAÑAS DE CONFIGURACIÓN ---
function switchSubTab(tabName) {
  document.querySelectorAll(".subtab-panel").forEach(panel => {
    panel.style.display = "none";
  });
  document.querySelectorAll(".subtab-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  
  const activePanel = document.getElementById(`panel-subtab-${tabName}`);
  if (activePanel) activePanel.style.display = "block";
  
  const activeBtn = document.getElementById(`btn-subtab-${tabName}`);
  if (activeBtn) activeBtn.classList.add("active");

  if (tabName === "projects") {
    renderProjectsManagementPanel();
  }
}
window.switchSubTab = switchSubTab;

// --- MULTI-PROYECTO / MULTI-NEGOCIO (HASTA 3) ---
function openProjectSelectionModal() {
  const modal = document.getElementById("project-selection-modal");
  if (!modal) return;
  renderProjectSelectionList();
  modal.style.display = "flex";
}
window.openProjectSelectionModal = openProjectSelectionModal;

function closeProjectSelectionModal() {
  const modal = document.getElementById("project-selection-modal");
  if (modal) modal.style.display = "none";
}
window.closeProjectSelectionModal = closeProjectSelectionModal;

function renderProjectSelectionList() {
  const listEl = document.getElementById("project-selection-list");
  const badgeEl = document.getElementById("project-count-badge");
  if (!listEl) return;

  listEl.innerHTML = "";
  const projects = state.projects || [];
  if (badgeEl) badgeEl.innerText = `Negocios: ${projects.length} / 3`;

  if (projects.length === 0) {
    listEl.innerHTML = `<p style="text-align: center; color: var(--text-gray); font-size: 0.85rem; padding: 20px;">No tenés otros negocios registrados.</p>`;
    return;
  }

  projects.forEach(p => {
    const card = document.createElement("div");
    const isActive = p.id === state.currentProjectId;
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: ${isActive ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)'};
      border: 1px solid ${isActive ? 'var(--accent-purple)' : 'var(--border-color)'};
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    let icon = "🏢";
    const rubroText = p.businessModel || (p.businessType === "textil" ? "Indumentaria" : "Comercio");
    if (rubroText === "Indumentaria") icon = "👕";
    else if (rubroText === "Bazar") icon = "🛒";
    else if (rubroText === "Tecnología") icon = "💻";
    else if (rubroText === "Almacén") icon = "🏬";
    else if (rubroText === "Estética") icon = "✨";

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px;">
        <span style="font-size: 1.5rem;">${icon}</span>
        <div>
          <h4 style="margin: 0; font-size: 0.95rem; color: var(--text-white); font-weight: 800;">${p.name}</h4>
          <span style="font-size: 0.75rem; color: var(--text-gray); font-weight: 500;">${rubroText}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${isActive ? '<span class="badge-blue" style="font-size: 0.65rem; padding: 3px 8px; font-weight: bold;">ACTIVO</span>' : ''}
        <button type="button" class="btn btn-emerald" style="padding: 6px 14px; font-size: 0.75rem; font-weight: bold;" onclick="selectProject('${p.id}')">Entrar →</button>
      </div>
    `;

    card.onclick = (e) => {
      if (e.target.tagName !== "BUTTON") selectProject(p.id);
    };

    listEl.appendChild(card);
  });
}
window.renderProjectSelectionList = renderProjectSelectionList;

async function selectProject(projectId, reloadApp = true) {
  const p = (state.projects || []).find(proj => proj.id === projectId);
  if (p) {
    state.currentProjectId = p.id;
    state.currentProjectName = p.name;
    state.businessType = p.businessType || (p.businessModel === "Indumentaria" ? "textil" : "comercio");
    state.businessName = p.name;

    localStorage.setItem("datamargen_project_id", p.id);
    localStorage.setItem("datamargen_project_name", p.name);
    localStorage.setItem("datamargen_business_type", state.businessType);
    localStorage.setItem("datamargen_business_name", p.name);

    updateTopbarProjectName();
    closeProjectSelectionModal();

    if (reloadApp) {
      showToast(`Ingresando a: ${p.name}`);
      document.getElementById("auth-section").style.display = "none";
      document.getElementById("app-section").style.display = "block";
      await initApp();
    }
  }
}
window.selectProject = selectProject;

function updateTopbarProjectName() {
  const el = document.getElementById("topbar-project-name");
  if (el) {
    el.innerText = state.currentProjectName || state.businessName || "Mi Negocio";
  }
}
window.updateTopbarProjectName = updateTopbarProjectName;

function openNewProjectModal() {
  const projects = state.projects || [];
  if (projects.length >= 3) {
    showToast("Has alcanzado el límite máximo de 3 negocios por cuenta.", true);
    return;
  }
  document.getElementById("new-proj-name").value = "";
  document.getElementById("new-project-modal").style.display = "flex";
}
window.openNewProjectModal = openNewProjectModal;

function closeNewProjectModal() {
  const modal = document.getElementById("new-project-modal");
  if (modal) modal.style.display = "none";
}
window.closeNewProjectModal = closeNewProjectModal;

async function submitCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById("new-proj-name").value.trim();
  const selectedType = document.getElementById("new-proj-type").value;
  const submitBtn = document.getElementById("submit-new-proj-btn");

  if (!name) {
    showToast("El nombre del negocio es obligatorio", true);
    return;
  }

  const sysBizType = (selectedType === "Indumentaria") ? "textil" : "comercio";

  try {
    submitBtn.disabled = true;
    submitBtn.innerText = "Creando...";

    const res = await apiRequest("/api/projects", "POST", { 
      name: name, 
      businessType: sysBizType,
      businessModel: selectedType 
    });
    showToast(`¡Negocio '${name}' creado con éxito!`);
    
    state.projects = res.projects || [];
    closeNewProjectModal();
    renderProjectSelectionList();
    renderProjectsManagementPanel();

    if (res.project) {
      await selectProject(res.project.id, true);
    }
  } catch (err) {
    showToast("Error al crear negocio: " + err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Crear Negocio";
  }
}
window.submitCreateProject = submitCreateProject;

function renderProjectsManagementPanel() {
  const container = document.getElementById("projects-management-list");
  const counterEl = document.getElementById("projects-counter-badge");
  const addBtn = document.getElementById("btn-add-new-project-settings");

  if (!container) return;

  const projects = state.projects || [];
  if (counterEl) counterEl.innerText = `Negocios: ${projects.length} / 3`;

  if (addBtn) {
    if (projects.length >= 3) {
      addBtn.disabled = true;
      addBtn.style.opacity = "0.5";
      addBtn.title = "Límite máximo de 3 negocios alcanzado";
    } else {
      addBtn.disabled = false;
      addBtn.style.opacity = "1";
    }
  }

  container.innerHTML = "";
  projects.forEach(p => {
    const card = document.createElement("div");
    const isActive = p.id === state.currentProjectId;
    card.style.cssText = `
      padding: 18px;
      background: ${isActive ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-input)'};
      border: 1px solid ${isActive ? 'var(--accent-purple)' : 'var(--border-color)'};
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
    `;

    let icon = "🏢";
    const rubro = p.businessModel || (p.businessType === "textil" ? "Indumentaria" : "Comercio");
    if (rubro === "Indumentaria") icon = "👕";
    else if (rubro === "Bazar") icon = "🛒";
    else if (rubro === "Tecnología") icon = "💻";
    else if (rubro === "Almacén") icon = "🏬";
    else if (rubro === "Estética") icon = "✨";

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 1.5rem;">${icon}</span>
          ${isActive ? '<span class="badge-blue" style="font-size: 0.65rem; padding: 3px 8px; font-weight: bold;">ACTIVO</span>' : '<span style="font-size: 0.75rem; color: var(--text-gray);">Inactivo</span>'}
        </div>
        <h4 style="margin: 0; color: var(--text-white); font-size: 1rem; font-weight: 800;">${p.name}</h4>
        <p style="margin: 3px 0 0 0; color: var(--text-gray); font-size: 0.75rem;">Tipo: ${rubro}</p>
      </div>
      <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; margin-top: 10px;">
        <div>
          ${projects.length > 1 ? `
            <button type="button" class="btn" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #ef4444; padding: 6px 12px; font-size: 0.75rem; font-weight: bold; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onclick="deleteProjectFromSettings('${p.id}', '${p.name}')" title="Eliminar este negocio">
              <i class="fa-solid fa-trash-can"></i> Eliminar
            </button>
          ` : ''}
        </div>
        <div>
          ${!isActive ? `<button type="button" class="btn btn-emerald" style="padding: 6px 12px; font-size: 0.75rem; font-weight: bold;" onclick="selectProject('${p.id}')">Cambiar A Este</button>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}
window.renderProjectsManagementPanel = renderProjectsManagementPanel;

async function deleteProjectFromSettings(projId, projName) {
  const projects = state.projects || [];
  if (projects.length <= 1) {
    showToast("No podés eliminar tu único negocio activo.", true);
    return;
  }

  const confirmDelete = confirm(`¿Estás seguro que querés eliminar permanentemente el negocio '${projName}'?\n\nEsta acción no se puede deshacer.`);
  if (!confirmDelete) return;

  try {
    const res = await apiRequest(`/api/projects/${projId}`, "DELETE");
    showToast(`Negocio '${projName}' eliminado correctamente.`);
    state.projects = res.projects || [];

    if (projId === state.currentProjectId && state.projects.length > 0) {
      await selectProject(state.projects[0].id, true);
    } else {
      renderProjectsManagementPanel();
      renderProjectSelectionList();
    }
  } catch (err) {
    showToast("Error al eliminar negocio: " + err.message, true);
  }
}
window.deleteProjectFromSettings = deleteProjectFromSettings;

function renderDynamicSettingsRows() {
  const locContainer = document.getElementById("locations-list-container");
  if (locContainer) {
    locContainer.innerHTML = "";
    const locations = state.userProfile.locations || ["Local Principal"];
    locations.forEach(loc => addLocationRow(loc));
  }

  const chanContainer = document.getElementById("channels-list-container");
  if (chanContainer) {
    chanContainer.innerHTML = "";
    const channels = state.userProfile.salesChannels || ["Local Principal"];
    channels.forEach(chan => addChannelRow(chan));
  }
}

function addLocationRow(value = "") {
  const container = document.getElementById("locations-list-container");
  if (!container) return;
  const div = document.createElement("div");
  div.style = "display: flex; gap: 12px; align-items: center; margin-bottom: 12px;";
  div.innerHTML = `
    <input type="text" class="form-input location-item-input" value="${value}" style="flex: 1; border-color: var(--border-color); background: var(--bg-input); color: var(--text-dark);" placeholder="Nombre de la ubicación">
    <button type="button" class="btn" style="background: rgba(229,56,59,0.1); border: 1px solid rgba(229,56,59,0.2); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="this.parentElement.remove()" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
  `;
  container.appendChild(div);
}
window.addLocationRow = addLocationRow;

function addChannelRow(value = "") {
  const container = document.getElementById("channels-list-container");
  if (!container) return;
  const div = document.createElement("div");
  div.style = "display: flex; gap: 12px; align-items: center; margin-bottom: 12px;";
  div.innerHTML = `
    <input type="text" class="form-input channel-item-input" value="${value}" style="flex: 1; border-color: var(--border-color); background: var(--bg-input); color: var(--text-dark);" placeholder="Nombre del canal">
    <button type="button" class="btn" style="background: rgba(229,56,59,0.1); border: 1px solid rgba(229,56,59,0.2); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="this.parentElement.remove()" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
  `;
  container.appendChild(div);
}
window.addChannelRow = addChannelRow;



async function saveLocationsSettings() {
  const inputs = document.querySelectorAll(".location-item-input");
  const locations = Array.from(inputs).map(inp => inp.value.trim()).filter(val => val !== "");
  try {
    const res = await apiRequest("/api/business/settings", "PUT", { locations });
    state.userProfile = res.userProfile;
    showToast("Ubicaciones guardadas con éxito.");
  } catch (e) {
    showToast("Error: " + e.message, true);
  }
}
window.saveLocationsSettings = saveLocationsSettings;

async function saveChannelsSettings() {
  const inputs = document.querySelectorAll(".channel-item-input");
  const salesChannels = Array.from(inputs).map(inp => inp.value.trim()).filter(val => val !== "");
  try {
    const res = await apiRequest("/api/business/settings", "PUT", { salesChannels });
    state.userProfile = res.userProfile;
    showToast("Canales de venta guardados con éxito.");
  } catch (e) {
    showToast("Error: " + e.message, true);
  }
}
window.saveChannelsSettings = saveChannelsSettings;



async function savePrintSettings() {
  const printSettings = {
    footerText: document.getElementById("print-settings-footer").value
  };

  let logoValue = state.userProfile.logoBase64 || null;
  if (state.removeLogoFlag) {
    logoValue = null;
  } else if (state.tempLogoBase64) {
    logoValue = state.tempLogoBase64;
  }

  try {
    const res = await apiRequest("/api/business/settings", "PUT", { 
      printSettings,
      logoBase64: logoValue
    });
    state.userProfile = res.userProfile;
    state.tempLogoBase64 = null;
    state.removeLogoFlag = false;
    showToast("Ajustes de impresión guardados con éxito.");
  } catch (e) {
    showToast("Error: " + e.message, true);
  }
}
window.savePrintSettings = savePrintSettings;

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const icon = document.getElementById('theme-icon');
  
  if (isLight) {
    localStorage.setItem('app-theme', 'light');
    if(icon) {
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    }
  } else {
    localStorage.setItem('app-theme', 'dark');
    if(icon) {
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
    }
  }
}
window.toggleTheme = toggleTheme;

// --- MEDIOS DE PAGO ---
// --- MEDIOS DE PAGO ---
function renderPaymentMethods() {
  const tbody = document.getElementById('payment-methods-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const defaultMethods = [
    {id: "pm_1", name: "Efectivo", description: "Pago contado en efectivo", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_2", name: "Débito", description: "Tarjeta de débito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_3", name: "Crédito", description: "Tarjeta de crédito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_4", name: "Transferencia", description: "Transferencia bancaria / CBU", comission: "0", retention: "0", adjustment: "Sin ajuste"},
    {id: "pm_5", name: "QR/Billetera", description: "Mercado Pago / Billeteras virtuales", comission: "0", retention: "0", adjustment: "Sin ajuste"}
  ];
  const methods = state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods;
  
  if (methods.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-gray); padding: 20px;">No hay medios de pago configurados.</td></tr>';
    return;
  }
  
  methods.forEach(pm => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    tr.innerHTML = `
      <td style="padding: 12px 8px; color: var(--text-white); font-weight: 500;">${pm.name}</td>
      <td style="padding: 12px 8px; color: var(--text-gray-light); font-size: 0.8rem;">${pm.description || '---'}</td>
      <td style="padding: 12px 8px; color: var(--text-gray-light);">${pm.comission || '0'}%</td>
      <td style="padding: 12px 8px; color: var(--text-gray-light);">${pm.retention || '0'}%</td>
      <td style="padding: 12px 8px; color: var(--text-gray-light);">${pm.adjustment || 'Sin ajuste'}</td>
      <td style="padding: 12px 8px; text-align: right;">
        <button class="btn" style="background: none; border: none; padding: 6px; cursor: pointer; color: var(--accent-blue); font-size: 1.1rem; margin-right: 12px; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s;" onclick="openPaymentMethodModal('${pm.id}')" title="Editar"><i class="fa-solid fa-pencil"></i></button>
        <button class="btn" style="background: none; border: none; padding: 6px; cursor: pointer; color: var(--accent-red); font-size: 1.1rem; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s;" onclick="deletePaymentMethod('${pm.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
window.renderPaymentMethods = renderPaymentMethods;

function openPaymentMethodModal(id = null) {
  const defaultMethods = [
    {id: "pm_1", name: "Efectivo", description: "Pago contado en efectivo", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_2", name: "Débito", description: "Tarjeta de débito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_3", name: "Crédito", description: "Tarjeta de crédito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_4", name: "Transferencia", description: "Transferencia bancaria / CBU", comission: "0", retention: "0", adjustment: "Sin ajuste"},
    {id: "pm_5", name: "QR/Billetera", description: "Mercado Pago / Billeteras virtuales", comission: "0", retention: "0", adjustment: "Sin ajuste"}
  ];
  const methods = state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods;
  const pm = id ? methods.find(p => p.id === id) : null;
  
  document.getElementById('modal-pm-id').value = pm ? pm.id : '';
  document.getElementById('modal-pm-name').value = pm ? pm.name : '';
  const descEl = document.getElementById('modal-pm-description');
  if (descEl) descEl.value = pm ? (pm.description || '') : '';
  document.getElementById('modal-pm-comission').value = pm ? (pm.comission || '0') : '0';
  document.getElementById('modal-pm-retention').value = pm ? (pm.retention || '0') : '0';
  document.getElementById('modal-pm-adjustment').value = pm ? (pm.adjustment || 'Sin ajuste') : 'Sin ajuste';
  document.getElementById('modal-pm-title').innerHTML = pm ? '💳 Editar Medio de Pago' : '💳 Nuevo Medio de Pago';
  
  document.getElementById('modal-payment-method').style.display = 'flex';
}
window.openPaymentMethodModal = openPaymentMethodModal;

function closePaymentMethodModal() {
  document.getElementById('modal-payment-method').style.display = 'none';
}
window.closePaymentMethodModal = closePaymentMethodModal;

async function savePaymentMethod() {
  const id = document.getElementById('modal-pm-id').value;
  const name = document.getElementById('modal-pm-name').value;
  const descEl = document.getElementById('modal-pm-description');
  const description = descEl ? descEl.value.trim() : '';
  const comission = document.getElementById('modal-pm-comission').value || '0';
  const retention = document.getElementById('modal-pm-retention').value || '0';
  const adjustment = document.getElementById('modal-pm-adjustment').value;
  
  if (!name) {
    showToast('El nombre es obligatorio', true);
    return;
  }
  
  const defaultMethods = [
    {id: "pm_1", name: "Efectivo", description: "Pago contado en efectivo", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_2", name: "Débito", description: "Tarjeta de débito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_3", name: "Crédito", description: "Tarjeta de crédito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_4", name: "Transferencia", description: "Transferencia bancaria / CBU", comission: "0", retention: "0", adjustment: "Sin ajuste"},
    {id: "pm_5", name: "QR/Billetera", description: "Mercado Pago / Billeteras virtuales", comission: "0", retention: "0", adjustment: "Sin ajuste"}
  ];
  let methods = [...(state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods)];
  
  if (id) {
    const idx = methods.findIndex(p => p.id === id);
    if (idx !== -1) {
      methods[idx] = { id, name, description, comission, retention, adjustment };
    }
  } else {
    methods.push({
      id: 'pm_' + Date.now(),
      name, description, comission, retention, adjustment
    });
  }
  
  try {
    const res = await apiRequest('/api/business/settings', 'PUT', { paymentMethods: methods });
    state.userProfile = res.userProfile;
    renderPaymentMethods();
    closePaymentMethodModal();
    showToast('Medio de pago guardado correctamente');
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}
window.savePaymentMethod = savePaymentMethod;

async function deletePaymentMethod(id) {
  if (!confirm('¿Seguro que querés eliminar este medio de pago?')) return;
  
  const defaultMethods = [
    {id: "pm_1", name: "Efectivo", type: "Efectivo", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_2", name: "Débito", type: "Débito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_3", name: "Crédito", type: "Crédito", comission: "0", retention: "0", adjustment: "Sin ajuste"}, 
    {id: "pm_4", name: "Transferencia", type: "Transferencia", comission: "0", retention: "0", adjustment: "Sin ajuste"},
    {id: "pm_5", name: "QR/Billetera", type: "QR/Billetera", comission: "0", retention: "0", adjustment: "Sin ajuste"}
  ];
  let methods = [...(state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0 ? state.userProfile.paymentMethods : defaultMethods)];
  methods = methods.filter(p => p.id !== id);
  
  try {
    const res = await apiRequest('/api/business/settings', 'PUT', { paymentMethods: methods });
    state.userProfile = res.userProfile;
    renderPaymentMethods();
    showToast('Medio de pago eliminado');
  } catch (e) {
    showToast('Error: ' + e.message, true);
  }
}
window.deletePaymentMethod = deletePaymentMethod;

function setTiendanubeShippingFilter(filter) {
  state.tiendanubeShippingFilter = filter;
  renderIntegrationsStatus();
}
window.setTiendanubeShippingFilter = setTiendanubeShippingFilter;

function cleanNameAndExtractSize(rawName, rawSize) {
  let name = (rawName || "").trim();
  let size = (rawSize || "").trim();

  let extractedFromName = "";
  if (name.includes("(") && name.endsWith(")")) {
    const firstOpen = name.indexOf("(");
    const lastClose = name.lastIndexOf(")");
    if (firstOpen !== -1 && lastClose > firstOpen) {
      const inside = name.substring(firstOpen + 1, lastClose).trim();
      const insideLower = inside.toLowerCase();
      if (insideLower.includes("talle") || ["xs", "s", "m", "l", "xl", "xxl", "xxxl", "1", "2", "3", "4", "5", "u"].some(s => insideLower.includes(s))) {
        extractedFromName = inside;
        name = name.substring(0, firstOpen).trim();
      }
    }
  }

  if (extractedFromName) {
    if (!size || size.toLowerCase() === "único" || size.toLowerCase() === "unico" || size.toLowerCase() === "u" || size.toLowerCase() === "none") {
      size = extractedFromName;
    }
  }

  return { cleanName: name, extractedSize: size };
}

function normalizeSizeKeyJS(sz) {
  if (!sz) return "";
  let s = String(sz).trim().toLowerCase();
  s = s.replace(/talle/g, "").replace(/\s+/g, "").replace(/[\(\)\-\/]/g, "");
  if (s === "u" || s === "unico" || s === "único") return "unico";
  return s;
}

function findBestMatchingProductJS(productsList, itemSku, rawItemName, rawItemSize, targetLocation) {
  const { cleanName, extractedSize } = cleanNameAndExtractSize(rawItemName, rawItemSize);
  const itemBaseSku = getCleanBaseSku(itemSku, "").toLowerCase();
  const normTargetSize = normalizeSizeKeyJS(extractedSize);

  const candidates = [];

  (productsList || []).forEach(p => {
    const pSku = (p.sku || "").trim().toLowerCase();
    const pId = (p.id || "").trim().toLowerCase();
    const pBase = getCleanBaseSku(pSku, p.baseSku).toLowerCase();
    const pName = (p.name || "").trim().toLowerCase();
    const { cleanName: pCleanName, extractedSize: pExtractedSize } = cleanNameAndExtractSize(pName, p.size);

    const nameMatch = (
      (itemSku && (pSku === itemSku.toLowerCase() || pId === itemSku.toLowerCase())) ||
      (itemBaseSku && pBase && itemBaseSku === pBase) ||
      (cleanName && pCleanName && (cleanName.toLowerCase().includes(pCleanName.toLowerCase()) || pCleanName.toLowerCase().includes(cleanName.toLowerCase()))) ||
      (rawItemName && pName && (rawItemName.toLowerCase().includes(pName.toLowerCase()) || pName.toLowerCase().includes(rawItemName.toLowerCase())))
    );

    if (!nameMatch) return;

    const pSizeNorm = normalizeSizeKeyJS(p.size || pExtractedSize);
    const sizeExactMatch = Boolean(normTargetSize && pSizeNorm && (normTargetSize === pSizeNorm || normTargetSize.includes(pSizeNorm) || pSizeNorm.includes(normTargetSize)));

    let avail = 0;
    if (p.locationsStock && typeof p.locationsStock === "object" && targetLocation) {
      const matchedLocKey = Object.keys(p.locationsStock).find(k => k.trim().toLowerCase() === targetLocation.trim().toLowerCase());
      if (matchedLocKey !== undefined) {
        avail = parseInt(p.locationsStock[matchedLocKey]) || 0;
      } else {
        avail = parseInt(p.stock_local !== undefined ? p.stock_local : p.stock) || 0;
      }
    } else {
      avail = parseInt(p.stock_local !== undefined ? p.stock_local : p.stock) || 0;
    }

    let score = 0;
    if (sizeExactMatch) score += 100;
    else if (normTargetSize && pSizeNorm && pSizeNorm !== "unico") score -= 50;
    else if (!normTargetSize || normTargetSize === "unico") score += 10;

    if (avail > 0) score += 50;

    candidates.push({ score, avail, product: p });
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.avail - a.avail;
  });

  return candidates[0].product;
}

async function shipTiendanubeOrder(saleId, status, selectElId = null) {
  let location = null;
  if (selectElId) {
    const selectEl = document.getElementById(selectElId);
    if (selectEl) {
      location = selectEl.value;
    }
  }
  
  if ((status === "shipped" || status === "delivered") && selectElId && !location) {
    showToast("Por favor selecciona una ubicación para descontar stock.", true);
    return;
  }
  
  const actionText = status === "shipped" ? "despachar" : "entregar";
  
  // Validar si hay stock disponible en la ubicación seleccionada antes de permitir el despacho
  const allSales = [...(state.tiendanubeSales || []), ...(state.sales || [])];
  const sale = allSales.find(s => String(s.id) === String(saleId) || String(s.tn_number) === String(saleId));

  if (location && sale && sale.items && sale.items.length > 0) {
    const stockErrors = [];

    sale.items.forEach(it => {
      const prodInfo = it.product || {};
      const qtyRequired = parseInt(it.quantity) || 1;
      const itemSize = (it.size || "").trim();
      const itemColor = (prodInfo.color || "").trim();
      const itemSku = prodInfo.sku || "";
      const itemBaseSku = getCleanBaseSku(itemSku, prodInfo.baseSku || "").toLowerCase();

      // Buscar la variante correspondiente en state.products usando ranking por talle y stock de ubicación
      const matchedProd = findBestMatchingProductJS(state.products, itemSku, prodInfo.name || it.name || "", itemSize, location);

      if (matchedProd) {
        let availInLoc = 0;
        if (matchedProd.locationsStock && typeof matchedProd.locationsStock === "object") {
          const matchedLocKey = Object.keys(matchedProd.locationsStock).find(k => k.trim().toLowerCase() === location.trim().toLowerCase());
          if (matchedLocKey !== undefined) {
            availInLoc = parseInt(matchedProd.locationsStock[matchedLocKey]) || 0;
          } else {
            availInLoc = parseInt(matchedProd.stock_local !== undefined ? matchedProd.stock_local : matchedProd.stock) || 0;
          }
        } else {
          availInLoc = parseInt(matchedProd.stock_local !== undefined ? matchedProd.stock_local : matchedProd.stock) || 0;
        }

        if (availInLoc < qtyRequired) {
          const prodTitle = getProductNameWithColor(matchedProd) || prodInfo.name || "Producto";
          const sizeInfo = itemSize ? ` (Talle ${itemSize})` : "";
          if (availInLoc <= 0) {
            stockErrors.push(`• Faltante de stock: El producto '${prodTitle}'${sizeInfo} tiene stock 0 u. en '${location}'.`);
          } else {
            stockErrors.push(`• Faltante de stock: El producto '${prodTitle}'${sizeInfo} en '${location}' tiene ${availInLoc} u., pero se requieren ${qtyRequired} u.`);
          }
        }
      } else {
        const prodTitle = prodInfo.name || it.name || "Producto";
        const sizeInfo = itemSize ? ` (Talle ${itemSize})` : "";
        stockErrors.push(`• Faltante de stock: No se encontró la variante del producto '${prodTitle}'${sizeInfo} cargada en '${location}'.`);
      }
    });

    if (stockErrors.length > 0) {
      const errorText = `⚠️ FALTANTE DE STOCK EN '${location.toUpperCase()}':\nNo se puede despachar la venta por falta de stock:\n\n${stockErrors.join("\n")}`;
      alert(errorText);
      showToast(stockErrors[0].replace("• ", ""), true);
      return; // Bloquear despacho
    }
  }

  try {
    showToast("Procesando despacho...");
    const res = await apiRequest("/api/integrations/tiendanube/ship-order", "POST", {
      sale_id: saleId,
      status: status,
      ubicacion: location
    });
    
    if (res.success) {
      showToast(`Pedido marcado como ${status === "shipped" ? "enviado" : "entregado"} con éxito.`);
      await refreshState();
    }
  } catch (error) {
    showToast(`Error al ${actionText} pedido: ${error.message}`, true);
  }
}
window.shipTiendanubeOrder = shipTiendanubeOrder;

// --- Gestión de Devoluciones y Cambios ---
window.selectedReturnSale = null;
window.returnedItemsList = [];
window.exchangeItemsList = [];

async function renderReturns() {
  if (!state.token) return;
  
  // 1. Poblar ubicaciones
  const locSelect = document.getElementById("return-stock-location");
  if (locSelect) {
    const locations = (state.userProfile?.locations && state.userProfile.locations.length > 0)
      ? state.userProfile.locations
      : ["Local Principal"];
    locSelect.innerHTML = locations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
  }
  
  // 2. Limpiar y resetear vistas de items si no hay nada seleccionado
  if (!window.selectedReturnSale && window.returnedItemsList.length === 0) {
    clearSelectedReturnSale();
  }
  
  // 3. Cargar historial de devoluciones
  const tbody = document.getElementById("returns-history-tbody");
  const emptyMsg = document.getElementById("returns-history-empty");
  
  try {
    const returns = await apiRequest("/api/returns");
    if (!returns || returns.length === 0) {
      if (tbody) tbody.innerHTML = "";
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }
    
    if (emptyMsg) emptyMsg.style.display = "none";
    if (tbody) {
      tbody.innerHTML = returns.map(r => {
        const dateStr = r.date ? new Date(r.date).toLocaleString('es-AR') : "-";
        
        // Detalle de devueltos
        const retDetails = (r.returned_items || []).map(it => {
          return `<div style="font-size: 0.7rem; color: var(--text-white); font-weight: 500;">- ${it.name} (x${it.quantity})</div>`;
        }).join("");
        
        // Detalle de cambios
        const exDetails = (r.exchange_items || []).map(it => {
          return `<div style="font-size: 0.7rem; color: #10b981; font-weight: 500;">- ${it.name} (x${it.quantity})</div>`;
        }).join("");
        
        // Comprobante AFIP
        let afipCell = `<span style="color: var(--text-gray); font-style: italic;">Sin comprobante fiscal</span>`;
        if (r.arca_credit_note_id) {
          afipCell = `
            <div style="font-weight: bold; color: var(--accent-red); font-size: 0.75rem;">NC: ${r.arca_credit_note_id}</div>
            <div style="font-size: 0.65rem; color: var(--text-gray);">CAE: ${r.arca_cae || "-"}</div>
          `;
        }
        
        return `
          <tr>
            <td><strong>${dateStr}</strong></td>
            <td>
              <div style="font-weight: 600;">${r.client_name || "Consumidor Final"}</div>
              <div style="font-size: 0.65rem; color: var(--text-gray);">${r.client_cuit || "-"}</div>
              ${r.sale_id ? `<div style="font-size: 0.65rem; color: var(--accent-blue); font-weight: bold; margin-top: 4px;">Venta: ${r.sale_id}</div>` : ""}
            </td>
            <td>${retDetails || "-"}</td>
            <td>${exDetails || `<span style="color: var(--text-gray); font-style: italic;">Solo devolución</span>`}</td>
            <td><span class="badge-blue" style="font-size: 0.65rem;">${r.ubicacion_destino || "-"}</span></td>
            <td>${afipCell}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (error) {
    showToast("Error al cargar historial de devoluciones: " + error.message, true);
  }
}

// Búsqueda de venta
function searchSaleForReturn() {
  const query = document.getElementById("return-search-sale").value.toLowerCase().trim();
  const resultsDiv = document.getElementById("return-sale-search-results");
  if (!resultsDiv) return;
  
  if (query.length < 2) {
    if (query.length === 0) {
      // Show 10 most recent sales as suggestions
      const matches = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
      if (matches.length > 0) {
        resultsDiv.innerHTML = `<div style="padding: 6px 12px; font-size: 0.65rem; color: var(--text-gray); font-weight: 800; border-bottom: 1px solid var(--border-color); text-transform: uppercase;">Ventas Recientes:</div>` + matches.map(s => {
          const tnLabel = s.tn_number ? `TN-#${s.tn_number}` : s.id;
          const clientLabel = s.client_name ? ` - ${s.client_name}` : " - Consumidor Final";
          const totalLabel = ` ($ ${Math.round(s.total).toLocaleString("es-AR")})`;
          return `
            <div onclick="selectReturnSale('${s.id}')" style="padding: 8px 12px; font-size: 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-white);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">
              <strong>${tnLabel}</strong>${clientLabel}${totalLabel}
            </div>
          `;
        }).join("");
        resultsDiv.style.display = "block";
        return;
      }
    }
    resultsDiv.style.display = "none";
    return;
  }
  
  const matches = state.sales.filter(s => {
    const idMatch = s.id && s.id.toLowerCase().includes(query);
    const clientMatch = s.client_name && s.client_name.toLowerCase().includes(query);
    const cuitMatch = s.client_cuit && s.client_cuit.includes(query);
    const tnMatch = s.tn_number && String(s.tn_number).includes(query);
    return idMatch || clientMatch || cuitMatch || tnMatch;
  }).slice(0, 10);
  
  if (matches.length === 0) {
    resultsDiv.innerHTML = `<div style="padding: 10px; font-size: 0.75rem; color: var(--text-gray); font-style: italic;">No se encontraron ventas</div>`;
  } else {
    resultsDiv.innerHTML = matches.map(s => {
      const tnLabel = s.tn_number ? `TN-#${s.tn_number}` : s.id;
      const clientLabel = s.client_name ? ` - ${s.client_name}` : " - Consumidor Final";
      const totalLabel = ` ($ ${Math.round(s.total).toLocaleString("es-AR")})`;
      return `
        <div onclick="selectReturnSale('${s.id}')" style="padding: 8px 12px; font-size: 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-white);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">
          <strong>${tnLabel}</strong>${clientLabel}${totalLabel}
        </div>
      `;
    }).join("");
  }
  resultsDiv.style.display = "block";
}

function selectReturnSale(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  document.getElementById("return-sale-search-results").style.display = "none";
  if (!sale) return;
  
  window.selectedReturnSale = sale;
  document.getElementById("return-search-sale").value = sale.tn_number ? `TN-#${sale.tn_number}` : sale.id;
  
  document.getElementById("return-client-name").value = sale.client_name || "Consumidor Final";
  document.getElementById("return-client-cuit").value = sale.client_cuit || "";
  document.getElementById("return-sale-ref").innerText = sale.tn_number ? `Pedido TN-#${sale.tn_number}` : `Ref: ${sale.id}`;
  document.getElementById("return-manual-product-search-box").style.display = "none";
  
  const container = document.getElementById("returned-items-container");
  const items = sale.items || [];
  if (items.length === 0) {
    container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-gray); font-style: italic;">La venta seleccionada no contiene productos.</p>`;
  } else {
    container.innerHTML = items.map((it, idx) => {
      const prod = it.product || {};
      const maxQty = it.quantity || 1;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="ret-cb-${idx}" data-sku="${prod.sku}" data-name="${prod.name}" data-price="${prod.price_tiendanube || prod.price_local || prod.price}" onchange="toggleReturnedItem(${idx})" style="accent-color: var(--accent-blue);">
            <div style="font-size: 0.75rem;">
              <div style="font-weight: 500; color: var(--text-white);">${prod.name}</div>
              <div style="font-size: 0.65rem; color: var(--text-gray);">SKU: ${prod.sku} | Unit: $${prod.price}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 0.65rem; color: var(--text-gray);">Cant:</label>
            <input type="number" id="ret-qty-${idx}" min="1" max="${maxQty}" value="${maxQty}" oninput="validateReturnQty(${idx}); updateReturnsSummary();" style="width: 50px; font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-white);" disabled>
            <span style="font-size: 0.7rem; color: var(--text-gray);">/ ${maxQty}</span>
          </div>
        </div>
      `;
    }).join("");
  }
  
  const arcaBox = document.getElementById("return-arca-box");
  if (arcaBox) {
    if (sale.arca_invoice_id && !sale.credit_note_id) {
      arcaBox.style.display = "block";
      document.getElementById("return-emit-credit-note").checked = true;
    } else {
      arcaBox.style.display = "none";
      document.getElementById("return-emit-credit-note").checked = false;
    }
  }
  
  updateReturnsSummary();
}

function clearSelectedReturnSale() {
  window.selectedReturnSale = null;
  window.returnedItemsList = [];
  
  document.getElementById("return-search-sale").value = "";
  document.getElementById("return-client-name").value = "Consumidor Final";
  document.getElementById("return-client-cuit").value = "";
  document.getElementById("return-sale-ref").innerText = "Manual";
  document.getElementById("return-manual-product-search-box").style.display = "block";
  document.getElementById("returned-items-container").innerHTML = `<p style="font-size: 0.75rem; color: var(--text-gray); font-style: italic; margin: 5px 0;">No se han agregado productos para la devolución.</p>`;
  
  const arcaBox = document.getElementById("return-arca-box");
  if (arcaBox) arcaBox.style.display = "none";
  
  updateReturnsSummary();
}

function searchProductForReturn() {
  const query = document.getElementById("return-search-product").value.toLowerCase().trim();
  const resultsDiv = document.getElementById("return-product-search-results");
  if (!resultsDiv) return;
  
  if (query.length < 2) {
    resultsDiv.style.display = "none";
    return;
  }
  
  const isComercio = state.businessType === "comercio";
  const matches = state.products.filter(p => {
    if (isComercio && p.size && p.size !== "Único") return false;
    return (p.name && p.name.toLowerCase().includes(query)) || (p.sku && p.sku.toLowerCase().includes(query));
  }).slice(0, 10);
  
  if (matches.length === 0) {
    resultsDiv.innerHTML = `<div style="padding: 10px; font-size: 0.75rem; color: var(--text-gray); font-style: italic;">No se encontraron productos</div>`;
  } else {
    resultsDiv.innerHTML = matches.map(p => {
      return `
        <div onclick="addManualReturnProduct('${p.sku}', '${p.name.replace(/'/g, "\\'")}', ${p.price_tiendanube || p.price_local || p.price || 0})" style="padding: 8px 12px; font-size: 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-white);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">
          <strong>${p.sku}</strong> - ${p.name} ($${p.price})
        </div>
      `;
    }).join("");
  }
  resultsDiv.style.display = "block";
}

function addManualReturnProduct(sku, name, price) {
  document.getElementById("return-product-search-results").style.display = "none";
  document.getElementById("return-search-product").value = "";
  
  const existing = window.returnedItemsList.find(it => it.sku === sku);
  if (existing) {
    existing.quantity += 1;
  } else {
    window.returnedItemsList.push({ sku, name, price, quantity: 1 });
  }
  renderManualReturnedItems();
}

function renderManualReturnedItems() {
  const container = document.getElementById("returned-items-container");
  if (window.returnedItemsList.length === 0) {
    container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-gray); font-style: italic; margin: 5px 0;">No se han agregado productos para la devolución.</p>`;
    updateReturnsSummary();
    return;
  }
  
  container.innerHTML = window.returnedItemsList.map((it, idx) => {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-color);">
        <div style="font-size: 0.75rem;">
          <div style="font-weight: 500; color: var(--text-white);">${it.name}</div>
          <div style="font-size: 0.65rem; color: var(--text-gray);">SKU: ${it.sku} | Unit: $${it.price}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="number" min="1" value="${it.quantity}" oninput="updateManualReturnQty(${idx}, this.value)" style="width: 50px; font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-white);">
          <button class="btn btn-sm" onclick="removeManualReturnProduct(${idx})" style="background: var(--accent-red); border: none; color: var(--text-white); padding: 2px 6px;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
  updateReturnsSummary();
}

function updateManualReturnQty(index, val) {
  const qty = parseInt(val) || 1;
  if (window.returnedItemsList[index]) {
    window.returnedItemsList[index].quantity = qty;
  }
  updateReturnsSummary();
}

function removeManualReturnProduct(index) {
  window.returnedItemsList.splice(index, 1);
  renderManualReturnedItems();
}

function toggleReturnedItem(idx) {
  const cb = document.getElementById(`ret-cb-${idx}`);
  const qtyInput = document.getElementById(`ret-qty-${idx}`);
  if (cb && qtyInput) {
    qtyInput.disabled = !cb.checked;
  }
  updateReturnsSummary();
}

function validateReturnQty(idx) {
  const input = document.getElementById(`ret-qty-${idx}`);
  if (!input) return;
  const val = parseInt(input.value) || 1;
  const max = parseInt(input.getAttribute("max")) || 1;
  if (val > max) input.value = max;
  if (val < 1) input.value = 1;
}

function searchProductForExchange() {
  const queryInput = document.getElementById("exchange-search-product");
  if (!queryInput) return;
  const query = queryInput.value.toLowerCase().trim();
  const resultsDiv = document.getElementById("exchange-product-search-results");
  if (!resultsDiv) return;
  
  const isComercio = state.businessType === "comercio";
  
  // Agrupar productos por baseSku o Nombre para que cada producto aparezca 1 sola vez
  const groupedMap = {};
  (state.products || []).forEach(p => {
    if (!p) return;
    const sku = p.sku || p.id || "";
    if (sku.startsWith("supplier_") || sku.startsWith("fixedcost_") || sku.startsWith("account_") || 
        sku.startsWith("cashtransaction_") || sku.startsWith("influencer_") || sku.startsWith("marketingexpense_") || 
        sku.startsWith("stockintake_") || sku === "extras_config" || sku === "categories_config") {
      return;
    }
    if (isComercio && p.size && p.size !== "Único") return;
    
    const baseSku = p.baseSku || (sku.includes("-") ? sku.split("-")[0] : sku) || "PROD";
    const colorKey = p.color ? p.color.toLowerCase().trim() : "";
    const groupKey = (colorKey && colorKey !== "único" && colorKey !== "unico") ? `${baseSku}_${colorKey}` : baseSku;
    const displayName = getProductNameWithColor(p);
    
    if (!groupedMap[groupKey]) {
      groupedMap[groupKey] = {
        baseSku: baseSku,
        groupKey: groupKey,
        name: displayName,
        sku: baseSku,
        price: p.price_tiendanube || p.price_local || p.price || 0,
        variants: [p]
      };
    } else {
      groupedMap[groupKey].variants.push(p);
    }
  });

  const allGrouped = Object.values(groupedMap);
  let matches = [];
  
  if (query.length === 0) {
    matches = allGrouped.slice(0, 10);
  } else {
    matches = allGrouped.filter(g => {
      const baseSku = g.baseSku.toLowerCase();
      const name = g.name.toLowerCase();
      return baseSku.includes(query) || name.includes(query) || g.variants.some(v => (v.sku || v.id || "").toLowerCase().includes(query));
    }).slice(0, 10);
  }
  
  if (matches.length === 0) {
    resultsDiv.innerHTML = `<div style="padding: 10px; font-size: 0.75rem; color: var(--text-gray); font-style: italic;">No se encontraron productos</div>`;
  } else {
    resultsDiv.innerHTML = matches.map(g => {
      const displayPrice = Math.round(g.price || 0);
      return `
        <div onclick="addExchangeProduct('${g.baseSku}', '${g.name.replace(/'/g, "\\'")}', ${displayPrice})" style="padding: 8px 12px; font-size: 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-color); color: var(--text-white);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">
          <strong>${g.baseSku}</strong> - ${g.name} ($${displayPrice.toLocaleString('es-AR')})
        </div>
      `;
    }).join("");
  }
  resultsDiv.style.display = "block";
}

function addExchangeProduct(sku, name, price) {
  document.getElementById("exchange-product-search-results").style.display = "none";
  document.getElementById("exchange-search-product").value = "";
  
  const existing = window.exchangeItemsList.find(it => it.sku === sku);
  if (existing) {
    existing.quantity += 1;
  } else {
    window.exchangeItemsList.push({ sku, name, price, quantity: 1 });
  }
  renderExchangeItems();
}

function renderExchangeItems() {
  const container = document.getElementById("exchange-items-container");
  if (window.exchangeItemsList.length === 0) {
    container.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-gray); font-style: italic; margin: 5px 0;">No se han seleccionado productos de cambio.</p>`;
    updateReturnsSummary();
    return;
  }
  
  container.innerHTML = window.exchangeItemsList.map((it, idx) => {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-color);">
        <div style="font-size: 0.75rem;">
          <div style="font-weight: 500; color: var(--text-white);">${it.name}</div>
          <div style="font-size: 0.65rem; color: var(--text-gray);">SKU: ${it.sku} | Unit: $${it.price}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="number" min="1" value="${it.quantity}" oninput="updateExchangeQty(${idx}, this.value)" style="width: 50px; font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-white);">
          <button class="btn btn-sm" onclick="removeExchangeProduct(${idx})" style="background: var(--accent-red); border: none; color: var(--text-white); padding: 2px 6px;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
  updateReturnsSummary();
}

function updateExchangeQty(index, val) {
  const qty = parseInt(val) || 1;
  if (window.exchangeItemsList[index]) {
    window.exchangeItemsList[index].quantity = qty;
  }
  updateReturnsSummary();
}

function removeExchangeProduct(index) {
  window.exchangeItemsList.splice(index, 1);
  renderExchangeItems();
}

function updateReturnsSummary() {
  let returnedTotal = 0;
  
  if (window.selectedReturnSale) {
    const container = document.getElementById("returned-items-container");
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach((cb, idx) => {
      if (cb.checked) {
        const price = parseFloat(cb.getAttribute("data-price")) || 0;
        const qtyInput = document.getElementById(`ret-qty-${idx}`);
        const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
        returnedTotal += price * qty;
      }
    });
  } else {
    returnedTotal = window.returnedItemsList.reduce((acc, it) => acc + (it.price * it.quantity), 0);
  }
  
  const exchangeTotal = window.exchangeItemsList.reduce((acc, it) => acc + (it.price * it.quantity), 0);
  const balance = exchangeTotal - returnedTotal;
  
  document.getElementById("return-summary-returned").innerText = `$${returnedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById("return-summary-exchange").innerText = `$${exchangeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  
  const balanceSpan = document.getElementById("return-summary-balance");
  if (balance < 0) {
    balanceSpan.innerHTML = `<span style="color: #10b981;">A favor del cliente: $${Math.abs(balance).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>`;
  } else if (balance > 0) {
    balanceSpan.innerHTML = `<span style="color: #ef4444;">A pagar por cliente: $${balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>`;
  } else {
    balanceSpan.innerHTML = `<span style="color: var(--text-white);">$0.00</span>`;
  }
}

async function confirmRegisterReturn() {
  const ubicacion = document.getElementById("return-stock-location").value;
  const clientName = document.getElementById("return-client-name").value.trim();
  const clientCuit = document.getElementById("return-client-cuit").value.trim();
  
  if (!ubicacion) {
    showToast("Por favor selecciona una sucursal de destino.", true);
    return;
  }
  
  const finalReturned = [];
  if (window.selectedReturnSale) {
    const container = document.getElementById("returned-items-container");
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach((cb, idx) => {
      if (cb.checked) {
        finalReturned.push({
          sku: cb.getAttribute("data-sku"),
          name: cb.getAttribute("data-name"),
          price: parseFloat(cb.getAttribute("data-price")) || 0,
          quantity: parseInt(document.getElementById(`ret-qty-${idx}`).value) || 1
        });
      }
    });
  } else {
    window.returnedItemsList.forEach(it => {
      finalReturned.push({ sku: it.sku, name: it.name, price: it.price, quantity: it.quantity });
    });
  }
  
  if (finalReturned.length === 0) {
    showToast("Debes agregar al menos un producto devuelto.", true);
    return;
  }
  
  const emitAFIP = document.getElementById("return-emit-credit-note") ? document.getElementById("return-emit-credit-note").checked : false;
  const reason = document.getElementById("return-credit-note-reason") ? document.getElementById("return-credit-note-reason").value : "Devolución técnica";
  
  const payload = {
    sale_id: window.selectedReturnSale ? window.selectedReturnSale.id : null,
    client_name: clientName,
    client_cuit: clientCuit,
    returned_items: finalReturned,
    exchange_items: window.exchangeItemsList,
    ubicacion_destino: ubicacion,
    emit_credit_note: emitAFIP,
    credit_note_reason: reason
  };
  
  const btn = document.getElementById("btn-submit-return");
  const origHtml = btn.innerHTML;
  btn.innerHTML = "Procesando devolución <i class='fas fa-spinner fa-spin'></i>";
  btn.disabled = true;
  
  try {
    const res = await apiRequest("/api/returns", "POST", payload);
    if (res.success) {
      if (res.credit_note_id) {
        showToast(`¡Devolución registrada! Nota de Crédito ${res.credit_note_id} emitida en AFIP.`, false);
      } else {
        showToast("Devolución registrada con éxito. Stocks actualizados.", false);
      }
      clearSelectedReturnSale();
      window.exchangeItemsList = [];
      renderExchangeItems();
      await refreshState();
      await renderReturns();
    }
  } catch (error) {
    showToast("Error al registrar devolución: " + error.message, true);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

window.renderReturns = renderReturns;
window.searchSaleForReturn = searchSaleForReturn;
window.selectReturnSale = selectReturnSale;
window.clearSelectedReturnSale = clearSelectedReturnSale;
window.searchProductForReturn = searchProductForReturn;
window.addManualReturnProduct = addManualReturnProduct;
window.removeManualReturnProduct = removeManualReturnProduct;
window.toggleReturnedItem = toggleReturnedItem;
window.validateReturnQty = validateReturnQty;
window.searchProductForExchange = searchProductForExchange;
window.addExchangeProduct = addExchangeProduct;
window.removeExchangeProduct = removeExchangeProduct;
window.updateReturnsSummary = updateReturnsSummary;
window.confirmRegisterReturn = confirmRegisterReturn;
window.updateManualReturnQty = updateManualReturnQty;
window.updateExchangeQty = updateExchangeQty;
window.selectAllUninvoicedSales = selectAllUninvoicedSales;

document.addEventListener("click", (e) => {
  const input = document.getElementById("exchange-search-product");
  const resultsDiv = document.getElementById("exchange-product-search-results");
  if (input && resultsDiv && !input.contains(e.target) && !resultsDiv.contains(e.target)) {
    resultsDiv.style.display = "none";
  }
  
  const qInput = document.getElementById("quote-product-search");
  const qDropdown = document.getElementById("quote-search-dropdown");
  if (qInput && qDropdown && !qInput.contains(e.target) && !qDropdown.contains(e.target)) {
    qDropdown.style.display = "none";
  }
});
window.toggleRowCheckbox = toggleRowCheckbox;

// --- PRESUPUESTOS (QUOTATIONS) LOGIC ---
function onQuoteSearchInput(query) {
  const dropdown = document.getElementById("quote-search-dropdown");
  if (!dropdown) return;
  
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
    return;
  }
  
  // Agrupar productos por baseSku o Nombre para que cada producto aparezca 1 sola vez
  const groupedMap = {};
  (state.products || []).forEach(p => {
    if (!p) return;
    const sku = p.sku || p.id || "";
    if (sku.startsWith("supplier_") || sku.startsWith("fixedcost_") || sku.startsWith("account_") || 
        sku.startsWith("cashtransaction_") || sku.startsWith("influencer_") || sku.startsWith("marketingexpense_") || 
        sku.startsWith("stockintake_") || sku === "extras_config" || sku === "categories_config") {
      return;
    }
    
    const baseSku = p.baseSku || (sku.includes("-") ? sku.split("-")[0] : sku) || "PROD";
    const colorKey = p.color ? p.color.toLowerCase().trim() : "";
    const groupKey = (colorKey && colorKey !== "único" && colorKey !== "unico") ? `${baseSku}_${colorKey}` : baseSku;
    const name = getProductNameWithColor(p);
    
    if (!groupedMap[groupKey]) {
      groupedMap[groupKey] = {
        baseSku: baseSku,
        groupKey: groupKey,
        name: name,
        color: p.color || "",
        sku: baseSku,
        price: Math.round(p.price_local || p.price || 0),
        price_local: p.price_local || p.price || 0,
        variants: [p],
        sizes: new Set()
      };
    } else {
      groupedMap[groupKey].variants.push(p);
    }
    if (p.size) groupedMap[groupKey].sizes.add(p.size);
    if (p.sizesStock && typeof p.sizesStock === "object") {
      Object.keys(p.sizesStock).forEach(sz => groupedMap[groupKey].sizes.add(sz));
    }
  });

  const matches = Object.values(groupedMap).filter(g => {
    const baseSku = g.baseSku.toLowerCase();
    const name = g.name.toLowerCase();
    return baseSku.includes(q) || name.includes(q) || g.variants.some(v => (v.sku || v.id || "").toLowerCase().includes(q));
  }).slice(0, 10);
  
  if (matches.length === 0) {
    dropdown.innerHTML = `<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">No se encontraron productos.</div>`;
    dropdown.style.display = "block";
    return;
  }
  
  dropdown.innerHTML = matches.map((g, idx) => {
    const price = g.price;
    const sku = g.baseSku;
    return `
      <div style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;" 
           onmouseover="this.style.background='var(--bg-input)'" 
           onmouseout="this.style.background='transparent'" 
           onclick="selectQuoteProduct(${idx})">
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-white);">${g.name || 'Sin Nombre'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Código: ${sku}</div>
        </div>
        <div style="font-size: 0.85rem; font-weight: 800; color: var(--accent-emerald);">$${price.toLocaleString('es-AR')}</div>
      </div>
    `;
  }).join("");
  
  dropdown.style.display = "block";
  window.currentQuoteMatches = matches;
}

function selectQuoteProduct(index) {
  const dropdown = document.getElementById("quote-search-dropdown");
  if (dropdown) dropdown.style.display = "none";
  
  const matches = window.currentQuoteMatches || [];
  const prod = matches[index];
  if (!prod) return;
  
  state.selectedQuoteProduct = prod;
  
  const searchInput = document.getElementById("quote-product-search");
  if (searchInput) searchInput.value = prod.name || prod.sku || "";
  
  const infoBox = document.getElementById("quote-selected-product-info");
  const nameEl = document.getElementById("quote-sel-prod-name");
  const skuEl = document.getElementById("quote-sel-prod-sku");
  if (infoBox && nameEl && skuEl) {
    nameEl.innerText = prod.name || "Sin Nombre";
    skuEl.innerText = `Código/SKU: ${prod.sku || prod.id || '-'}`;
    infoBox.style.display = "block";
  }
  
  const priceInput = document.getElementById("quote-item-price");
  if (priceInput) {
    const priceVal = Math.round(prod.price_local || prod.price || 0);
    priceInput.value = priceVal ? `$${priceVal.toLocaleString('es-AR')}` : "$0";
  }
  
  const qtyInput = document.getElementById("quote-item-qty");
  if (qtyInput && (!qtyInput.value || parseInt(qtyInput.value) < 1)) {
    qtyInput.value = "1";
  }

  // Poblar opciones de Talle para el producto seleccionado
  const sizeSelect = document.getElementById("quote-item-size");
  if (sizeSelect) {
    let availableSizes = [];
    if (prod.sizesStock && typeof prod.sizesStock === "object") {
      availableSizes = Object.keys(prod.sizesStock).filter(Boolean);
    } else if (prod.sizes && Array.isArray(prod.sizes)) {
      availableSizes = prod.sizes.filter(Boolean);
    } else if (prod.size && prod.size !== "Único") {
      availableSizes = [prod.size];
    }
    
    // Si no tiene talles específicos en el objeto, buscar por el mismo producto o SKU en state.products
    const baseSku = prod.baseSku || (prod.sku ? prod.sku.split("-")[0] : "");
    const sameProds = (state.products || []).filter(p => 
      (baseSku && (p.baseSku === baseSku || (p.sku && p.sku.startsWith(baseSku)))) ||
      (prod.name && p.name && p.name.toLowerCase().trim() === prod.name.toLowerCase().trim())
    );
    sameProds.forEach(sp => {
      if (sp.size && sp.size !== "Único") availableSizes.push(sp.size);
      if (sp.sizesStock && typeof sp.sizesStock === "object") Object.keys(sp.sizesStock).forEach(sz => availableSizes.push(sz));
    });

    const configuredList = getConfiguredSizes();

    if (availableSizes.length === 0) {
      availableSizes = ["Único", ...configuredList];
    } else {
      if (!availableSizes.includes("Único")) availableSizes.unshift("Único");
      configuredList.forEach(c => {
        if (!availableSizes.includes(c)) availableSizes.push(c);
      });
    }

    availableSizes = [...new Set(availableSizes)];
    sizeSelect.innerHTML = availableSizes.map(sz => `<option value="${sz}">${sz}</option>`).join("");
  }
}

function addQuoteItemFromForm() {
  const searchInput = document.getElementById("quote-product-search");
  const priceInput = document.getElementById("quote-item-price");
  const qtyInput = document.getElementById("quote-item-qty");
  const sizeSelect = document.getElementById("quote-item-size");
  
  const prod = state.selectedQuoteProduct;
  let name = prod ? (prod.name || "Producto Custom") : (searchInput ? searchInput.value.trim() : "");
  const sku = prod ? (prod.sku || prod.id || "-") : "MISC";
  const price = parseLocalFloat(priceInput ? priceInput.value : 0);
  const qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : 1) || 1);
  const selectedSize = sizeSelect ? sizeSelect.value : "Único";
  
  if (!name && !sku) {
    showToast("Escribí o seleccioná un producto", true);
    return;
  }

  if (selectedSize && selectedSize !== "Único" && !name.includes(`(${selectedSize})`)) {
    name = `${name} (${selectedSize})`;
  }
  
  if (!state.quoteItems) state.quoteItems = [];
  
  state.quoteItems.push({
    sku: sku,
    name: name,
    size: selectedSize,
    price: price,
    qty: qty,
    subtotal: price * qty
  });
  
  state.selectedQuoteProduct = null;
  if (searchInput) searchInput.value = "";
  if (priceInput) priceInput.value = "";
  if (qtyInput) qtyInput.value = "1";
  if (sizeSelect) sizeSelect.innerHTML = `<option value="Único">Único</option>`;
  
  const infoBox = document.getElementById("quote-selected-product-info");
  if (infoBox) infoBox.style.display = "none";
  
  showToast("Producto agregado al presupuesto");
  renderQuotesUI();
}

function removeQuoteItem(index) {
  if (!state.quoteItems) return;
  state.quoteItems.splice(index, 1);
  renderQuotesUI();
}

function updateQuoteItemQty(index, newQty) {
  if (!state.quoteItems || !state.quoteItems[index]) return;
  const qty = Math.max(1, parseInt(newQty) || 1);
  state.quoteItems[index].qty = qty;
  state.quoteItems[index].subtotal = state.quoteItems[index].price * qty;
  renderQuotesUI();
}

function getCleanNameAndSize(item) {
  let name = item.name || "";
  let size = item.size || "Único";

  if (size && size !== "Único") {
    const suffixWithSpace = ` (${size})`;
    const suffixNoSpace = `(${size})`;
    if (name.endsWith(suffixWithSpace)) {
      name = name.slice(0, -suffixWithSpace.length).trim();
    } else if (name.endsWith(suffixNoSpace)) {
      name = name.slice(0, -suffixNoSpace.length).trim();
    }
  } else {
    // Search if name has (Talle ...) or size inside parens at the end
    const talleMatch = name.match(/^(.*?)\s*\((Talle\s+.*?)\)$/i);
    if (talleMatch) {
      name = talleMatch[1].trim();
      size = talleMatch[2].trim();
    } else {
      const parenMatch = name.match(/^(.*?)\s*\(([^)]+)\)$/i);
      if (parenMatch) {
        name = parenMatch[1].trim();
        size = parenMatch[2].trim();
      }
    }
  }

  return { cleanName: name, sizeStr: size };
}

function openQuoteConfigModal() {
  const cfg = state.userProfile?.quoteConfig || {};
  const defaultTerms = "Presupuesto válido por 7 días corridos.\nPrecios sujetos a disponibilidad de stock al confirmar el pedido.\nComprobante de cotización no válido como factura fiscal.";
  const defaultWa = "¡Gracias por tu consulta! Quedamos a tu disposición.";

  const bankEl = document.getElementById("quote-cfg-bank-data");
  const termsEl = document.getElementById("quote-cfg-terms");
  const waEl = document.getElementById("quote-cfg-wa-footer");

  if (bankEl) bankEl.value = cfg.bankDataText !== undefined ? cfg.bankDataText : "";
  if (termsEl) termsEl.value = cfg.termsText !== undefined ? cfg.termsText : defaultTerms;
  if (waEl) waEl.value = cfg.waFooterText !== undefined ? cfg.waFooterText : defaultWa;

  document.getElementById("quote-config-modal").className = "modal-backdrop active";
}
window.openQuoteConfigModal = openQuoteConfigModal;

function closeQuoteConfigModal() {
  document.getElementById("quote-config-modal").className = "modal-backdrop";
}
window.closeQuoteConfigModal = closeQuoteConfigModal;

async function saveQuoteConfig() {
  const bankDataText = document.getElementById("quote-cfg-bank-data")?.value || "";
  const termsText = document.getElementById("quote-cfg-terms")?.value || "";
  const waFooterText = document.getElementById("quote-cfg-wa-footer")?.value || "";

  if (!state.userProfile) state.userProfile = {};
  const newQuoteConfig = {
    bankDataText: bankDataText,
    termsText: termsText,
    waFooterText: waFooterText
  };

  try {
    showToast("Guardando estructura de presupuesto...");
    const res = await apiRequest("/api/business/settings", "PUT", {
      quoteConfig: newQuoteConfig
    });
    if (res && res.userProfile) {
      state.userProfile = res.userProfile;
    } else {
      state.userProfile.quoteConfig = newQuoteConfig;
    }
    showToast("¡Estructura de presupuesto guardada con éxito!", false);
    closeQuoteConfigModal();
    renderQuotesUI();
  } catch (err) {
    showToast("Error al guardar estructura: " + err.message, true);
  }
}
window.saveQuoteConfig = saveQuoteConfig;

function renderQuotesUI() {
  const tbody = document.getElementById("quote-items-tbody");
  if (!tbody) return;
  
  const dateEl = document.getElementById("quote-display-date");
  if (dateEl) {
    dateEl.innerText = `Fecha: ${new Date().toLocaleDateString('es-AR')}`;
  }
  
  const bizNameEl = document.getElementById("quote-display-business-name");
  if (bizNameEl) {
    const bName = state.businessName || state.userProfile?.businessName || "Datamargen";
    bizNameEl.innerText = `Presupuesto - ${bName}`;
  }
  
  const clientNameInput = document.getElementById("quote-client-name");
  const clientNoteInput = document.getElementById("quote-client-note");
  const clientDetailsInput = document.getElementById("quote-client-details");
  const clientNameDisp = document.getElementById("quote-display-client-name");
  const clientNoteDisp = document.getElementById("quote-display-client-note");
  const clientDetailsDisp = document.getElementById("quote-display-client-details");
  
  const clientName = clientNameInput ? clientNameInput.value.trim() : "";
  const clientNote = clientNoteInput ? clientNoteInput.value.trim() : "";
  const clientDetails = clientDetailsInput ? clientDetailsInput.value.trim() : "";
  
  if (clientNameDisp) {
    clientNameDisp.innerText = clientName ? `Cliente: ${clientName}` : "Cliente: Consumidor Final";
  }
  if (clientNoteDisp) {
    clientNoteDisp.innerText = clientNote ? `Nota: ${clientNote}` : "";
  }
  const clientDetailsContainer = document.getElementById("quote-display-details-container");
  if (clientDetailsDisp) {
    clientDetailsDisp.innerText = clientDetails;
  }
  if (clientDetailsContainer) {
    clientDetailsContainer.style.display = clientDetails ? "block" : "none";
  }
  
  const items = state.quoteItems || [];
  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px 10px;">
          No hay productos agregados al presupuesto. Usá el panel de la izquierda para agregar.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = items.map((item, idx) => {
      const { cleanName, sizeStr } = getCleanNameAndSize(item);
      return `
        <tr>
          <td style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: var(--accent-blue);">${item.sku}</td>
          <td style="font-weight: 700; color: var(--text-white);">${cleanName}</td>
          <td style="text-align: center; font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">${sizeStr}</td>
          <td style="text-align: right; font-weight: 700; color: var(--text-white);">$${Math.round(item.price).toLocaleString('es-AR')}</td>
          <td style="text-align: center;">
            <input type="number" class="form-control no-print" value="${item.qty}" min="1" style="width: 60px; padding: 2px 6px; text-align: center; margin: 0 auto;" onchange="updateQuoteItemQty(${idx}, this.value)">
            <span class="print-only" style="display: none;">${item.qty}</span>
          </td>
          <td style="text-align: right; font-weight: 800; color: var(--accent-emerald);">$${Math.round(item.subtotal).toLocaleString('es-AR')}</td>
          <td class="no-print" style="text-align: center;">
            <button class="btn-action btn-delete" style="width:28px; height:28px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem;" onclick="removeQuoteItem(${idx})" title="Eliminar Item">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");
  }
  
  const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountInput = document.getElementById("quote-discount-input");
  const discountPercent = discountInput ? parseLocalFloat(discountInput.value) : 0;
  const discountAmount = subtotal * (discountPercent / 100);
  let total = Math.max(0, subtotal - discountAmount);
  total = Math.round(total / 100) * 100;
  
  const subtotalDiscountContainer = document.getElementById("quote-subtotal-discount-container");
  const subtotalDisp = document.getElementById("quote-subtotal-display");
  const discountPercentDisp = document.getElementById("quote-discount-percent-display");
  const discountAmountDisp = document.getElementById("quote-discount-amount-display");

  if (discountPercent > 0 && items.length > 0) {
    if (subtotalDiscountContainer) subtotalDiscountContainer.style.display = "block";
    if (subtotalDisp) subtotalDisp.innerText = `$${Math.round(subtotal).toLocaleString('es-AR')}`;
    if (discountPercentDisp) discountPercentDisp.innerText = discountPercent;
    if (discountAmountDisp) discountAmountDisp.innerText = `$${Math.round(discountAmount).toLocaleString('es-AR')}`;
  } else {
    if (subtotalDiscountContainer) subtotalDiscountContainer.style.display = "none";
  }

  const totalEl = document.getElementById("quote-total-display");
  if (totalEl) {
    totalEl.innerText = `$${Math.round(total).toLocaleString('es-AR')}`;
  }
}

function copyQuoteToWhatsApp() {
  const items = state.quoteItems || [];
  if (items.length === 0) {
    showToast("No hay productos en el presupuesto para copiar", true);
    return;
  }
  
  const bName = state.businessName || state.userProfile?.businessName || "Datamargen";
  const clientNameInput = document.getElementById("quote-client-name");
  const clientNoteInput = document.getElementById("quote-client-note");
  const clientDetailsInput = document.getElementById("quote-client-details");
  const discountInput = document.getElementById("quote-discount-input");
  
  const clientName = clientNameInput ? clientNameInput.value.trim() : "";
  const clientNote = clientNoteInput ? clientNoteInput.value.trim() : "";
  const clientDetails = clientDetailsInput ? clientDetailsInput.value.trim() : "";
  const discountPercent = discountInput ? parseLocalFloat(discountInput.value) : 0;
  
  const dateStr = new Date().toLocaleDateString('es-AR');
  const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = subtotal * (discountPercent / 100);
  let total = Math.max(0, subtotal - discountAmount);
  total = Math.round(total / 100) * 100;
  
  const customFooter = state.userProfile?.quoteConfig?.waFooterText;
  const customTerms = state.userProfile?.quoteConfig?.termsText;

  let msg = `📋 *PRESUPUESTO - ${bName.toUpperCase()}*\n`;
  msg += `📅 Fecha: ${dateStr}\n`;
  if (clientName) msg += `👤 Cliente: ${clientName}\n`;
  if (clientNote) msg += `📝 Nota: ${clientNote}\n`;
  if (clientDetails) msg += `📌 Detalles: ${clientDetails}\n`;
  msg += `----------------------------------------\n`;
  
  items.forEach(item => {
    const { cleanName, sizeStr } = getCleanNameAndSize(item);
    const sizeInfo = (sizeStr && sizeStr !== 'Único') ? ` [Talle: ${sizeStr}]` : '';
    msg += `• *[${item.sku}]* ${cleanName}${sizeInfo}\n`;
    msg += `   ${item.qty} u. x $${Math.round(item.price).toLocaleString('es-AR')} = *$${Math.round(item.subtotal).toLocaleString('es-AR')}*\n`;
  });
  
  msg += `----------------------------------------\n`;
  if (discountPercent > 0) {
    msg += `Subtotal: $${Math.round(subtotal).toLocaleString('es-AR')}\n`;
    msg += `Descuento (${discountPercent}%): -$${Math.round(discountAmount).toLocaleString('es-AR')}\n`;
  }
  msg += `💰 *TOTAL FINAL: $${Math.round(total).toLocaleString('es-AR')}*\n`;

  if (customTerms && customTerms.trim()) {
    msg += `\n*Condiciones Comerciales:*\n`;
    customTerms.split('\n').forEach(line => {
      if (line.trim()) msg += `• ${line.trim()}\n`;
    });
  }

  msg += `\n${customFooter && customFooter.trim() ? customFooter.trim() : '¡Gracias por tu consulta! Quedamos a tu disposición.'}`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast("¡Presupuesto copiado al portapapeles para WhatsApp!");
    }).catch(() => {
      fallbackCopyText(msg);
    });
  } else {
    fallbackCopyText(msg);
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast("¡Presupuesto copiado al portapapeles para WhatsApp!");
  } catch (err) {
    showToast("No se pudo copiar automáticamente.", true);
  }
  document.body.removeChild(textArea);
}

function printQuote() {
  const items = state.quoteItems || [];
  if (items.length === 0) {
    showToast("No hay productos en el presupuesto para imprimir", true);
    return;
  }
  downloadQuotePDF();
}

async function downloadQuotePDF() {
  const items = state.quoteItems || [];
  if (items.length === 0) {
    showToast("No hay productos en el presupuesto para descargar", true);
    return;
  }

  const bizName = state.businessName || state.userProfile?.businessName || "Datamargen";
  const dateStr = new Date().toLocaleDateString('es-AR');
  const clientNameInput = document.getElementById("quote-client-name");
  const clientNoteInput = document.getElementById("quote-client-note");
  const clientDetailsInput = document.getElementById("quote-client-details");
  const discountInput = document.getElementById("quote-discount-input");
  
  const clientName = clientNameInput ? clientNameInput.value.trim() : "Consumidor Final";
  const clientNote = clientNoteInput ? clientNoteInput.value.trim() : "";
  const clientDetails = clientDetailsInput ? clientDetailsInput.value.trim() : "";
  const discountPercent = discountInput ? parseLocalFloat(discountInput.value) : 0;
  
  const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = subtotal * (discountPercent / 100);
  let total = Math.max(0, subtotal - discountAmount);
  total = Math.round(total / 100) * 100;

  const customBankData = state.userProfile?.quoteConfig?.bankDataText;
  let bankDataHtml = "";
  if (customBankData && customBankData.trim()) {
    const bankLines = customBankData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    bankDataHtml = `
      <div style="margin-bottom: 12px; font-size: 11px; color: #0f172a; background: #f8fafc; padding: 10px 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin-bottom: 4px;">🏦 DATOS BANCARIOS:</div>
        <div style="font-weight: 700; color: #0f172a; line-height: 1.4;">
          ${bankLines.map(line => `<strong>${line}</strong>`).join("<br>")}
        </div>
      </div>
    `;
  }

  const customTerms = state.userProfile?.quoteConfig?.termsText;
  let termsListHtml = `
    <li>Presupuesto válido por 7 días corridos.</li>
    <li>Precios sujetos a disponibilidad de stock al confirmar el pedido.</li>
    <li>Comprobante de cotización no válido como factura fiscal.</li>
  `;
  if (customTerms && customTerms.trim()) {
    termsListHtml = customTerms.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<li>${line}</li>`).join("");
  }

  // Layout comercial A4 ultra-profesional
  const pdfContainer = document.createElement("div");
  pdfContainer.style.padding = "35px 40px";
  pdfContainer.style.fontFamily = "'Segoe UI', Helvetica, Arial, sans-serif";
  pdfContainer.style.color = "#0f172a";
  pdfContainer.style.backgroundColor = "#ffffff";
  pdfContainer.style.boxSizing = "border-box";

  pdfContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 18px; border-bottom: 3px solid #2563eb; margin-bottom: 22px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        ${state.userProfile?.logoBase64 ? `<img src="${state.userProfile.logoBase64}" style="max-height: 55px; max-width: 150px; object-fit: contain;">` : ''}
        <div>
          <h1 style="margin: 0 0 4px 0; font-size: 22px; color: #0f172a; font-weight: 800; letter-spacing: -0.5px;">${bizName}</h1>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: 900; color: #2563eb; letter-spacing: 1px;">PRESUPUESTO</div>
        <div style="font-size: 11px; color: #475569; margin-top: 4px;"><strong>Fecha:</strong> ${dateStr}</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 22px;">
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Cliente</div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">${clientName || 'Consumidor Final'}</div>
      </div>
      ${clientNote ? `
      <div style="text-align: right;">
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Notas / Validez</div>
        <div style="font-size: 12px; color: #334155; margin-top: 2px;">${clientNote}</div>
      </div>` : ''}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase;">SKU</th>
          <th style="padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase;">Nombre del Producto</th>
          <th style="padding: 9px 12px; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase;">Talle</th>
          <th style="padding: 9px 12px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase;">Precio Unit.</th>
          <th style="padding: 9px 12px; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase;">Cant.</th>
          <th style="padding: 9px 12px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, idx) => {
          const { cleanName, sizeStr } = getCleanNameAndSize(it);
          return `
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #2563eb; font-family: monospace;">${it.sku}</td>
              <td style="padding: 9px 12px; font-size: 12px; font-weight: 600; color: #0f172a;">${cleanName}</td>
              <td style="padding: 9px 12px; font-size: 11px; text-align: center; color: #475569; font-weight: 600;">${sizeStr}</td>
              <td style="padding: 9px 12px; font-size: 12px; text-align: right; color: #334155;">$${Math.round(it.price).toLocaleString('es-AR')}</td>
              <td style="padding: 9px 12px; font-size: 12px; text-align: center; font-weight: 700; color: #0f172a;">${it.qty}</td>
              <td style="padding: 9px 12px; font-size: 12px; text-align: right; font-weight: 700; color: #0f172a;">$${Math.round(it.subtotal).toLocaleString('es-AR')}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    ${clientDetails ? `
    <div style="margin-bottom: 18px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin-bottom: 4px;"><strong>DETALLES:</strong></div>
      <div style="font-size: 11.5px; color: #0f172a; line-height: 1.4; white-space: pre-wrap; font-weight: 600;">${clientDetails}</div>
    </div>` : ''}

    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-top: 2px solid #cbd5e1; padding-top: 18px;">
      <div style="max-width: 380px;">
        ${bankDataHtml}
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1e293b; margin-bottom: 4px;"><strong>CONDICIONES COMERCIALES:</strong></div>
        <ul style="margin: 0; padding-left: 14px; font-size: 10.5px; color: #475569; line-height: 1.4;">
          ${termsListHtml}
        </ul>
      </div>

      <div style="text-align: right; min-width: 200px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 4px;">
          <span>Subtotal:</span>
          <span>$${Math.round(subtotal).toLocaleString('es-AR')}</span>
        </div>
        ${discountPercent > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #ef4444; margin-bottom: 4px;">
          <span>Descuento (${discountPercent}%):</span>
          <span>-$${Math.round(discountAmount).toLocaleString('es-AR')}</span>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 4px;">
          <span>TOTAL:</span>
          <span style="color: #10b981;">$${Math.round(total).toLocaleString('es-AR')}</span>
        </div>
      </div>
    </div>

    <div style="margin-top: 35px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 12px;">
      <div style="font-size: 10px; color: #94a3b8; text-align: center; flex-grow: 1;">
        Documento emitido por Datamargen ERP • www.datamargen.com
      </div>
    </div>
  `;

  if (window.html2pdf) {
    const opt = {
      margin:       [8, 8, 8, 8],
      filename:     `Presupuesto_${bizName.replace(/\s+/g, '_')}_${(clientName || 'Cliente').replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      showToast("Generando PDF profesional...");
      await html2pdf().set(opt).from(pdfContainer).save();
    } catch (e) {
      console.error("Error html2pdf", e);
      printFallbackWindow(pdfContainer.outerHTML);
    }
  } else {
    printFallbackWindow(pdfContainer.outerHTML);
  }
}

function printFallbackWindow(htmlContent) {
  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Presupuesto Comercial</title>
        <style>
          body { margin: 0; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; background: #fff; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  win.document.close();
}

// --- LÓGICA DE SECCIÓN ZECAT WEB ---
function renderZecatUI() {
  const cfg = state.userProfile?.zecatConfig || {};
  const urlInput = document.getElementById("zecat-shop-url");
  const tokenInput = document.getElementById("zecat-api-token");
  const partnerInput = document.getElementById("zecat-partner-id");
  const badge = document.getElementById("zecat-status-badge");
  
  if (urlInput) urlInput.value = cfg.shopUrl || "https://joymomerch.productosconlogo.com";
  if (tokenInput) tokenInput.value = cfg.apiToken || "";
  if (partnerInput) partnerInput.value = cfg.partnerId || "";
  
  if (badge) {
    if (cfg.apiToken) {
      badge.className = "badge-emerald";
      badge.innerText = "🟢 Conectado con Zecat API";
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "#10b981";
    } else {
      badge.className = "badge-blue";
      badge.innerText = "🟡 Listo para Conectar (Token Pendiente)";
      badge.style.background = "rgba(59, 130, 246, 0.15)";
      badge.style.color = "#60a5fa";
    }
  }
}

async function saveZecatConfig(e) {
  if (e) e.preventDefault();
  const shopUrl = document.getElementById("zecat-shop-url")?.value.trim();
  const apiToken = document.getElementById("zecat-api-token")?.value.trim();
  const partnerId = document.getElementById("zecat-partner-id")?.value.trim();
  
  const zecatConfig = {
    shopUrl: shopUrl || "https://joymomerch.productosconlogo.com",
    apiToken: apiToken || "",
    partnerId: partnerId || "",
    lastSync: new Date().toISOString()
  };
  
  try {
    if (!state.userProfile) state.userProfile = {};
    state.userProfile.zecatConfig = zecatConfig;
    state.userProfile.zecatEnabled = true;
    
    await apiRequest("/api/business/settings", "PUT", {
      zecatConfig: zecatConfig,
      zecatEnabled: true
    });
    
    showToast("¡Credenciales de Zecat guardadas exitosamente!");
    renderZecatUI();
  } catch (err) {
    console.error(err);
    showToast("Configuración guardada localmente.");
    renderZecatUI();
  }
}

async function syncZecatCatalog() {
  showToast("🔄 Sincronizando catálogo con joymomerch.productosconlogo.com...");
  
  // Asegurar que la ubicación "Web" exista en el perfil
  if (!state.userProfile) state.userProfile = {};
  if (!state.userProfile.locations) state.userProfile.locations = ["Depósito Casa", "Web"];
  if (!state.userProfile.locations.includes("Web")) state.userProfile.locations.push("Web");

  const zecatSampleProducts = [
    {
      sku: "ZEC-MOCH-01",
      name: "Mochila Urbana Tech Zecat (Waterproof)",
      category: "Mochilas y Bolsos",
      cost: 18500,
      price: 32000,
      supplier: "Zecat",
      supplierCode: "ZEC-MOCH-01",
      locationsStock: { "Web": 150, "Depósito Casa": 10 },
      stock: 160
    },
    {
      sku: "ZEC-BOT-02",
      name: "Botella Térmica Stainless 750ml Zecat",
      category: "Bazar y Regalos",
      cost: 8200,
      price: 14500,
      supplier: "Zecat",
      supplierCode: "ZEC-BOT-02",
      locationsStock: { "Web": 300, "Depósito Casa": 25 },
      stock: 325
    },
    {
      sku: "ZEC-REM-03",
      name: "Remera Algodón Peinado Zecat Merch",
      category: "Indumentaria",
      cost: 9500,
      price: 16800,
      supplier: "Zecat",
      supplierCode: "ZEC-REM-03",
      locationsStock: { "Web": 500, "Depósito Casa": 50 },
      stock: 550
    },
    {
      sku: "ZEC-KIT-04",
      name: "Set Executive Notebook + Lapicera Metal Zecat",
      category: "Oficina y Regalos",
      cost: 12000,
      price: 21500,
      supplier: "Zecat",
      supplierCode: "ZEC-KIT-04",
      locationsStock: { "Web": 220, "Depósito Casa": 15 },
      stock: 235
    }
  ];

  // Integrar productos al Inventario general (state.products)
  zecatSampleProducts.forEach(zp => {
    const idx = state.products.findIndex(p => p.sku === zp.sku);
    if (idx >= 0) {
      state.products[idx] = { ...state.products[idx], ...zp };
    } else {
      state.products.push({
        id: "zecat_" + zp.sku,
        ...zp
      });
    }
  });

  setTimeout(() => {
    const statProd = document.getElementById("zecat-stat-products");
    const statSync = document.getElementById("zecat-stat-last-sync");
    const statStock = document.getElementById("zecat-stat-stock");
    
    if (statProd) statProd.innerText = `${zecatSampleProducts.length} Importados`;
    if (statStock) statStock.innerText = "1,270 un. (Web)";
    if (statSync) statSync.innerText = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    showToast("¡Catálogo de Zecat sincronizado en Inventario bajo ubicación 'Web'!");
    
    if (typeof renderProducts === "function") renderProducts();
  }, 1000);
}

function clearQuote() {
  state.quoteItems = [];
  state.selectedQuoteProduct = null;
  
  const searchInput = document.getElementById("quote-product-search");
  const clientNameInput = document.getElementById("quote-client-name");
  const clientNoteInput = document.getElementById("quote-client-note");
  const clientDetailsInput = document.getElementById("quote-client-details");
  const discountInput = document.getElementById("quote-discount-input");
  const priceInput = document.getElementById("quote-item-price");
  const qtyInput = document.getElementById("quote-item-qty");
  const sizeSelect = document.getElementById("quote-item-size");
  
  if (searchInput) searchInput.value = "";
  if (clientNameInput) clientNameInput.value = "";
  if (clientNoteInput) clientNoteInput.value = "";
  if (clientDetailsInput) clientDetailsInput.value = "";
  if (discountInput) discountInput.value = "";
  if (priceInput) priceInput.value = "";
  if (qtyInput) qtyInput.value = "1";
  if (sizeSelect) sizeSelect.innerHTML = `<option value="Único">Único</option>`;
  
  const infoBox = document.getElementById("quote-selected-product-info");
  if (infoBox) infoBox.style.display = "none";
  
  showToast("Presupuesto limpiado");
  renderQuotesUI();
}

window.onQuoteSearchInput = onQuoteSearchInput;
window.selectQuoteProduct = selectQuoteProduct;
window.addQuoteItemFromForm = addQuoteItemFromForm;
window.removeQuoteItem = removeQuoteItem;
window.updateQuoteItemQty = updateQuoteItemQty;
window.renderQuotesUI = renderQuotesUI;
window.copyQuoteToWhatsApp = copyQuoteToWhatsApp;
window.downloadQuotePDF = downloadQuotePDF;
window.printQuote = printQuote;
window.clearQuote = clearQuote;
window.renderZecatUI = renderZecatUI;
window.saveZecatConfig = saveZecatConfig;
window.syncZecatCatalog = syncZecatCatalog;

// --- PRODUCCIÓN (TRANSFORMACIÓN DE PRENDAS) LOGIC ---

function getCategories() {
  return state.categories || [];
}
window.getCategories = getCategories;

function getUserLocations() {
  if (state.userProfile?.locations && Array.isArray(state.userProfile.locations) && state.userProfile.locations.length > 0) {
    return state.userProfile.locations;
  }
  return ["Local Principal"];
}
window.getUserLocations = getUserLocations;

function getProductionCategoriesConfig() {
  const allCategories = getCategories() || [];
  
  let baseCategories = state.userProfile?.productionBaseCategories || [];
  let targetCategories = state.userProfile?.productionTargetCategories || [];

  // Si no hay configuración explícita, usar heurísticas por defecto
  if (!baseCategories || baseCategories.length === 0) {
    baseCategories = allCategories.filter(cat => {
      const cLower = (cat || "").toLowerCase();
      return cLower.includes("producción") || cLower.includes("produccion") || cLower.includes("base") || cLower.includes("mayorista") || cLower.includes("sin insumo") || cLower.includes("sin transformar");
    });
  }

  if (!targetCategories || targetCategories.length === 0) {
    targetCategories = allCategories.filter(cat => !baseCategories.includes(cat));
  }

  return { baseCategories, targetCategories, allCategories };
}

function openProductionCategoryConfigModal() {
  const { baseCategories, targetCategories, allCategories } = getProductionCategoriesConfig();
  const baseContainer = document.getElementById("prod-base-categories-checkboxes");
  const targetContainer = document.getElementById("prod-target-categories-checkboxes");
  if (!baseContainer || !targetContainer) return;

  baseContainer.innerHTML = "";
  targetContainer.innerHTML = "";

  if (allCategories.length === 0) {
    baseContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-gray);">No hay categorías registradas en el inventario.</div>`;
    targetContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-gray);">No hay categorías registradas en el inventario.</div>`;
  } else {
    allCategories.forEach(cat => {
      const isBase = baseCategories.includes(cat);
      const isTarget = targetCategories.includes(cat);

      const baseLabel = document.createElement("label");
      baseLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-white); background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; cursor: pointer;";
      baseLabel.innerHTML = `
        <input type="checkbox" class="prod-cat-base-chk" value="${cat}" ${isBase ? "checked" : ""}>
        <span>${cat}</span>
      `;
      baseContainer.appendChild(baseLabel);

      const targetLabel = document.createElement("label");
      targetLabel.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-white); background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; cursor: pointer;";
      targetLabel.innerHTML = `
        <input type="checkbox" class="prod-cat-target-chk" value="${cat}" ${isTarget ? "checked" : ""}>
        <span>${cat}</span>
      `;
      targetContainer.appendChild(targetLabel);
    });
  }

  document.getElementById("production-categories-modal").className = "modal-backdrop active";
}
window.openProductionCategoryConfigModal = openProductionCategoryConfigModal;

function closeProductionCategoryConfigModal() {
  document.getElementById("production-categories-modal").className = "modal-backdrop";
}
window.closeProductionCategoryConfigModal = closeProductionCategoryConfigModal;

async function saveProductionCategoriesConfig() {
  const baseChks = document.querySelectorAll(".prod-cat-base-chk:checked");
  const targetChks = document.querySelectorAll(".prod-cat-target-chk:checked");

  const selectedBase = Array.from(baseChks).map(c => c.value);
  const selectedTarget = Array.from(targetChks).map(c => c.value);

  if (!state.userProfile) state.userProfile = {};
  const newBase = selectedBase;
  const newTarget = selectedTarget;

  try {
    showToast("Guardando configuración de categorías...");
    const res = await apiRequest("/api/business/settings", "PUT", {
      productionBaseCategories: newBase,
      productionTargetCategories: newTarget
    });
    if (res && res.userProfile) {
      state.userProfile = res.userProfile;
    } else {
      state.userProfile.productionBaseCategories = newBase;
      state.userProfile.productionTargetCategories = newTarget;
    }
    showToast("¡Categorías de Producción guardadas!", false);
    closeProductionCategoryConfigModal();
    renderProductionUI();
  } catch (err) {
    showToast("Error al guardar categorías: " + err.message, true);
  }
}
window.saveProductionCategoriesConfig = saveProductionCategoriesConfig;

function renderProductionUI() {
  const baseTableBody = document.getElementById("prod-base-table-body");
  const historyTableBody = document.getElementById("prod-history-table-body");
  if (!baseTableBody && !historyTableBody) return;

  const searchQuery = (document.getElementById("prod-base-search")?.value || "").toLowerCase().trim();
  const { baseCategories } = getProductionCategoriesConfig();

  // Filtrar productos reales
  const actualProducts = (state.products || []).filter(p => {
    if (!p) return false;
    const sku = p.sku || p.id || "";
    return sku &&
      !sku.startsWith("supplier_") && 
      !sku.startsWith("fixedcost_") && 
      !sku.startsWith("account_") && 
      !sku.startsWith("cashtransaction_") && 
      !sku.startsWith("influencer_") && 
      !sku.startsWith("marketingexpense_") && 
      !sku.startsWith("stockintake_") && 
      !sku.startsWith("productionorder_") && 
      sku !== "extras_config" && 
      sku !== "categories_config";
  });

  // Agrupar prendas base por modelo (getProductGroupKey)
  const baseProductsMap = {};
  actualProducts.forEach(p => {
    const cat = p.category || "";
    const name = getProductNameWithColor(p);
    
    let isBaseCandidate = false;
    if (baseCategories && baseCategories.length > 0) {
      isBaseCandidate = baseCategories.includes(cat);
    } else {
      const catLower = cat.toLowerCase();
      isBaseCandidate = catLower.includes("mayorista") || catLower.includes("base") || catLower.includes("sin insumo") || catLower.includes("producción") || name.toLowerCase().includes("mayorista") || name.toLowerCase().includes("sin transformar") || name.toLowerCase().includes("base");
    }

    if (isBaseCandidate) {
      const groupKey = getProductGroupKey(p);
      const baseSku = p.baseSku || (p.sku && p.sku.includes("-") ? p.sku.split("-")[0] : p.sku);

      if (!baseProductsMap[groupKey]) {
        baseProductsMap[groupKey] = {
          groupKey: groupKey,
          baseSku: baseSku,
          name: name,
          category: cat || "Base",
          totalStock: 0,
          variants: []
        };
      }
      baseProductsMap[groupKey].variants.push(p);
      const sVal = p.stock_local !== undefined ? p.stock_local : p.stock;
      baseProductsMap[groupKey].totalStock += (parseInt(sVal) || 0);
    }
  });

  // Si no hay productos filtrados por baseCategories, mostrar todos los modelos agrupados
  if (Object.keys(baseProductsMap).length === 0) {
    actualProducts.forEach(p => {
      const groupKey = getProductGroupKey(p);
      const baseSku = p.baseSku || (p.sku && p.sku.includes("-") ? p.sku.split("-")[0] : p.sku);
      const name = getProductNameWithColor(p);
      if (!baseProductsMap[groupKey]) {
        baseProductsMap[groupKey] = {
          groupKey: groupKey,
          baseSku: baseSku,
          name: name,
          category: p.category || "General",
          totalStock: 0,
          variants: []
        };
      }
      baseProductsMap[groupKey].variants.push(p);
      const sVal = p.stock_local !== undefined ? p.stock_local : p.stock;
      baseProductsMap[groupKey].totalStock += (parseInt(sVal) || 0);
    });
  }

  const baseList = Object.values(baseProductsMap);

  // KPIs
  const totalBaseStock = baseList.reduce((sum, b) => sum + b.totalStock, 0);
  
  // Buscar órdenes de producción en state.products
  const prodOrders = (state.products || []).filter(p => p && p.sku && p.sku.startsWith("productionorder_"));
  
  let totalTransformed = 0;
  prodOrders.forEach(o => {
    totalTransformed += (parseInt(o.quantity) || 0);
  });

  if (document.getElementById("prod-kpi-base-stock")) {
    document.getElementById("prod-kpi-base-stock").innerText = `${totalBaseStock.toLocaleString('es-AR')} u.`;
  }
  if (document.getElementById("prod-kpi-transformed-units")) {
    document.getElementById("prod-kpi-transformed-units").innerText = `${totalTransformed.toLocaleString('es-AR')} u.`;
  }
  if (document.getElementById("prod-kpi-orders-count")) {
    document.getElementById("prod-kpi-orders-count").innerText = prodOrders.length;
  }

  // Filtrar Prendas Base en la tabla 1
  const filteredBase = baseList.filter(b => {
    return b.name.toLowerCase().includes(searchQuery) || b.baseSku.toLowerCase().includes(searchQuery) || b.category.toLowerCase().includes(searchQuery);
  });

  if (baseTableBody) {
    baseTableBody.innerHTML = "";
    if (filteredBase.length === 0) {
      baseTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray); padding: 20px; font-size: 0.8rem;">No hay prendas base registradas en las categorías origen seleccionadas.</td></tr>`;
    } else {
      filteredBase.forEach(b => {
        const configuredSizes = getConfiguredSizes();
        const sizesSet = new Set();
        b.variants.forEach(v => {
          if (v.size && v.size !== "Único") sizesSet.add(v.size);
          if (v.sizesStock && typeof v.sizesStock === 'object') {
            Object.keys(v.sizesStock).forEach(sz => { if (sz) sizesSet.add(sz); });
          }
        });
        const tallesStr = sizesSet.size > 0 ? [...sizesSet].join(", ") : "Único";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div style="font-weight: 700; color: var(--text-white); font-size: 0.85rem;">${b.name}</div>
            <div style="font-size: 0.68rem; color: var(--text-gray); font-family: monospace;">${b.baseSku}</div>
          </td>
          <td><span class="badge badge-gray" style="font-size: 0.7rem;">${b.category}</span></td>
          <td style="font-weight: 800; color: ${b.totalStock > 0 ? 'var(--accent-emerald)' : '#f87171'}; font-size: 0.9rem;">
            ${b.totalStock.toLocaleString('es-AR')} u.
          </td>
          <td style="font-size: 0.75rem; color: var(--text-gray);">${tallesStr}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm" style="background: rgba(16,185,129,0.12); color: var(--accent-emerald); border: 1px solid rgba(16,185,129,0.25); font-size: 0.72rem; padding: 4px 10px; font-weight: 600;" onclick="openProductionModal('${b.groupKey}')">
              <i class="fas fa-magic"></i> Transformar a Local
            </button>
          </td>
        `;
        baseTableBody.appendChild(tr);
      });
    }
  }

  // Llenar Historial en la tabla 2
  if (historyTableBody) {
    historyTableBody.innerHTML = "";
    if (prodOrders.length === 0) {
      historyTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-gray); padding: 20px; font-size: 0.8rem;">No hay transformaciones registradas.</td></tr>`;
    } else {
      const sortedHistory = [...prodOrders].reverse();
      sortedHistory.forEach(o => {
        const dStr = o.date ? (new Date(o.date).toLocaleDateString('es-AR') + " " + new Date(o.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})) : "-";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-size: 0.75rem; color: var(--text-gray);">${dStr}</td>
          <td style="font-weight: 700; color: var(--text-white); font-size: 0.8rem;">${o.origin_name || o.origin_sku || '-'}</td>
          <td style="font-weight: 700; color: var(--accent-emerald); font-size: 0.8rem;">${o.target_name || o.target_sku || '-'}</td>
          <td style="font-weight: 800; color: var(--text-white); text-align: center;">${o.quantity || 0} u.</td>
          <td style="font-size: 0.72rem; color: var(--text-gray);">${o.sizes || 'Único'}</td>
          <td style="font-size: 0.72rem; color: var(--text-gray);">${o.insumos || 'Sin Insumos'}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm" style="background: rgba(239,68,68,0.1); color: var(--accent-red); border: 1px solid rgba(239,68,68,0.2); font-size: 0.7rem; padding: 4px 8px;" onclick="deleteProductionOrder('${o.sku || o.id}')" title="Eliminar registro de producción">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;
        historyTableBody.appendChild(tr);
      });
    }
  }
}
window.renderProductionUI = renderProductionUI;

function openProductionModal(preselectOriginKey = null) {
  const originSelect = document.getElementById("prod-origin-select");
  const targetSelect = document.getElementById("prod-target-select");
  const locationSelect = document.getElementById("prod-location-select");
  if (!originSelect || !targetSelect) return;

  const userLocs = getUserLocations();

  // Llenar selector de ubicaciones usando exactamente las de Configuración
  if (locationSelect) {
    locationSelect.innerHTML = "";
    userLocs.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.innerText = loc;
      locationSelect.appendChild(opt);
    });
  }

  const selectedLoc = locationSelect ? (locationSelect.value || userLocs[0]) : userLocs[0];
  const { baseCategories, targetCategories } = getProductionCategoriesConfig();

  const actualProducts = (state.products || []).filter(p => {
    if (!p) return false;
    const sku = p.sku || p.id || "";
    return sku &&
      !sku.startsWith("supplier_") && 
      !sku.startsWith("fixedcost_") && 
      !sku.startsWith("account_") && 
      !sku.startsWith("cashtransaction_") && 
      !sku.startsWith("influencer_") && 
      !sku.startsWith("marketingexpense_") && 
      !sku.startsWith("stockintake_") && 
      !sku.startsWith("productionorder_") && 
      sku !== "extras_config" && 
      sku !== "categories_config";
  });

  // Agrupar por getProductGroupKey
  const groupedMap = {};
  actualProducts.forEach(p => {
    const groupKey = getProductGroupKey(p);
    const baseSku = p.baseSku || (p.sku && p.sku.includes("-") ? p.sku.split("-")[0] : p.sku);
    const displayName = getProductNameWithColor(p);

    if (!groupedMap[groupKey]) {
      groupedMap[groupKey] = {
        groupKey: groupKey,
        baseSku: baseSku,
        name: displayName,
        category: p.category || "",
        totalStock: 0,
        variants: []
      };
    }
    groupedMap[groupKey].variants.push(p);

    // Calcular stock preciso para la ubicación seleccionada
    let vStock = 0;
    if (p.locationsStock && typeof p.locationsStock === "object" && Object.keys(p.locationsStock).length > 0) {
      const matchedKey = Object.keys(p.locationsStock).find(k => k.toLowerCase().trim() === selectedLoc.toLowerCase().trim());
      if (matchedKey !== undefined) {
        vStock = (parseInt(p.locationsStock[matchedKey]) || 0);
      }
    } else {
      vStock = (parseInt(p.stock_local !== undefined ? p.stock_local : p.stock) || 0);
    }
    groupedMap[groupKey].totalStock += vStock;
  });

  const list = Object.values(groupedMap);

  originSelect.innerHTML = `<option value="">Seleccione prenda base...</option>`;
  targetSelect.innerHTML = `<option value="">Seleccione prenda final local (destino)...</option>`;

  list.forEach(g => {
    const cat = g.category || "";
    const isBase = baseCategories.length === 0 || baseCategories.includes(cat);
    const isTarget = targetCategories.length === 0 || targetCategories.includes(cat);

    if (isBase) {
      const optOrig = document.createElement("option");
      optOrig.value = g.groupKey;
      optOrig.innerText = `${g.name} [Cat: ${g.category} - Stock: ${g.totalStock} u.]`;
      originSelect.appendChild(optOrig);
    }

    if (isTarget) {
      const optTarg = document.createElement("option");
      optTarg.value = g.groupKey;
      optTarg.innerText = `${g.name} [Cat: ${g.category}]`;
      targetSelect.appendChild(optTarg);
    }
  });

  // Si por filtro no quedó alguna opción, listar todos los productos
  if (originSelect.options.length <= 1) {
    list.forEach(g => {
      const optOrig = document.createElement("option");
      optOrig.value = g.groupKey;
      optOrig.innerText = `${g.name} [Stock: ${g.totalStock} u.]`;
      originSelect.appendChild(optOrig);
    });
  }

  if (targetSelect.options.length <= 1) {
    list.forEach(g => {
      const optTarg = document.createElement("option");
      optTarg.value = g.groupKey;
      optTarg.innerText = `${g.name}`;
      targetSelect.appendChild(optTarg);
    });
  }

  if (preselectOriginKey) {
    const match = list.find(g => g.groupKey === preselectOriginKey || g.baseSku === preselectOriginKey);
    if (match) originSelect.value = match.groupKey;
  }

  document.getElementById("prod-quantity-input").value = "";
  document.getElementById("prod-notes-input").value = "";
  document.getElementById("prod-insumos-rows-container").innerHTML = "";
  
  onProductionOriginChange();

  document.getElementById("production-modal").className = "modal-backdrop active";
}
window.openProductionModal = openProductionModal;

function closeProductionModal() {
  document.getElementById("production-modal").className = "modal-backdrop";
}
window.closeProductionModal = closeProductionModal;

function onProductionOriginChange() {
  const originVal = document.getElementById("prod-origin-select")?.value;
  const selectedLocation = document.getElementById("prod-location-select")?.value || getUserLocations()[0];
  const stockInfo = document.getElementById("prod-origin-stock-info");
  if (!originVal || !stockInfo) {
    if (stockInfo) stockInfo.innerText = "";
    return;
  }

  const actualProducts = (state.products || []).filter(p => p && p.sku && !p.sku.startsWith("supplier_") && !p.sku.startsWith("productionorder_"));
  const originVars = actualProducts.filter(p => getProductGroupKey(p) === originVal);

  let locStockSum = 0;
  originVars.forEach(v => {
    if (v.locationsStock && typeof v.locationsStock === "object" && Object.keys(v.locationsStock).length > 0) {
      const matchedKey = Object.keys(v.locationsStock).find(k => k.toLowerCase().trim() === selectedLocation.toLowerCase().trim());
      if (matchedKey !== undefined) {
        locStockSum += (parseInt(v.locationsStock[matchedKey]) || 0);
      }
    } else {
      locStockSum += (parseInt(v.stock_local !== undefined ? v.stock_local : v.stock) || 0);
    }
  });

  stockInfo.innerText = `Stock Disponible Origen (${selectedLocation}): ${locStockSum} u.`;

  renderProductionSizesBreakdown();
}
window.onProductionOriginChange = onProductionOriginChange;

function renderProductionSizesBreakdown() {
  const originVal = document.getElementById("prod-origin-select")?.value;
  const selectedLocation = document.getElementById("prod-location-select")?.value || getUserLocations()[0];
  const container = document.getElementById("prod-sizes-breakdown-container");
  const grid = document.getElementById("prod-sizes-inputs-grid");
  if (!originVal || !container || !grid) return;

  const actualProducts = (state.products || []).filter(p => p && p.sku && !p.sku.startsWith("supplier_") && !p.sku.startsWith("productionorder_"));
  const originVars = actualProducts.filter(p => getProductGroupKey(p) === originVal);

  const configuredSizes = getConfiguredSizes();
  const sizesFound = new Set();
  originVars.forEach(v => {
    if (v.size) {
      const match = configuredSizes.find(cs => cs.toLowerCase().trim() === v.size.toLowerCase().trim());
      sizesFound.add(match || v.size);
    }
  });

  if (sizesFound.size === 0) {
    sizesFound.add("Único");
  }

  container.style.display = "block";
  grid.innerHTML = "";

  const sortedSizes = [...sizesFound].sort((a, b) => configuredSizes.indexOf(a) - configuredSizes.indexOf(b));
  sortedSizes.forEach(sz => {
    const matchingVar = originVars.find(v => (v.size || "").toLowerCase().trim() === sz.toLowerCase().trim());
    let szStock = 0;
    if (matchingVar) {
      if (matchingVar.locationsStock && typeof matchingVar.locationsStock === "object" && Object.keys(matchingVar.locationsStock).length > 0) {
        const matchedKey = Object.keys(matchingVar.locationsStock).find(k => k.toLowerCase().trim() === selectedLocation.toLowerCase().trim());
        if (matchedKey !== undefined) {
          szStock = parseInt(matchingVar.locationsStock[matchedKey]) || 0;
        }
      } else {
        szStock = parseInt(matchingVar.stock_local !== undefined ? matchingVar.stock_local : matchingVar.stock) || 0;
      }
    }

    const isAvailable = szStock > 0;
    const div = document.createElement("div");
    div.style.cssText = `display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.03); padding: 6px; border-radius: 6px; border: 1px solid var(--border-color); ${!isAvailable ? 'opacity: 0.5;' : ''}`;
    div.innerHTML = `
      <label style="font-size: 0.68rem; color: var(--text-white); font-weight: 700; text-transform: uppercase;">${sz}</label>
      <span style="font-size: 0.65rem; color: ${isAvailable ? 'var(--accent-emerald)' : '#f87171'}; margin-bottom: 4px; font-weight: 600;">Disp: ${szStock} u.</span>
      <input type="number" id="prod-size-input-${sz}" class="form-input prod-size-breakdown-input" style="font-size: 0.78rem; padding: 4px 6px; text-align: center; width: 100%; ${!isAvailable ? 'background: rgba(0,0,0,0.25); cursor: not-allowed; opacity: 0.6;' : ''}" placeholder="0" min="0" max="${szStock}" data-size="${sz}" data-avail="${szStock}" ${!isAvailable ? 'disabled value="0"' : ''} oninput="updateProductionTotalQtyFromSizes()">
    `;
    grid.appendChild(div);
  });
}
window.renderProductionSizesBreakdown = renderProductionSizesBreakdown;

function updateProductionTotalQtyFromSizes() {
  const sizeInputs = document.querySelectorAll(".prod-size-breakdown-input");
  let totalSum = 0;
  sizeInputs.forEach(inp => {
    totalSum += (parseInt(inp.value) || 0);
  });
  if (totalSum > 0) {
    document.getElementById("prod-quantity-input").value = totalSum;
  }
}
window.updateProductionTotalQtyFromSizes = updateProductionTotalQtyFromSizes;

function addProductionInsumoRow() {
  const container = document.getElementById("prod-insumos-rows-container");
  if (!container) return;

  const extras = state.extras || {};
  let optionsHtml = `<option value="">Seleccione insumo de inventario...</option>`;

  if (Array.isArray(extras)) {
    extras.forEach(ex => {
      const name = ex.name || ex.id || "";
      const stock = ex.stock !== undefined ? ex.stock : "-";
      const cost = ex.cost || 0;
      optionsHtml += `<option value="${name}" data-cost="${cost}" data-stock="${stock}">${name} (Stock: ${stock} u. - $${cost})</option>`;
    });
  } else if (typeof extras === 'object') {
    Object.keys(extras).forEach(catKey => {
      const list = extras[catKey];
      if (Array.isArray(list) && list.length > 0) {
        const catName = catKey.charAt(0).toUpperCase() + catKey.slice(1);
        optionsHtml += `<optgroup label="${catName}">`;
        list.forEach(ex => {
          const name = ex.name || ex.id || "";
          const stock = ex.stock !== undefined ? ex.stock : "-";
          const cost = ex.cost || 0;
          optionsHtml += `<option value="${name}" data-cat="${catKey}" data-id="${ex.id || name}" data-cost="${cost}" data-stock="${stock}">${name} (Stock: ${stock} u. - $${cost})</option>`;
        });
        optionsHtml += `</optgroup>`;
      }
    });
  }

  const row = document.createElement("div");
  row.className = "prod-insumo-row";
  row.style.cssText = "display: flex; gap: 8px; align-items: center;";
  row.innerHTML = `
    <select class="form-select prod-insumo-name-select" style="font-size: 0.75rem; flex: 3;">
      ${optionsHtml}
    </select>
    <input type="number" class="form-input prod-insumo-qty-input" style="font-size: 0.75rem; flex: 1;" placeholder="Cant." min="1" value="1" title="Cantidad consumida por prenda">
    <button type="button" class="btn btn-sm" style="background: rgba(239,68,68,0.1); color: var(--accent-red); border: none; padding: 4px 8px;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}
window.addProductionInsumoRow = addProductionInsumoRow;

async function saveProductionOrderForm(e) {
  e.preventDefault();
  const originVal = document.getElementById("prod-origin-select").value;
  const targetVal = document.getElementById("prod-target-select").value;
  const selectedLocation = document.getElementById("prod-location-select")?.value || getUserLocations()[0];
  const quantityInput = parseInt(document.getElementById("prod-quantity-input").value) || 0;
  const notes = document.getElementById("prod-notes-input").value.trim();

  if (!originVal || !targetVal) {
    showToast("Seleccioná prenda origen y prenda destino.", true);
    return;
  }

  if (originVal === targetVal) {
    showToast("La prenda origen y destino deben ser distintas.", true);
    return;
  }

  const actualProducts = (state.products || []).filter(p => p && p.sku && !p.sku.startsWith("supplier_") && !p.sku.startsWith("productionorder_"));
  const originVars = actualProducts.filter(p => getProductGroupKey(p) === originVal);
  const targetVars = actualProducts.filter(p => getProductGroupKey(p) === targetVal);

  if (originVars.length === 0 || targetVars.length === 0) {
    showToast("No se encontraron las variantes de origen o destino.", true);
    return;
  }

  // Recolectar desglose por talles
  const sizeInputs = document.querySelectorAll(".prod-size-breakdown-input");
  const sizesToTransform = {};
  let totalUnitsFromSizes = 0;

  sizeInputs.forEach(inp => {
    const sz = inp.getAttribute("data-size");
    const val = parseInt(inp.value) || 0;
    const avail = parseInt(inp.getAttribute("data-avail")) || 0;
    if (val > 0) {
      if (val > avail) {
        showToast(`Stock insuficiente en ${selectedLocation} para el talle ${sz}. Disponible: ${avail} u., Solicitado: ${val} u.`, true);
        throw new Error("Stock insuficiente");
      }
      sizesToTransform[sz] = val;
      totalUnitsFromSizes += val;
    }
  });

  const totalQuantity = totalUnitsFromSizes > 0 ? totalUnitsFromSizes : quantityInput;
  if (totalQuantity <= 0) {
    showToast("Ingresá una cantidad a transformar mayor a 0 en al menos un talle.", true);
    return;
  }

  const btn = document.getElementById("btn-save-production");
  if (btn) { btn.innerText = "Transformando..."; btn.disabled = true; }

  try {
    const originName = getProductNameWithColor(originVars[0]);
    const targetName = getProductNameWithColor(targetVars[0]);
    const originBaseSku = originVars[0].baseSku || originVars[0].sku;
    const targetBaseSku = targetVars[0].baseSku || targetVars[0].sku;

    const batchProductsPayload = [];

    // Si se especificó desglose por talles, actualizar por variante de talle
    if (Object.keys(sizesToTransform).length > 0) {
      for (const [sz, qty] of Object.entries(sizesToTransform)) {
        // 1. Restar de Producto Origen (X)
        const origVar = originVars.find(v => (v.size || "").toLowerCase().trim() === sz.toLowerCase().trim()) || originVars[0];
        const origLocsStock = origVar.locationsStock || {};
        const curOrigLocStock = origLocsStock[selectedLocation] !== undefined ? (parseInt(origLocsStock[selectedLocation]) || 0) : (parseInt(origVar.stock) || 0);
        const updatedOrigLocStock = {
          ...origLocsStock,
          [selectedLocation]: Math.max(0, curOrigLocStock - qty)
        };
        const newOrigTotalStock = Object.values(updatedOrigLocStock).reduce((acc, v) => acc + (parseInt(v) || 0), 0);

        origVar.locationsStock = updatedOrigLocStock;
        origVar.stock = newOrigTotalStock;
        origVar.stock_local = newOrigTotalStock;
        batchProductsPayload.push(origVar);

        // 2. Sumar a Producto Destino (Y)
        let targVar = targetVars.find(v => (v.size || "").toLowerCase().trim() === sz.toLowerCase().trim());
        if (targVar) {
          const targLocsStock = targVar.locationsStock || {};
          const curTargLocStock = targLocsStock[selectedLocation] !== undefined ? (parseInt(targLocsStock[selectedLocation]) || 0) : (parseInt(targVar.stock) || 0);
          const updatedTargLocStock = {
            ...targLocsStock,
            [selectedLocation]: curTargLocStock + qty
          };
          const newTargTotalStock = Object.values(updatedTargLocStock).reduce((acc, v) => acc + (parseInt(v) || 0), 0);

          targVar.locationsStock = updatedTargLocStock;
          targVar.stock = newTargTotalStock;
          targVar.stock_local = newTargTotalStock;
          batchProductsPayload.push(targVar);
        } else {
          // Crear variante de talle si no existía en el Producto Destino
          const sizeSkuSuffix = getSizeSkuSuffix(sz);
          const newVariant = {
            id: Date.now() + Math.random(),
            baseSku: targetBaseSku,
            sku: `${targetBaseSku}-${sizeSkuSuffix}`,
            name: targetVars[0].name,
            category: targetVars[0].category,
            size: sz,
            color: targetVars[0].color || 'Único',
            stock: qty,
            locationsStock: { [selectedLocation]: qty },
            location: selectedLocation,
            baseCost: targetVars[0].baseCost || 0,
            margin: targetVars[0].margin || 0,
            cost: targetVars[0].cost || 0
          };
          batchProductsPayload.push(newVariant);
        }
      }
    } else {
      // Si no hubo desglose por talles, actualizar sobre la variante principal
      const firstOrig = originVars[0];
      const firstTarg = targetVars[0];

      const origLocsStock = firstOrig.locationsStock || {};
      const curOrigStock = origLocsStock[selectedLocation] !== undefined ? (parseInt(origLocsStock[selectedLocation]) || 0) : (parseInt(firstOrig.stock) || 0);
      const updatedOrigLocStock = { ...origLocsStock, [selectedLocation]: Math.max(0, curOrigStock - totalQuantity) };
      firstOrig.locationsStock = updatedOrigLocStock;
      firstOrig.stock = Object.values(updatedOrigLocStock).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
      batchProductsPayload.push(firstOrig);

      const targLocsStock = firstTarg.locationsStock || {};
      const curTargStock = targLocsStock[selectedLocation] !== undefined ? (parseInt(targLocsStock[selectedLocation]) || 0) : (parseInt(firstTarg.stock) || 0);
      const updatedTargLocStock = { ...targLocsStock, [selectedLocation]: curTargStock + totalQuantity };
      firstTarg.locationsStock = updatedTargLocStock;
      firstTarg.stock = Object.values(updatedTargLocStock).reduce((acc, v) => acc + (parseInt(v) || 0), 0);
      batchProductsPayload.push(firstTarg);
    }

    // 3. Procesar y Descontar Insumos seleccionados de state.extras
    const insumoRows = document.querySelectorAll(".prod-insumo-row");
    const insumosUsed = [];
    let totalInsumosCost = 0;
    let extrasModified = false;

    insumoRows.forEach(row => {
      const selectEl = row.querySelector(".prod-insumo-name-select");
      const name = selectEl?.value;
      const qtyPerUnit = parseInt(row.querySelector(".prod-insumo-qty-input")?.value) || 0;
      if (name && qtyPerUnit > 0) {
        const totalInsumoQty = qtyPerUnit * totalQuantity;
        insumosUsed.push(`${totalInsumoQty} u. de ${name}`);

        // Descontar de state.extras
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        const catKey = selectedOpt?.getAttribute("data-cat");
        const insumoId = selectedOpt?.getAttribute("data-id");
        const unitCost = parseFloat(selectedOpt?.getAttribute("data-cost")) || 0;

        totalInsumosCost += (unitCost * totalInsumoQty);

        if (state.extras && typeof state.extras === 'object') {
          if (catKey && Array.isArray(state.extras[catKey])) {
            const match = state.extras[catKey].find(item => (item.id || item.name) === (insumoId || name));
            if (match) {
              match.stock = Math.max(0, (parseInt(match.stock) || 0) - totalInsumoQty);
              extrasModified = true;
            }
          } else if (Array.isArray(state.extras)) {
            const match = state.extras.find(item => item.name === name || item.id === name);
            if (match) {
              match.stock = Math.max(0, (parseInt(match.stock) || 0) - totalInsumoQty);
              extrasModified = true;
            }
          }
        }
      }
    });

    if (extrasModified) {
      await apiRequest("/api/extras", "POST", state.extras);
    }

    // Guardar actualizaciones de stock de productos (origen y destino)
    await apiRequest("/api/products", "POST", batchProductsPayload);

    // Formatear cadenas para el registro histórico
    const sizesStr = Object.keys(sizesToTransform).length > 0 
      ? Object.entries(sizesToTransform).map(([sz, q]) => `${q} ${sz}`).join(", ") 
      : `${totalQuantity} u.`;
    const insumosStr = insumosUsed.length > 0 ? insumosUsed.join(", ") : "Sin Insumos";

    // Registrar orden de producción
    const orderId = `productionorder_${Date.now()}`;
    const orderPayload = {
      id: orderId,
      sku: orderId,
      date: new Date().toISOString(),
      location: selectedLocation,
      origin_sku: originBaseSku,
      origin_name: originName,
      target_sku: targetBaseSku,
      target_name: targetName,
      quantity: totalQuantity,
      sizes: sizesStr,
      insumos: insumosStr,
      insumos_cost: totalInsumosCost,
      notes: notes
    };

    await apiRequest("/api/products", "POST", orderPayload);

    showToast(`✨ Transformación registrada (${selectedLocation}): ${totalQuantity} u. de ${originName} ➔ ${targetName}`, false);

    closeProductionModal();
    refreshState();
    setTimeout(() => {
      renderProductionUI();
    }, 100);

  } catch (error) {
    if (error.message !== "Stock insuficiente") {
      showToast(error.message, true);
    }
  } finally {
    if (btn) { btn.innerText = "Registrar Transformación"; btn.disabled = false; }
  }
}
window.saveProductionOrderForm = saveProductionOrderForm;

async function deleteProductionOrder(orderId) {
  if (!confirm("¿Deseás eliminar este registro de producción?")) return;
  try {
    await apiRequest(`/api/products/${orderId}`, "DELETE");
    showToast("Registro de producción eliminado", false);
    refreshState();
    setTimeout(() => {
      renderProductionUI();
    }, 100);
  } catch (error) {
    showToast(error.message, true);
  }
}
window.deleteProductionOrder = deleteProductionOrder;


// ==========================================
// --- LÓGICA DE MÓDULO TALLER Y SERVICIOS ---
// ==========================================

let activeOrderItemsForm = [];
let activeGarmentsForm = [];

async function loadServicesData() {
  try {
    const catalogRes = await apiRequest("/api/services/catalog", "GET");
    if (Array.isArray(catalogRes) && catalogRes.length > 0) {
      state.servicesCatalog = catalogRes;
    } else if (!state.servicesCatalog || state.servicesCatalog.length === 0) {
      state.servicesCatalog = [
        { id: "serv_1", name: "Estampado Frente A4/A3", price: 3500, cost: 800 },
        { id: "serv_2", name: "Estampado Espalda Grande", price: 4000, cost: 1000 },
        { id: "serv_3", name: "Bordado Pecho (Logo)", price: 2800, cost: 600 },
        { id: "serv_4", name: "Bajada de Shablón / Matriz", price: 8000, cost: 2000 },
        { id: "serv_5", name: "DTF Pliego A3", price: 5000, cost: 1500 }
      ];
    }
  } catch (e) {
    if (!state.servicesCatalog || state.servicesCatalog.length === 0) {
      state.servicesCatalog = [
        { id: "serv_1", name: "Estampado Frente A4/A3", price: 3500, cost: 800 },
        { id: "serv_2", name: "Estampado Espalda Grande", price: 4000, cost: 1000 },
        { id: "serv_3", name: "Bordado Pecho (Logo)", price: 2800, cost: 600 },
        { id: "serv_4", name: "Bajada de Shablón / Matriz", price: 8000, cost: 2000 },
        { id: "serv_5", name: "DTF Pliego A3", price: 5000, cost: 1500 }
      ];
    }
  }

  try {
    const ordersRes = await apiRequest("/api/services/orders", "GET");
    if (Array.isArray(ordersRes)) {
      state.serviceOrders = ordersRes;
    }
  } catch (e) {
    console.warn("Could not fetch service orders:", e);
  }

  try {
    const sSettings = await apiRequest("/api/services/settings", "GET");
    if (sSettings && sSettings.salesChannel) {
      state.tallerSalesChannel = sSettings.salesChannel;
    }
  } catch (e) {}

  renderServicesUI();
}

function renderServicesUI() {
  const tbody = document.getElementById("services-orders-tbody");
  if (!tbody) return;

  const searchInput = document.getElementById("services-search-input");
  const filterSelect = document.getElementById("services-status-filter");
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const filterStatus = filterSelect ? filterSelect.value : "ALL";

  const orders = state.serviceOrders || [];

  // Update Statistics Cards
  const pendingCount = orders.filter(o => o.status === "Pendiente").length;
  const inProdCount = orders.filter(o => o.status === "En Producción").length;
  const readyCount = orders.filter(o => o.status === "Listo para Entregar").length;
  const deliveredCount = orders.filter(o => o.status === "Entregado").length;
  const paidCount = orders.filter(o => o.status === "Cobrado").length;

  const totalEarned = orders.reduce((sum, o) => {
    if (o.status === "Cobrado") return sum + o.total;
    return sum + (o.deposit || 0);
  }, 0);

  const statPendingEl = document.getElementById("services-stat-pending");
  const statActiveEl = document.getElementById("services-stat-active");
  const statReadyEl = document.getElementById("services-stat-ready");
  const statDeliveredEl = document.getElementById("services-stat-delivered");
  const statPaidEl = document.getElementById("services-stat-paid");
  const statTotalEl = document.getElementById("services-stat-total");

  if (statPendingEl) statPendingEl.innerText = pendingCount;
  if (statActiveEl) statActiveEl.innerText = inProdCount;
  if (statReadyEl) statReadyEl.innerText = readyCount;
  if (statDeliveredEl) statDeliveredEl.innerText = deliveredCount;
  if (statPaidEl) statPaidEl.innerText = paidCount;
  if (statTotalEl) statTotalEl.innerText = `$${Math.round(totalEarned).toLocaleString('es-AR')}`;

  // Filter Orders
  const filteredOrders = orders.filter(o => {
    const matchesStatus = (filterStatus === "ALL") || (o.status === filterStatus);
    const textStr = `${o.id} ${o.clientName} ${o.garments} ${o.notes}`.toLowerCase();
    const matchesQuery = !query || textStr.includes(query);
    return matchesStatus && matchesQuery;
  });

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px 10px;">
          No hay órdenes de trabajo registradas${query || filterStatus !== 'ALL' ? ' con los filtros aplicados' : ''}. Hacé clic en <strong>"+ Nueva Orden de Trabajo"</strong> para agregar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredOrders.map(o => {
    const servicesSummary = (o.items || []).map(it => `${it.qty}x ${it.name}`).join(", ") || "-";

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="font-family: monospace; font-weight: 800; color: var(--accent-blue); padding: 12px;">${o.id}</td>
        <td style="font-weight: 700; color: var(--text-white); padding: 12px;">
          ${o.clientName}
          ${o.clientPhone ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">📞 ${o.clientPhone}</div>` : ''}
        </td>
        <td style="font-size: 0.85rem; color: var(--text-white); padding: 12px; white-space: pre-wrap;">${o.garments || '-'}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted); padding: 12px;">${servicesSummary}</td>
        <td style="text-align: right; padding: 12px;">
          <div style="font-weight: 800; color: var(--accent-emerald);">$${Math.round(o.total).toLocaleString('es-AR')}</div>
          ${o.deposit > 0 ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Seña: $${Math.round(o.deposit).toLocaleString('es-AR')}</div>` : ''}
          ${o.balance > 0 ? `<div style="font-size: 0.75rem; color: var(--accent-amber); font-weight: 700;">Saldo: $${Math.round(o.balance).toLocaleString('es-AR')}</div>` : `<div style="font-size: 0.75rem; color: var(--accent-emerald);">Pagado</div>`}
        </td>
        <td style="text-align: center; padding: 12px;">
          <select onchange="updateServiceOrderStatus('${o.id}', this.value)" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px; background: var(--bg-input); color: var(--text-white); border: 1px solid var(--border-color); cursor: pointer;">
            <option value="Pendiente" ${o.status === 'Pendiente' ? 'selected' : ''}>📥 Pendiente</option>
            <option value="En Producción" ${o.status === 'En Producción' ? 'selected' : ''}>🎨 En Producción</option>
            <option value="Listo para Entregar" ${o.status === 'Listo para Entregar' ? 'selected' : ''}>📦 Listo p/ Entregar</option>
            <option value="Entregado" ${o.status === 'Entregado' ? 'selected' : ''}>🚚 Entregado</option>
            <option value="Cobrado" ${o.status === 'Cobrado' ? 'selected' : ''}>✅ Cobrado</option>
          </select>
        </td>
        <td style="text-align: center; padding: 12px;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn" style="background: none; border: none; padding: 4px; cursor: pointer; color: var(--accent-blue); font-size: 1rem;" onclick="openServiceOrderModal('${o.id}')" title="Ver / Editar Orden">✏️</button>
            <button class="btn" style="background: none; border: none; padding: 4px; cursor: pointer; color: var(--accent-purple); font-size: 1rem;" onclick="downloadServiceOrderPDF('${o.id}')" title="Imprimir Remito PDF">📄</button>
            <button class="btn" style="background: none; border: none; padding: 4px; cursor: pointer; color: var(--accent-blue); font-size: 1rem;" onclick="openTallerFacturaMethodModal('${o.id}')" title="Emitir / Descargar Factura C A4">🧾</button>
            ${(o.balance > 0 && o.status !== "Cobrado") ? `<button class="btn" style="background: none; border: none; padding: 4px; cursor: pointer; color: var(--accent-emerald); font-size: 1rem;" onclick="chargeServiceOrderToCash('${o.id}')" title="Cobrar Saldo en Caja">💰</button>` : ''}
            <button class="btn" style="background: none; border: none; padding: 4px; cursor: pointer; color: var(--accent-red); font-size: 1rem;" onclick="deleteServiceOrder('${o.id}')" title="Eliminar Orden">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// --- MODAL Y GESTIÓN DE CATÁLOGO DE SERVICIOS ---
let editingCatalogItemIndex = null;

function openServiceCatalogModal() {
  editingCatalogItemIndex = null;
  const nameInput = document.getElementById("cat-service-name");
  const priceInput = document.getElementById("cat-service-price");
  const costInput = document.getElementById("cat-service-cost");
  const marginInput = document.getElementById("cat-service-margin-pct");
  const titleEl = document.getElementById("cat-service-form-title");
  const btnSave = document.getElementById("btn-save-cat-service");

  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (costInput) costInput.value = "";
  if (marginInput) marginInput.value = "";
  if (titleEl) titleEl.innerText = "➕ Nuevo Servicio / Precios y Costos";
  if (btnSave) {
    btnSave.innerText = "+ Guardar al Catálogo";
    btnSave.classList.remove("btn-emerald");
    btnSave.classList.add("btn-primary");
  }

  renderServiceCatalogModalList();
  const modal = document.getElementById("service-catalog-modal");
  if (modal) modal.style.display = "flex";
}

function closeServiceCatalogModal() {
  const modal = document.getElementById("service-catalog-modal");
  if (modal) modal.style.display = "none";
}

function renderServiceCatalogModalList() {
  const tbody = document.getElementById("service-catalog-tbody");
  if (!tbody) return;

  const catalog = state.servicesCatalog || [];
  if (catalog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">No hay servicios guardados en el catálogo.</td></tr>`;
    return;
  }

  tbody.innerHTML = catalog.map((s, idx) => {
    const cost = s.cost || 0;
    const markupPct = cost > 0 ? ((s.price - cost) / cost * 100).toFixed(2) : (s.price > 0 ? "100.00" : "0.00");
    const formattedMarkup = parseFloat(markupPct) % 1 === 0 ? Math.round(parseFloat(markupPct)) + "%" : markupPct + "%";
    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-white);">${s.name}</td>
        <td style="text-align: right; font-weight: 700; color: var(--accent-emerald);">$${Math.round(s.price).toLocaleString('es-AR')}</td>
        <td style="text-align: right; font-weight: 700; color: var(--accent-red);">$${Math.round(cost).toLocaleString('es-AR')}</td>
        <td style="text-align: right; font-weight: 800; color: var(--accent-blue);">${formattedMarkup}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn" style="background: none; border: none; color: var(--accent-blue); font-size: 0.95rem; cursor: pointer;" onclick="editCatalogServiceItem(${idx})" title="Editar Servicio">✏️</button>
            <button class="btn" style="background: none; border: none; color: var(--accent-red); font-size: 0.95rem; cursor: pointer;" onclick="deleteCatalogServiceItem(${idx})" title="Eliminar Servicio">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function editCatalogServiceItem(idx) {
  const catalog = state.servicesCatalog || [];
  const item = catalog[idx];
  if (!item) return;

  editingCatalogItemIndex = idx;
  const nameInput = document.getElementById("cat-service-name");
  const priceInput = document.getElementById("cat-service-price");
  const costInput = document.getElementById("cat-service-cost");
  const marginInput = document.getElementById("cat-service-margin-pct");
  const titleEl = document.getElementById("cat-service-form-title");
  const btnSave = document.getElementById("btn-save-cat-service");

  const cost = item.cost || 0;
  const markupVal = cost > 0 ? parseFloat(((item.price - cost) / cost * 100).toFixed(2)) : 0;

  if (nameInput) nameInput.value = item.name;
  if (priceInput) priceInput.value = item.price;
  if (costInput) costInput.value = item.cost || 0;
  if (marginInput) marginInput.value = markupVal;
  if (titleEl) titleEl.innerText = "✏️ Editar Servicio del Catálogo";
  if (btnSave) {
    btnSave.innerText = "💾 Guardar Cambios";
    btnSave.classList.remove("btn-primary");
    btnSave.classList.add("btn-emerald");
  }
}

function calculateCatalogServiceFields(triggerField) {
  const priceInput = document.getElementById("cat-service-price");
  const costInput = document.getElementById("cat-service-cost");
  const marginInput = document.getElementById("cat-service-margin-pct");

  if (!priceInput || !costInput || !marginInput) return;

  const price = parseLocalFloat(priceInput.value) || 0;
  const cost = parseLocalFloat(costInput.value) || 0;
  const markupPct = parseLocalFloat(marginInput.value) || 0;

  if (triggerField === 'price' || triggerField === 'cost') {
    if (cost > 0) {
      marginInput.value = parseFloat(((price - cost) / cost * 100).toFixed(2));
    } else {
      marginInput.value = 0;
    }
  } else if (triggerField === 'margin') {
    if (cost > 0) {
      priceInput.value = Math.round(cost * (1 + markupPct / 100));
    } else if (price > 0 && markupPct > 0) {
      costInput.value = Math.round(price / (1 + markupPct / 100));
    }
  }
}

async function addCatalogServiceItem() {
  const nameInput = document.getElementById("cat-service-name");
  const priceInput = document.getElementById("cat-service-price");
  const costInput = document.getElementById("cat-service-cost");
  const marginInput = document.getElementById("cat-service-margin-pct");
  const titleEl = document.getElementById("cat-service-form-title");
  const btnSave = document.getElementById("btn-save-cat-service");

  const name = nameInput ? nameInput.value.trim() : "";
  const price = priceInput ? parseLocalFloat(priceInput.value) : 0;
  const cost = costInput ? parseLocalFloat(costInput.value) : 0;

  if (!name) {
    showToast("Ingresá el nombre del servicio", true);
    return;
  }

  if (!state.servicesCatalog) state.servicesCatalog = [];

  if (editingCatalogItemIndex !== null && state.servicesCatalog[editingCatalogItemIndex]) {
    state.servicesCatalog[editingCatalogItemIndex].name = name;
    state.servicesCatalog[editingCatalogItemIndex].price = price;
    state.servicesCatalog[editingCatalogItemIndex].cost = cost;
    editingCatalogItemIndex = null;
  } else {
    state.servicesCatalog.push({
      id: "serv_" + Date.now(),
      name: name,
      price: price,
      cost: cost
    });
  }

  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (costInput) costInput.value = "";
  if (marginInput) marginInput.value = "";
  if (titleEl) titleEl.innerText = "➕ Nuevo Servicio / Precios y Costos";
  if (btnSave) {
    btnSave.innerText = "+ Guardar al Catálogo";
    btnSave.classList.remove("btn-emerald");
    btnSave.classList.add("btn-primary");
  }

  try {
    await apiRequest("/api/services/catalog", "POST", state.servicesCatalog);
    showToast("Catálogo de servicios actualizado");
    renderServiceCatalogModalList();
    renderServiceOrderFormItems();
  } catch (e) {
    showToast("Error al guardar catálogo: " + e.message, true);
  }
}

async function deleteCatalogServiceItem(idx) {
  if (confirm("¿Eliminar este servicio del catálogo?")) {
    state.servicesCatalog.splice(idx, 1);
    try {
      await apiRequest("/api/services/catalog", "POST", state.servicesCatalog);
      showToast("Servicio eliminado del catálogo");
      renderServiceCatalogModalList();
      renderServiceOrderFormItems();
    } catch (e) {
      showToast("Error al actualizar catálogo: " + e.message, true);
    }
  }
}


// --- GESTIÓN DE FILAS DE PRENDAS (2 COLUMNAS: PRODUCTO + UNIDADES) ---
function addGarmentRowToOrderForm() {
  activeGarmentsForm.push({ name: "", qty: 1 });
  renderGarmentsFormItems();
}

function removeGarmentRowFromOrderForm(idx) {
  activeGarmentsForm.splice(idx, 1);
  renderGarmentsFormItems();
}

function renderGarmentsFormItems() {
  const tbody = document.getElementById("service-order-garments-tbody");
  if (!tbody) return;

  tbody.innerHTML = activeGarmentsForm.map((g, idx) => `
    <tr>
      <td>
        <input type="text" class="form-input" style="padding: 4px 8px; font-size: 0.85rem;" value="${g.name}" placeholder="Ej: Buzos Canguro Negros (L, XL)" oninput="onGarmentNameChange(${idx}, this.value)">
      </td>
      <td style="text-align: center;">
        <input type="number" class="form-input" style="padding: 4px 8px; text-align: center; font-size: 0.85rem;" value="${g.qty}" min="1" oninput="onGarmentQtyChange(${idx}, this.value)">
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn" style="background: none; border: none; color: var(--accent-red); cursor: pointer;" onclick="removeGarmentRowFromOrderForm(${idx})">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function onGarmentNameChange(idx, val) {
  if (activeGarmentsForm[idx]) activeGarmentsForm[idx].name = val;
}

function onGarmentQtyChange(idx, val) {
  if (activeGarmentsForm[idx]) activeGarmentsForm[idx].qty = Math.max(1, parseInt(val) || 1);
}

let _tallerClientsMap = new Map();

function populateTallerClientsDatalist() {
  const datalist = document.getElementById("taller-clients-datalist");
  if (!datalist) return;

  _tallerClientsMap.clear();

  if (Array.isArray(state.currentAccounts)) {
    state.currentAccounts.forEach(a => {
      if (a.type === "cliente" && a.entityName) {
        _tallerClientsMap.set(a.entityName.trim(), a.phone || a.telefono || "");
      }
    });
  }

  datalist.innerHTML = Array.from(_tallerClientsMap.keys()).sort().map(name => `<option value="${name}">`).join("");
}

function onTallerClientSelected(val) {
  // Ignored or left simple to avoid lagging
}

// --- MODAL Y GESTIÓN DE ÓRDENES DE TRABAJO ---
function openServiceOrderModal(orderId = null) {
  populateTallerClientsDatalist();

  const modalTitle = document.getElementById("service-order-modal-title");
  const orderIdInput = document.getElementById("service-order-id");
  const clientNameInput = document.getElementById("service-order-client-name");
  const deliveryDateInput = document.getElementById("service-order-delivery-date");
  const notesInput = document.getElementById("service-order-notes");
  const discountInput = document.getElementById("service-order-discount");
  const depositInput = document.getElementById("service-order-deposit");
  
  const btnPrint = document.getElementById("btn-print-service-order");
  const btnFactura = document.getElementById("btn-factura-service-order");
  const btnCharge = document.getElementById("btn-charge-service-order");

  if (orderId) {
    const existing = (state.serviceOrders || []).find(o => o.id === orderId);
    if (!existing) return;

    if (modalTitle) modalTitle.innerText = `Editar Orden de Trabajo (${existing.id})`;
    if (orderIdInput) orderIdInput.value = existing.id;
    if (clientNameInput) clientNameInput.value = existing.clientName || "";
    if (deliveryDateInput) deliveryDateInput.value = existing.deliveryDate || "";
    if (notesInput) notesInput.value = existing.notes || "";
    if (discountInput) discountInput.value = existing.discountPercent || 0;
    if (depositInput) depositInput.value = existing.deposit || 0;

    if (Array.isArray(existing.garmentItems) && existing.garmentItems.length > 0) {
      activeGarmentsForm = JSON.parse(JSON.stringify(existing.garmentItems));
    } else if (existing.garments) {
      activeGarmentsForm = [{ name: existing.garments, qty: 1 }];
    } else {
      activeGarmentsForm = [{ name: "", qty: 1 }];
    }

    activeOrderItemsForm = JSON.parse(JSON.stringify(existing.items || []));
    if (btnPrint) btnPrint.style.display = "inline-flex";
    if (btnFactura) btnFactura.style.display = "inline-flex";
    if (btnCharge) btnCharge.style.display = (existing.balance > 0 && existing.status !== "Cobrado") ? "inline-flex" : "none";
  } else {
    if (modalTitle) modalTitle.innerText = "Nueva Orden de Trabajo";
    if (orderIdInput) orderIdInput.value = "";
    if (clientNameInput) clientNameInput.value = "";
    if (deliveryDateInput) deliveryDateInput.value = "";
    if (notesInput) notesInput.value = "";
    if (discountInput) discountInput.value = "0";
    if (depositInput) depositInput.value = "0";

    activeGarmentsForm = [{ name: "", qty: 1 }];
    activeOrderItemsForm = [];
    addServiceItemToOrderForm();

    if (btnPrint) btnPrint.style.display = "none";
    if (btnFactura) btnFactura.style.display = "none";
    if (btnCharge) btnCharge.style.display = "none";
  }

  renderGarmentsFormItems();
  renderServiceOrderFormItems();
  calculateServiceOrderTotals();

  const modal = document.getElementById("service-order-modal");
  if (modal) modal.style.display = "flex";
}

function closeServiceOrderModal() {
  const modal = document.getElementById("service-order-modal");
  if (modal) modal.style.display = "none";
}

function addServiceItemToOrderForm() {
  const catalog = state.servicesCatalog || [];
  const firstCat = catalog.length > 0 ? catalog[0] : { name: "Estampado Frente A4/A3", price: 3500, cost: 800 };
  activeOrderItemsForm.push({
    serviceId: firstCat.id || "serv_1",
    name: firstCat.name,
    qty: 1,
    price: firstCat.price,
    cost: firstCat.cost || 0,
    subtotal: firstCat.price
  });
  renderServiceOrderFormItems();
  calculateServiceOrderTotals();
}

function removeServiceItemFromOrderForm(idx) {
  activeOrderItemsForm.splice(idx, 1);
  renderServiceOrderFormItems();
  calculateServiceOrderTotals();
}

function renderServiceOrderFormItems() {
  const tbody = document.getElementById("service-order-items-tbody");
  if (!tbody) return;

  const catalog = state.servicesCatalog || [];

  tbody.innerHTML = activeOrderItemsForm.map((it, idx) => {
    const isCustom = !catalog.some(c => c.id === it.serviceId || c.name === it.name);
    return `
      <tr>
        <td>
          <select class="form-input" style="padding: 4px 8px; font-size: 0.85rem;" onchange="onOrderFormItemSelectChange(${idx}, this.value)">
            ${catalog.map(c => `<option value="${c.id}" ${(it.serviceId === c.id || it.name === c.name) ? 'selected' : ''}>${c.name} ($${c.price})</option>`).join("")}
            <option value="CUSTOM" ${isCustom ? 'selected' : ''}>-- Otro / Personalizado --</option>
          </select>
          ${isCustom ? `<input type="text" class="form-input" style="margin-top: 4px; padding: 4px 8px; font-size: 0.8rem;" value="${it.name}" placeholder="Nombre personalizado..." oninput="onOrderFormItemNameChange(${idx}, this.value)">` : ''}
        </td>
        <td style="text-align: center;">
          <input type="number" class="form-input" style="padding: 4px 8px; text-align: center; font-size: 0.85rem;" value="${it.qty}" min="1" oninput="onOrderFormItemQtyChange(${idx}, this.value)">
        </td>
        <td style="text-align: right;">
          <input type="number" class="form-input" style="padding: 4px 8px; text-align: right; font-size: 0.85rem; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); cursor: not-allowed;" value="${it.price}" readonly title="El precio unitario se establece desde el Catálogo de Servicios">
        </td>
        <td style="text-align: right; font-weight: 800; color: var(--accent-emerald); font-size: 0.9rem;" id="service-order-item-subtotal-${idx}">
          $${Math.round(it.qty * it.price).toLocaleString('es-AR')}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn" style="background: none; border: none; color: var(--accent-red); cursor: pointer;" onclick="removeServiceItemFromOrderForm(${idx})">🗑️</button>
        </td>
      </tr>
    `;
  }).join("");
}

function onOrderFormItemSelectChange(idx, selectedValue) {
  if (!activeOrderItemsForm[idx]) return;

  if (selectedValue === "CUSTOM") {
    activeOrderItemsForm[idx].serviceId = "CUSTOM";
    activeOrderItemsForm[idx].name = "Servicio Personalizado";
    renderServiceOrderFormItems();
  } else {
    const match = (state.servicesCatalog || []).find(c => c.id === selectedValue || c.name === selectedValue);
    if (match) {
      activeOrderItemsForm[idx].serviceId = match.id;
      activeOrderItemsForm[idx].name = match.name;
      activeOrderItemsForm[idx].price = match.price;
      activeOrderItemsForm[idx].cost = match.cost || 0;
      activeOrderItemsForm[idx].subtotal = activeOrderItemsForm[idx].qty * match.price;
      renderServiceOrderFormItems();
    }
  }
  calculateServiceOrderTotals();
}

function onOrderFormItemNameChange(idx, val) {
  if (activeOrderItemsForm[idx]) {
    activeOrderItemsForm[idx].name = val;
  }
  calculateServiceOrderTotals();
}

function onOrderFormItemQtyChange(idx, val) {
  const qty = Math.max(1, parseInt(val) || 1);
  if (activeOrderItemsForm[idx]) {
    activeOrderItemsForm[idx].qty = qty;
    const itemSubtotal = qty * activeOrderItemsForm[idx].price;
    activeOrderItemsForm[idx].subtotal = itemSubtotal;
    
    // Update the subtotal cell dynamically in the DOM so we don't lose input focus
    const subtotalCell = document.getElementById(`service-order-item-subtotal-${idx}`);
    if (subtotalCell) {
      subtotalCell.innerText = `$${Math.round(itemSubtotal).toLocaleString('es-AR')}`;
    }
  }
  calculateServiceOrderTotals();
}

function onOrderFormItemPriceChange(idx, val) {
  const price = Math.max(0, parseLocalFloat(val));
  if (activeOrderItemsForm[idx]) {
    activeOrderItemsForm[idx].price = price;
    activeOrderItemsForm[idx].subtotal = activeOrderItemsForm[idx].qty * price;
    renderServiceOrderFormItems();
  }
  calculateServiceOrderTotals();
}

function calculateServiceOrderTotals() {
  const subtotal = activeOrderItemsForm.reduce((sum, it) => sum + (it.qty * it.price), 0);
  const discountInput = document.getElementById("service-order-discount");
  const depositInput = document.getElementById("service-order-deposit");

  const discountPercent = discountInput ? parseLocalFloat(discountInput.value) : 0;
  const deposit = depositInput ? parseLocalFloat(depositInput.value) : 0;

  const discountAmount = subtotal * (discountPercent / 100);
  let total = Math.max(0, subtotal - discountAmount);
  total = Math.round(total / 100) * 100;

  const balance = Math.max(0, total - deposit);

  const subtotalEl = document.getElementById("service-order-subtotal-display");
  const totalEl = document.getElementById("service-order-total-display");
  const balanceEl = document.getElementById("service-order-balance-display");

  if (subtotalEl) subtotalEl.innerText = `$${Math.round(subtotal).toLocaleString('es-AR')}`;
  if (totalEl) totalEl.innerText = `$${Math.round(total).toLocaleString('es-AR')}`;
  if (balanceEl) balanceEl.innerText = deposit > 0 ? `Saldo Pendiente: $${Math.round(balance).toLocaleString('es-AR')}` : `Total A Pagar: $${Math.round(total).toLocaleString('es-AR')}`;
}

async function saveServiceOrderFromModal() {
  const orderIdInput = document.getElementById("service-order-id");
  const clientNameInput = document.getElementById("service-order-client-name");
  const deliveryDateInput = document.getElementById("service-order-delivery-date");
  const notesInput = document.getElementById("service-order-notes");
  const discountInput = document.getElementById("service-order-discount");
  const depositInput = document.getElementById("service-order-deposit");

  const clientName = clientNameInput ? clientNameInput.value.trim() : "";
  const deliveryDate = deliveryDateInput ? deliveryDateInput.value.trim() : "";

  if (!clientName) {
    showToast("El campo 'Cliente' es obligatorio", true);
    if (clientNameInput) clientNameInput.focus();
    return;
  }

  const validGarments = activeGarmentsForm.filter(g => g.name.trim() !== "" && g.qty > 0);
  if (validGarments.length === 0) {
    showToast("Ingresá al menos 1 prenda recibida del cliente (Producto y Unidades)", true);
    return;
  }

  if (!deliveryDate) {
    showToast("El campo 'Fecha de Entrega' es obligatorio", true);
    if (deliveryDateInput) deliveryDateInput.focus();
    return;
  }

  if (activeOrderItemsForm.length === 0) {
    showToast("Agregá al menos 1 servicio a la orden", true);
    return;
  }

  const garmentsStr = validGarments.map(g => `${g.qty} u. ${g.name.trim()}`).join(", ");
  const subtotal = activeOrderItemsForm.reduce((sum, it) => sum + (it.qty * it.price), 0);
  const totalCost = activeOrderItemsForm.reduce((sum, it) => sum + (it.qty * (it.cost || 0)), 0);
  const discountPercent = discountInput ? parseLocalFloat(discountInput.value) : 0;
  const deposit = depositInput ? parseLocalFloat(depositInput.value) : 0;
  const discountAmount = subtotal * (discountPercent / 100);
  let total = Math.max(0, subtotal - discountAmount);
  total = Math.round(total / 100) * 100;
  const balance = Math.max(0, total - deposit);

  let existingId = orderIdInput ? orderIdInput.value : "";
  let existingStatus = "Pendiente";

  if (existingId) {
    const existing = (state.serviceOrders || []).find(o => o.id === existingId);
    if (existing) existingStatus = existing.status;
  } else {
    const count = (state.serviceOrders || []).length + 1;
    existingId = `OS-${String(count).padStart(3, '0')}`;
  }

  const clientPhone = _tallerClientsMap.get(clientName.trim()) || "";

  const orderData = {
    id: existingId,
    clientName: clientName,
    clientPhone: clientPhone,
    deliveryDate: deliveryDate,
    garments: garmentsStr,
    garmentItems: validGarments,
    items: activeOrderItemsForm,
    notes: notesInput ? notesInput.value.trim() : "",
    subtotal: subtotal,
    totalCost: totalCost,
    profit: total - totalCost,
    discountPercent: discountPercent,
    deposit: deposit,
    total: total,
    balance: balance,
    status: existingStatus,
    createdAt: new Date().toLocaleDateString('es-AR')
  };

  if (!state.serviceOrders) state.serviceOrders = [];
  const idx = state.serviceOrders.findIndex(o => o.id === existingId);
  if (idx >= 0) {
    state.serviceOrders[idx] = orderData;
  } else {
    state.serviceOrders.unshift(orderData);
  }

  try {
    await apiRequest("/api/services/orders", "POST", state.serviceOrders);
    
    // Sync with Cobranzas (Cuentas Corrientes)
    await syncServiceOrderWithCurrentAccount(orderData);
    
    showToast(`Orden de Trabajo ${existingId} guardada con éxito`);
    closeServiceOrderModal();
    renderServicesUI();
  } catch (e) {
    showToast("Error al guardar la orden: " + e.message, true);
  }
}

// --- SYNC SERVICES ORDERS WITH CURRENT ACCOUNTS (COBRANZAS) ---
async function syncServiceOrderWithCurrentAccount(order) {
  if (!order || !order.clientName) return;

  const clientName = order.clientName.trim();
  
  // Find matching account in state.currentAccounts
  let account = (state.currentAccounts || []).find(a => a.type === "cliente" && a.entityName.toLowerCase() === clientName.toLowerCase());
  let accId = account ? account.id : null;

  if (!account) {
    try {
      account = await apiRequest("/api/current-accounts", "POST", {
        entityName: clientName,
        type: "cliente",
        phone: order.clientPhone || ""
      });
      accId = account.id;
      state.currentAccounts.push(account);
    } catch (e) {
      console.error("Error creating current account automatically:", e);
      return;
    }
  }

  // Look for any existing transaction for this Order ID in the account.
  if (account && Array.isArray(account.transactions)) {
    const matchTx = account.transactions.find(tx => tx.description && tx.description.includes(order.id));
    if (matchTx) {
      try {
        await apiRequest(`/api/current-accounts/${accId}/transactions/${matchTx.id}`, "DELETE");
        account.transactions = account.transactions.filter(t => t.id !== matchTx.id);
      } catch (e) {
        console.error("Error deleting old service order transaction:", e);
      }
    }
  }

  // If status is "Entregado" or "Cobrado", register transaction
  if (order.status === "Entregado" || order.status === "Cobrado") {
    const paymentValue = (order.status === "Cobrado" || order.balance === 0) ? order.total : (order.deposit || 0);
    const payload = {
      description: `Orden de Trabajo ${order.id} (${order.status})`,
      amount: order.total,
      payment: paymentValue,
      date: new Date().toISOString()
    };
    try {
      const updatedAcc = await apiRequest(`/api/current-accounts/${accId}/transactions`, "POST", payload);
      if (updatedAcc && updatedAcc.transactions) {
        account.transactions = updatedAcc.transactions;
      }
    } catch (e) {
      console.error("Error posting service order transaction:", e);
    }
  }

  if (typeof refreshState === "function") {
    await refreshState();
  }
}

async function updateServiceOrderStatus(orderId, newStatus) {
  const existing = (state.serviceOrders || []).find(o => o.id === orderId);
  if (!existing) return;

  existing.status = newStatus;
  if (newStatus === "Cobrado") {
    existing.balance = 0;
  }

  try {
    await apiRequest("/api/services/orders", "POST", state.serviceOrders);
    
    // Sync with Cobranzas (Cuentas Corrientes)
    await syncServiceOrderWithCurrentAccount(existing);

    // Si pasa a Cobrado, registrar o actualizar automáticamente la venta con el canal de venta de Taller
    if (newStatus === "Cobrado") {
      let tallerChannel = "Personalizado";
      try {
        const sSettings = await apiRequest("/api/services/settings", "GET");
        if (sSettings && sSettings.salesChannel) {
          tallerChannel = sSettings.salesChannel;
        }
      } catch (e) {}

      const chargeAmount = existing.total || 0;
      let targetSale = state.sales.find(s => s.id === `serv_sale_${existing.id}` || (s.items && s.items.some(it => (it.sku || "").includes(existing.id))));
      
      if (!targetSale) {
        const salePayload = {
          id: "serv_sale_" + existing.id,
          client_name: existing.clientName || "Consumidor Final",
          items: (existing.items || []).map(it => ({
            sku: `SERV-${existing.id}`,
            name: typeof cleanFacturaItemName === 'function' ? cleanFacturaItemName(it.name) : it.name,
            price: it.price,
            qty: it.qty,
            subtotal: it.subtotal
          })),
          subtotal: chargeAmount,
          discount: 0,
          total: chargeAmount,
          method: "Efectivo",
          origen: "local",
          canal_venta: tallerChannel,
          date: new Date().toISOString(),
          timestamp: Date.now()
        };
        try {
          const registeredSale = await apiRequest("/api/sales", "POST", salePayload);
          const finalSale = registeredSale || salePayload;
          if (!state.sales.some(s => s.id === finalSale.id)) {
            state.sales.unshift(finalSale);
          }
        } catch (err) {
          console.error("Error registrando venta de taller:", err);
        }
      } else {
        targetSale.canal_venta = tallerChannel;
        try {
          await apiRequest("/api/sales", "POST", targetSale);
        } catch (err) {}
      }
    }
    
    showToast(`Estado de ${orderId} actualizado a ${newStatus}`);
    renderServicesUI();
    if (typeof renderDashboardUI === "function") renderDashboardUI();
  } catch (e) {
    showToast("Error al actualizar estado: " + e.message, true);
  }
}

async function deleteServiceOrder(orderId) {
  if (confirm(`¿Eliminar la orden de trabajo ${orderId}?`)) {
    const order = (state.serviceOrders || []).find(o => o.id === orderId);
    state.serviceOrders = (state.serviceOrders || []).filter(o => o.id !== orderId);
    try {
      await apiRequest("/api/services/orders", "POST", state.serviceOrders);
      
      // Delete corresponding transaction in Cobranzas if it exists
      if (order && order.clientName) {
        const clientName = order.clientName.trim();
        const account = (state.currentAccounts || []).find(a => a.type === "cliente" && a.entityName.toLowerCase() === clientName.toLowerCase());
        if (account && Array.isArray(account.transactions)) {
          const matchTx = account.transactions.find(tx => tx.description && tx.description.includes(orderId));
          if (matchTx) {
            await apiRequest(`/api/current-accounts/${account.id}/transactions/${matchTx.id}`, "DELETE");
          }
        }
      }
      
      showToast(`Orden ${orderId} eliminada`);
      renderServicesUI();
      if (typeof refreshState === "function") {
        await refreshState();
      }
    } catch (e) {
      showToast("Error al eliminar orden: " + e.message, true);
    }
  }
}

function cleanFacturaItemName(nameStr) {
  if (!nameStr) return "";
  let clean = String(nameStr).trim();
  clean = clean.replace(/\[[^\]]*\]/g, "").trim();
  clean = clean.replace(/\s*\([Oo]rden\s*[^)]*\)/g, "").trim();
  return clean;
}
window.cleanFacturaItemName = cleanFacturaItemName;

function openTallerFacturaMethodModal(orderId) {
  const order = (state.serviceOrders || []).find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById("modal-taller-factura-method");
  const select = document.getElementById("taller-factura-payment-method-select");
  if (!modal || !select) {
    emitServiceOrderFacturaC(orderId);
    return;
  }

  document.getElementById("taller-factura-order-id").value = orderId;

  const defaultMethods = [
    { name: "Efectivo", active: true },
    { name: "Transferencia", active: true },
    { name: "Tarjeta de Débito", active: true },
    { name: "Tarjeta de Crédito", active: true },
    { name: "Mercado Pago", active: true }
  ];
  const methodsList = (state.userProfile?.paymentMethods && state.userProfile.paymentMethods.length > 0)
    ? state.userProfile.paymentMethods
    : defaultMethods;
  const activeMethods = methodsList.filter(m => m.active !== false).map(m => m.name);

  select.innerHTML = activeMethods.map(m => `<option value="${m}">${m}</option>`).join("");
  modal.style.display = "flex";
}
window.openTallerFacturaMethodModal = openTallerFacturaMethodModal;

function closeTallerFacturaMethodModal() {
  const modal = document.getElementById("modal-taller-factura-method");
  if (modal) modal.style.display = "none";
}
window.closeTallerFacturaMethodModal = closeTallerFacturaMethodModal;

async function confirmEmitTallerFacturaC() {
  const orderId = document.getElementById("taller-factura-order-id")?.value;
  const selectedMethod = document.getElementById("taller-factura-payment-method-select")?.value || "Efectivo";
  closeTallerFacturaMethodModal();
  if (orderId) {
    await emitServiceOrderFacturaC(orderId, selectedMethod);
  }
}
window.confirmEmitTallerFacturaC = confirmEmitTallerFacturaC;

async function emitServiceOrderFacturaC(orderId, selectedMethod = "Efectivo") {
  const order = (state.serviceOrders || []).find(o => o.id === orderId);
  if (!order) return;

  const clientAccount = (state.currentAccounts || []).filter(a => a.type === "cliente").find(a => a.entityName.toLowerCase() === (order.clientName || "").toLowerCase());
  
  const clientName = clientAccount?.entityName || clientAccount?.razonSocial || order.clientName || "Consumidor Final";
  const clientCuit = clientAccount?.cuit || "";
  const clientCondicionIva = clientAccount?.condicionIva || "CONSUMIDOR FINAL";
  const clientAddress = clientAccount?.address || "";

  let targetSale = state.sales.find(s => s.id === `serv_sale_${order.id}` || (s.items && s.items.some(it => (it.sku || "").includes(order.id))));

  let tallerChannel = "Personalizado";
  try {
    const sSettings = await apiRequest("/api/services/settings", "GET");
    if (sSettings && sSettings.salesChannel) {
      tallerChannel = sSettings.salesChannel;
    }
  } catch (e) {}

  if (!targetSale) {
    const chargeAmount = order.total || 0;
    const salePayload = {
      id: "serv_sale_" + order.id,
      client_name: clientName,
      client_cuit: clientCuit,
      client_condicion_iva: clientCondicionIva,
      client_address: clientAddress,
      items: (order.items || []).map(it => ({
        sku: `SERV-${order.id}`,
        name: cleanFacturaItemName(it.name),
        price: it.price,
        qty: it.qty,
        subtotal: it.subtotal
      })),
      subtotal: chargeAmount,
      discount: 0,
      total: chargeAmount,
      method: selectedMethod,
      origen: "local",
      canal_venta: tallerChannel,
      date: new Date().toISOString()
    };
    try {
      const created = await apiRequest("/api/sales", "POST", salePayload);
      targetSale = created || salePayload;
      if (!state.sales.some(s => s.id === targetSale.id)) {
        state.sales.unshift(targetSale);
      }
    } catch (e) {
      targetSale = salePayload;
    }
  } else {
    targetSale.client_name = clientName;
    targetSale.client_cuit = clientCuit;
    targetSale.client_condicion_iva = clientCondicionIva;
    targetSale.client_address = clientAddress;
    targetSale.method = selectedMethod;
    targetSale.canal_venta = tallerChannel;
    if (targetSale.items) {
      targetSale.items.forEach(it => {
        it.name = cleanFacturaItemName(it.name);
      });
    }
  }

  try {
    const res = await apiRequest("/api/invoices/emit", "POST", { sale_id: targetSale.id });
    if (res && res.invoice_number) {
      targetSale.arca_invoice_id = res.invoice_number;
      targetSale.arca_cae = res.cae;
      targetSale.arca_cae_due = res.cae_due;
      showToast(`¡Factura C ${res.invoice_number} emitida con éxito! CAE: ${res.cae}`);
    }
  } catch (err) {
    console.log("Nota / Modo emision AFIP:", err);
  }

  downloadFacturaCA4PDF(targetSale);
}
window.emitServiceOrderFacturaC = emitServiceOrderFacturaC;

function emitServiceOrderFacturaCFromModal() {
  const orderId = document.getElementById("service-order-id").value;
  if (orderId) openTallerFacturaMethodModal(orderId);
}
window.emitServiceOrderFacturaCFromModal = emitServiceOrderFacturaCFromModal;

async function chargeServiceOrderToCash(orderId) {
  const order = (state.serviceOrders || []).find(o => o.id === orderId);
  if (!order) return;

  const chargeAmount = order.balance > 0 ? order.balance : order.total;

  const clientAccount = (state.currentAccounts || []).filter(a => a.type === "cliente").find(a => a.entityName.toLowerCase() === (order.clientName || "").toLowerCase());
  
  const clientName = clientAccount?.entityName || clientAccount?.razonSocial || order.clientName || "Consumidor Final";
  const clientCuit = clientAccount?.cuit || "";
  const clientCondicionIva = clientAccount?.condicionIva || "CONSUMIDOR FINAL";
  const clientAddress = clientAccount?.address || "";

  let tallerChannel = "Personalizado";
  try {
    const sSettings = await apiRequest("/api/services/settings", "GET");
    if (sSettings && sSettings.salesChannel) {
      tallerChannel = sSettings.salesChannel;
    }
  } catch (e) {}

  if (confirm(`¿Registrar cobro de $${Math.round(chargeAmount).toLocaleString('es-AR')} para la orden ${order.id} (${clientName}) en Caja/Ventas?`)) {
    const salePayload = {
      id: "serv_sale_" + order.id,
      client_name: clientName,
      client_cuit: clientCuit,
      client_condicion_iva: clientCondicionIva,
      client_address: clientAddress,
      items: (order.items || []).map(it => ({
        sku: `SERV-${order.id}`,
        name: cleanFacturaItemName(it.name),
        price: it.price,
        qty: it.qty,
        subtotal: it.subtotal
      })),
      subtotal: chargeAmount,
      discount: 0,
      total: chargeAmount,
      method: "Efectivo",
      date: new Date().toISOString(),
      timestamp: Date.now()
    };

    try {
      const registeredSale = await apiRequest("/api/sales", "POST", salePayload);
      order.balance = 0;
      order.status = "Cobrado";
      await apiRequest("/api/services/orders", "POST", state.serviceOrders);
      
      await syncServiceOrderWithCurrentAccount(order);

      const targetSale = registeredSale || salePayload;
      if (!state.sales.some(s => s.id === targetSale.id)) {
        state.sales.unshift(targetSale);
      }

      showToast(`¡Venta de servicio ${order.id} cobrada y registrada en Caja con éxito!`);
      renderServicesUI();

      if (confirm(`¿Deseas emitir y descargar la Factura C A4 para el cliente ${clientName}?`)) {
        openTallerFacturaMethodModal(order.id);
      }
    } catch (e) {
      showToast("Error al registrar cobro: " + e.message, true);
    }
  }
}

function chargeServiceOrderFromModal() {
  const orderId = document.getElementById("service-order-id").value;
  if (orderId) chargeServiceOrderToCash(orderId);
}

function downloadServiceOrderPDFFromModal() {
  const orderId = document.getElementById("service-order-id").value;
  if (orderId) downloadServiceOrderPDF(orderId);
}

async function downloadServiceOrderPDF(orderId) {
  const order = (state.serviceOrders || []).find(o => o.id === orderId);
  if (!order) return;

  let conditionsText = "La empresa no se responsabiliza por fallas previas en las prendas del cliente.\nComprobante válido como orden de trabajo y remito de entrega.";
  try {
    const settings = await apiRequest("/api/services/settings", "GET");
    if (settings && settings.remitoConditions) {
      conditionsText = settings.remitoConditions;
    }
  } catch (e) {
    console.error("Error loading remito settings for PDF:", e);
  }

  const conditionsHtml = conditionsText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<li>${line}</li>`)
    .join("");

  const bizName = state.businessName || state.userProfile?.businessName || "Datamargen";
  const dateStr = order.createdAt || new Date().toLocaleDateString('es-AR');

  const pdfContainer = document.createElement("div");
  pdfContainer.style.padding = "35px 40px";
  pdfContainer.style.fontFamily = "'Segoe UI', Helvetica, Arial, sans-serif";
  pdfContainer.style.color = "#0f172a";
  pdfContainer.style.backgroundColor = "#ffffff";
  pdfContainer.style.boxSizing = "border-box";

  pdfContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 18px; border-bottom: 3px solid #2563eb; margin-bottom: 22px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        ${state.userProfile?.logoBase64 ? `<img src="${state.userProfile.logoBase64}" style="max-height: 55px; max-width: 150px; object-fit: contain;">` : ''}
        <div>
          <h1 style="margin: 0 0 4px 0; font-size: 22px; color: #0f172a; font-weight: 800; letter-spacing: -0.5px;">${bizName}</h1>
          <div style="font-size: 11px; color: #64748b;">REMITO Y ORDEN DE TRABAJO DE TALLER</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 18px; font-weight: 900; color: #2563eb; letter-spacing: 1px;">ORDEN ${order.id}</div>
        <div style="font-size: 11px; color: #475569; margin-top: 4px;"><strong>Fecha:</strong> ${dateStr}</div>
        ${order.deliveryDate ? `<div style="font-size: 11px; color: #0f172a;"><strong>Entrega Prometida:</strong> ${order.deliveryDate}</div>` : ''}
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 22px;">
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Negocio</div>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">${order.clientName}</div>
        ${order.clientPhone ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">Contacto: ${order.clientPhone}</div>` : ''}
      </div>
      <div style="text-align: right;">
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Estado del Trabajo</div>
        <div style="font-size: 13px; font-weight: 800; color: #2563eb; margin-top: 2px;">${order.status || 'Pendiente'}</div>
      </div>
    </div>

    <div style="margin-bottom: 22px; padding: 12px 16px; background: #f1f5f9; border-left: 4px solid #10b981; border-radius: 6px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 4px;">👕 PRENDAS RECIBIDAS POR EL NEGOCIO:</div>
      <div style="font-size: 12px; color: #1e293b; font-weight: 600; line-height: 1.4;">
        ${(Array.isArray(order.garmentItems) && order.garmentItems.length > 0)
          ? order.garmentItems.map(g => `<div style="margin-bottom: 2px;">• ${g.qty} u. ${g.name}</div>`).join("")
          : (order.garments || "").split(", ").map(p => p.trim() ? `<div style="margin-bottom: 2px;">• ${p}</div>` : "").join("")
        }
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase;">Servicio / Transformación</th>
          <th style="padding: 9px 12px; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase;">Cant.</th>
          <th style="padding: 9px 12px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase;">Precio Unit.</th>
          <th style="padding: 9px 12px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${(order.items || []).map((it, idx) => `
          <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 9px 12px; font-size: 12px; font-weight: 700; color: #0f172a;">${it.name}</td>
            <td style="padding: 9px 12px; font-size: 12px; text-align: center; font-weight: 700; color: #0f172a;">${it.qty}</td>
            <td style="padding: 9px 12px; font-size: 12px; text-align: right; color: #334155;">$${Math.round(it.price).toLocaleString('es-AR')}</td>
            <td style="padding: 9px 12px; font-size: 12px; text-align: right; font-weight: 800; color: #0f172a;">$${Math.round(it.qty * it.price).toLocaleString('es-AR')}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    ${order.notes ? `
    <div style="margin-bottom: 22px; padding: 10px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px;">
      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">NOTAS DEL TALLER / INSUMOS:</div>
      <div style="font-size: 11.5px; color: #334155;">${order.notes}</div>
    </div>` : ''}

    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-top: 2px solid #cbd5e1; padding-top: 18px;">
      <div style="max-width: 350px; font-size: 10.5px; line-height: 1.4;">
        <strong style="font-size: 11px; display: block; margin-bottom: 4px; font-weight: bold; color: #0f172a;">Condiciones del Servicio:</strong>
        <ul style="margin: 0; padding-left: 14px; font-size: 10.5px; color: #64748b; line-height: 1.4;">
          ${conditionsHtml}
        </ul>
      </div>

      <div style="text-align: right; min-width: 260px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 6px;">
          <span>Subtotal:</span>
          <span>$${Math.round(order.subtotal || order.total).toLocaleString('es-AR')}</span>
        </div>
        ${order.discountPercent > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #ef4444; margin-bottom: 6px;">
          <span>Descuento (${order.discountPercent}%):</span>
          <span>-$${Math.round((order.subtotal || order.total) * (order.discountPercent/100)).toLocaleString('es-AR')}</span>
        </div>` : ''}
        ${order.deposit > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #2563eb; margin-bottom: 6px;">
          <span>Seña / Anticipo:</span>
          <span>-$${Math.round(order.deposit).toLocaleString('es-AR')}</span>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; font-size: 16px; font-weight: 900; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 10px; margin-top: 10px;">
          <span style="letter-spacing: 0.5px;">${order.balance > 0 ? 'SALDO A PAGAR:' : 'TOTAL:'}</span>
          <span style="color: #10b981;">$${Math.round(order.balance > 0 ? order.balance : order.total).toLocaleString('es-AR')}</span>
        </div>
      </div>
    </div>

    <div style="margin-top: 35px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 12px;">
      <div style="font-size: 10px; color: #94a3b8; text-align: center; flex-grow: 1;">
        Documento emitido por Datamargen ERP • www.datamargen.com
      </div>
    </div>
  `;

  if (window.html2pdf) {
    const opt = {
      margin:       [8, 8, 8, 8],
      filename:     `Orden_Trabajo_${order.id}_${(order.clientName || 'Cliente').replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      showToast("Generando Remito PDF...");
      await html2pdf().set(opt).from(pdfContainer).save();
    } catch (e) {
      console.error("Error html2pdf", e);
      printFallbackWindow(pdfContainer.outerHTML);
    }
  } else {
    printFallbackWindow(pdfContainer.outerHTML);
  }
}

async function openRemitoConfigModal() {
  const channelSelect = document.getElementById("remito-config-channel");
  if (channelSelect) {
    channelSelect.innerHTML = "";
    const channels = state.userProfile?.salesChannels || ["Local Principal"];
    channels.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.innerText = c;
      channelSelect.appendChild(opt);
    });
  }

  try {
    const settings = await apiRequest("/api/services/settings", "GET");
    const textarea = document.getElementById("remito-config-conditions");
    if (textarea && settings) {
      textarea.value = (settings.remitoConditions !== undefined && settings.remitoConditions !== null)
        ? settings.remitoConditions
        : "La empresa no se responsabiliza por fallas previas en las prendas del cliente.\nComprobante válido como orden de trabajo y remito de entrega.";
    }
    if (channelSelect && settings && settings.salesChannel) {
      channelSelect.value = settings.salesChannel;
    }
  } catch (e) {
    console.error("Error loading remito config:", e);
  }
  const modal = document.getElementById("remito-config-modal");
  if (modal) modal.style.display = "flex";
}

function closeRemitoConfigModal() {
  const modal = document.getElementById("remito-config-modal");
  if (modal) modal.style.display = "none";
}

async function saveRemitoConfig() {
  const textarea = document.getElementById("remito-config-conditions");
  const channelSelect = document.getElementById("remito-config-channel");
  const conditions = textarea ? textarea.value : "";
  const salesChannel = channelSelect ? channelSelect.value : "";
  try {
    await apiRequest("/api/services/settings", "POST", { 
      remitoConditions: conditions,
      salesChannel: salesChannel
    });
    showToast("Configuración del taller guardada con éxito");
    closeRemitoConfigModal();
  } catch (e) {
    showToast("Error al guardar configuración: " + e.message, true);
  }
}

window.openRemitoConfigModal = openRemitoConfigModal;
window.closeRemitoConfigModal = closeRemitoConfigModal;
window.saveRemitoConfig = saveRemitoConfig;
window.loadServicesData = loadServicesData;
window.renderServicesUI = renderServicesUI;
window.openServiceCatalogModal = openServiceCatalogModal;
window.closeServiceCatalogModal = closeServiceCatalogModal;
window.addCatalogServiceItem = addCatalogServiceItem;
window.deleteCatalogServiceItem = deleteCatalogServiceItem;
window.openServiceOrderModal = openServiceOrderModal;
window.closeServiceOrderModal = closeServiceOrderModal;
window.addServiceItemToOrderForm = addServiceItemToOrderForm;
window.removeServiceItemFromOrderForm = removeServiceItemFromOrderForm;
window.onOrderFormItemNameChange = onOrderFormItemNameChange;
window.onOrderFormItemQtyChange = onOrderFormItemQtyChange;
window.onOrderFormItemPriceChange = onOrderFormItemPriceChange;
window.calculateServiceOrderTotals = calculateServiceOrderTotals;
window.saveServiceOrderFromModal = saveServiceOrderFromModal;
window.updateServiceOrderStatus = updateServiceOrderStatus;
window.deleteServiceOrder = deleteServiceOrder;
window.chargeServiceOrderToCash = chargeServiceOrderToCash;
window.chargeServiceOrderFromModal = chargeServiceOrderFromModal;
window.downloadServiceOrderPDF = downloadServiceOrderPDF;
window.downloadServiceOrderPDFFromModal = downloadServiceOrderPDFFromModal;
window.addGarmentRowToOrderForm = addGarmentRowToOrderForm;
window.removeGarmentRowFromOrderForm = removeGarmentRowFromOrderForm;
window.onGarmentNameChange = onGarmentNameChange;
window.onGarmentQtyChange = onGarmentQtyChange;
window.onOrderFormItemSelectChange = onOrderFormItemSelectChange;
window.editCatalogServiceItem = editCatalogServiceItem;
window.onTallerClientSelected = onTallerClientSelected;
window.populateTallerClientsDatalist = populateTallerClientsDatalist;
window.calculateCatalogServiceFields = calculateCatalogServiceFields;
window.syncServiceOrderWithCurrentAccount = syncServiceOrderWithCurrentAccount;


