console.log("SCRIPT LOADED");
/* ============================================================
   RetailTrend — script.js
   Complete JavaScript Engine for the Analytics Dashboard

   Sections:
   1.  Auth / Session Guard
   2.  Navigation (sidebar sections)
   3.  Product Management (add, load, clear)
   4.  Stats Cards (overview counters)
   5.  Chart.js Rendering (line, pie, bar)
   6.  Market Insights Analyzer
   7.  FakeStoreAPI — Market Trends
   8.  Demand Forecast Engine
   9.  AI Chatbot (floating widget + full-page)
   10. Logout
   11. Utilities (toast, etc.)
   12. Bootstrap / Init
============================================================ */
/* ============================================================
   SUPABASE CONNECTION
============================================================ */

const supabaseUrl = "https://jxwsumcnvdzxipysyqtn.supabase.co";   // replace if needed
const supabaseKey = "sb_publishable_OtIyP7HLqu-lsMhgq5hzfw_bgzmtbQs";  // copy from API Keys

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
const API_URL = "https://retailtrend.onrender.com/api/ai";
/* ============================================================
   1. AUTH / SESSION GUARD
   Redirect to login page if no active session found
============================================================ */
async function sessionGuard(){

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user){
    window.location.href = "index.html";
    return;
  }

  // show user name
  const name = user?.user_metadata?.full_name || user?.email || "User";

  const navUser = document.getElementById("navbar-username");
  if (navUser)navUser.textContent = name;

  const sidebarName = document.getElementById("sidebar-name");
  if (sidebarName)sidebarName.textContent = name;

  const avatar = document.getElementById("sidebar-avatar");
  if (avatar)avatar.textContent = name[0].toUpperCase();

}

/* ============================================================
   2. NAVIGATION — Switch between dashboard sections
============================================================ */

// Page meta data for each section
const PAGE_META = {
  dashboard: { title: 'Dashboard',        subtitle: 'Overview & Sales Analytics' },
  products:  { title: 'Products',         subtitle: 'Manage your product sales data' },
  sales: { title: 'Sales', subtitle: 'Record store transactions' },
  analytics: { title: 'Sales Analytics',  subtitle: 'Visual charts and performance metrics' },
  market:    { title: 'Market Trends',    subtitle: 'Live market data & demand forecasts' },
  ai:        { title: 'AI Assistant',     subtitle: 'Ask questions about your store data' },
};

/**
 * showSection(name)— Activates a content section and updates nav state
 * @param {string} name — Section identifier key
 */
function showSection(name){
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show selected section
  const section = document.getElementById('section-' + name);
  if (section)section.classList.add('active');

  // Activate nav item
  const nav = document.getElementById('nav-' + name);
  if (nav)nav.classList.add('active');

  // Update navbar title and subtitle
  const meta = PAGE_META[name] || {};
  document.getElementById('navbar-title').textContent    = meta.title    || name;
  document.getElementById('navbar-subtitle').textContent = meta.subtitle || '';

  // Lazy-load section-specific logic
  if (name === 'analytics')  refreshCharts();
  if (name === 'market')     { fetchMarketTrends(); updateForecast(); }
  if (name === 'dashboard')  refreshDashboard();
}


/* ============================================================
   3. PRODUCT MANAGEMENT
   localStorage key: 'rt_products' — array of product objects
   Each product: { product_name, category, sales (number), date }
============================================================ */

// ===== FETCH PRODUCTS FROM SUPABASE =====
/* ============================================================
   PRODUCT MANAGEMENT — SUPABASE DATABASE
============================================================ */

async function getCurrentUser(){
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

async function getProducts(){

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user){
    console.warn("No user session found");
    return [];
  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error){
    console.error("Error fetching products:", error);
    return [];
  }

 return data.map(p => ({
  id: p.id,
  name: p.product_name,
  category: p.category,
  stock: Number(p.stock),
  price: Number(p.price || 0),
  date: p.created_at ? p.created_at.split("T")[0] : null
}));
}

async function loadSalesProducts(){

  const products = await getProducts();
  const select = document.getElementById("sale-product");

  if(!select) return;

  select.innerHTML = products.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join("");
}

async function clearProductsDB() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("User not logged in");
    return;
  }

  // 🔥 STEP 1: DELETE SALES FIRST
  const { error: salesError } = await supabaseClient
    .from("sales")
    .delete()
    .eq("user_id", user.id);

  if (salesError) {
    console.error("Sales delete error:", salesError);
    return;
  }

  // 🔥 STEP 2: DELETE PRODUCTS
  const { error: productError } = await supabaseClient
    .from("products")
    .delete()
    .eq("user_id", user.id);

  if (productError) {
    console.error("Product delete error:", productError);
    return;
  }

  console.log("All data cleared");

  await renderProductTable();
  await loadSalesProducts();
  refreshDashboard();
}


async function clearSalesDB() {

  const confirmClear = confirm("⚠ Are you sure you want to delete all sales?");
  if (!confirmClear) return;

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("User not logged in");
    return;
  }

  const { error } = await supabaseClient
    .from("sales")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("Delete sales error:", error);
    alert("❌ Failed to clear sales");
    return;
  }

  alert("✅ All sales cleared");

  // 🔥 refresh everything
  refreshDashboard();
}

async function getSalesAnalytics(){

  const { data: { user } } = await supabaseClient.auth.getUser();

  const { data, error } = await supabaseClient
    .from("sales")
    .select(`
      quantity,
      total_price,
      sale_date,
      products ( product_name, category, price )
    `)
    .eq("user_id", user.id);

  if(error){
    console.error(error);
    return [];
  }

  return data || [];
}

async function recordSale(productId, quantity){

  const user = await getCurrentUser();

  if(!productId || !quantity || quantity <= 0){
    showToast("Invalid quantity","error");
    return;
  }

  const { data: product, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if(error || !product){
    console.error(error);
    showToast("Product not found","error");
    return;
  }

  const totalPrice = quantity * (product.price || 0);

  // ✅ STEP 1: SAFE STOCK UPDATE
  const { error: updateError } = await supabaseClient
    .from("products")
    .update({ stock: product.stock - quantity })
    .eq("id", productId)
    .gte("stock", quantity);

  if(updateError){
    showToast("Not enough stock","error");
    return;
  }

  // ✅ STEP 2: INSERT SALE
  const { error: saleError } = await supabaseClient
    .from("sales")
    .insert([
      {
        product_id: productId,
        quantity,
        total_price: totalPrice,
        user_id: user.id
      }
    ]);

  // 🚨 STEP 3: ROLLBACK IF INSERT FAILS
  if(saleError){
    console.error(saleError);

    // rollback stock
    await supabaseClient
      .from("products")
      .update({ stock: product.stock })
      .eq("id", productId);

    showToast("Sale failed (rolled back)","error");
    return;
  }

  showToast("Sale recorded","success");

  refreshDashboard();
  await loadSalesHistory();
}


async function recordSaleFromForm(){

  const user = await getCurrentUser();

  const productId = document.getElementById("sale-product").value;
  const qty = parseInt(document.getElementById("sale-qty").value);
  const date = document.getElementById("sale-date").value;

  if(!productId || !qty || qty <= 0){
    showToast("Enter valid quantity","error");
    return;
  }

  const { data: product, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if(error || !product){
    console.error(error);
    showToast("Product not found","error");
    return;
  }

  const totalPrice = qty * (product.price || 100); // fallback price

  // ✅ STEP 1: STOCK UPDATE
  const { error: updateError } = await supabaseClient
    .from("products")
    .update({ stock: product.stock - qty })
    .eq("id", productId)
    .gte("stock", qty);

  if(updateError){
    showToast("Not enough stock","error");
    return;
  }

  // ✅ STEP 2: INSERT SALE
  const { error: saleError } = await supabaseClient
    .from("sales")
    .insert([
      {
        product_id: productId,
        quantity: qty,
        total_price: totalPrice,
        sale_date: date,
        user_id: user.id
      }
    ]);

  // 🚨 STEP 3: ROLLBACK IF FAILS
  if(saleError){
    console.error(saleError);

    await supabaseClient
      .from("products")
      .update({ stock: product.stock })
      .eq("id", productId);

    showToast("Sale failed (rolled back)","error");
    return;
  }

  showToast("Sale recorded","success");

  await loadSalesHistory();
  refreshDashboard();
}


/**
 * addProduct()— Reads form fields, validates, saves to localStorage
 * then refreshes charts and stats
 */
async function addProduct(){

  const user = await getCurrentUser();

  const name = document.getElementById("prod-name").value;
  const category = document.getElementById("prod-category").value;
  const stock = parseInt(document.getElementById("prod-sales").value);
  const price = parseFloat(document.getElementById("prod-price")?.value || 0);
  const date = document.getElementById("prod-date").value;

  if(!name || !category || !stock){
    showToast("Fill all fields","error");
    return;
  }

  await supabaseClient.from("products").insert([
    {
      user_id: user.id,
      product_name: name,
      category,
      stock,
      price,
      created_at: new Date(date).toISOString()
    }
  ]);

  showToast("Product added","success");

  await renderProductTable();
  await loadSalesProducts();   // ✅ ADD THIS
  await updateStatsCards();
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-category").value = "";
  document.getElementById("prod-sales").value = "";
  document.getElementById("prod-price").value = "";
}

/**
 * renderProductTable()— Renders the product data table from localStorage
 */

async function renderProductTable(){
  const products = await getProducts();
  const tbody    = document.getElementById('product-table-body');
  const countEl  = document.getElementById('product-count');

  if (countEl)countEl.textContent = products.length;

  if (!tbody)return;

  if (products.length === 0){
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <p>No products added yet. Use the form above to add your first product!</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Category badge colors cycle
  const categoryColors = {
    'Electronics': 'badge-blue',
    'Clothing':    'badge-purple',
    'Accessories': 'badge-orange',
    'Home & Living':'badge-green',
    'Beauty':      'badge-pink',
    'Sports':      'badge-blue',
    'Books':       'badge-purple',
    'Food & Beverage':'badge-green',
    'Toys':        'badge-orange',
    'Other':       'badge-blue',
  };

  // Sort by date descending (most recent first)
  const sorted = [...products].sort((a, b)=> new Date(b.date)- new Date(a.date));

  tbody.innerHTML = sorted.map((p, i)=> `
  <tr>
    <td style="color:#94a3b8; font-weight:600;">${i + 1}</td>

    <td style="font-weight:600; color:#0f172a;">
      ${escapeHTML(p.name)}
    </td>

    <td>
      <span class="badge ${categoryColors[p.category] || 'badge-blue'}">
        ${escapeHTML(p.category)}
      </span>
    </td>

    <!-- ✅ STOCK -->
    <td style="font-weight:700; color:#2563eb;">
      ${p.stock}
    </td>

    <!-- ✅ PRICE -->
    <td style="font-weight:700; color:#16a34a;">
      ₹${new Intl.NumberFormat('en-IN').format(p.price)}
    </td>

    <!-- ✅ DATE -->
    <td style="color:#64748b;">
      ${formatDate(p.date)}
    </td>
  </tr>
`).join('');
}

async function renderProductPerformance() {
  const sales = await getSalesAnalytics();

  const map = {};

  sales.forEach(s => {
    const name = s.products?.product_name;
    if (!name) return;

    map[name] = (map[name] || 0) + s.quantity;
  });

  renderBarChart(
    "productBarChart",   // make sure canvas id matches
    Object.keys(map),
    Object.values(map)
  );
}


async function loadSalesHistory(){

  const user = await getCurrentUser();   // ✅ ADD THIS

  const { data, error } = await supabaseClient
    .from("sales")
    .select(`
      id,
      quantity,
      total_price,
      sale_date,
      products ( product_name, price )
    `)
    .eq("user_id", user.id)
    .order("sale_date", { ascending:false });

  if(error){
    console.error(error);
    return;
  }

  const tbody = document.getElementById("sales-table-body");
  const count = document.getElementById("sales-count");

  if(!tbody) return;

  count.textContent = data?.length || 0;

  if(!data || data.length === 0){
    tbody.innerHTML = `<tr><td colspan="5">No sales</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((s,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${formatDate(s.sale_date)}</td>
      <td>${escapeHTML(s.products?.product_name)}</td>
      <td>${s.quantity}</td>
      <td>₹${new Intl.NumberFormat('en-IN').format(s.total_price)}</td>
    </tr>
  `).join("");
}


/** Clear all products (with confirmation)*/
async function clearProducts(){

  if (!confirm("Delete all product data?"))return;

  await clearProductsDB();

  await renderProductTable();
  await updateInsights();
  await updateForecast();

  refreshCharts();

  showToast("All data cleared", "error");
}

/* ============================================================
   4. STATS CARDS (Overview counters)
============================================================ */

/**
 * updateStatsCards()— Reads product data and updates the 4 overview cards
 */
async function updateStatsCards(){

  const user = await getCurrentUser();
  if (!user) return;

  // Fetch safely
  const { data: products, error: prodError } = await supabaseClient
    .from("products")
    .select("*")
    .eq("user_id", user.id);

  const sales = await getSalesAnalytics();

  // SAFE FALLBACKS
  const productCount = products?.length || 0;
  const totalUnits = (sales || []).reduce((s,x)=> s + (x.quantity || 0), 0);

  document.getElementById('stat-total-products').textContent = productCount;
  document.getElementById('stat-total-sales').textContent = totalUnits;

  // ---- TOP PRODUCT ----
  const productMap = {};

  sales.forEach(s=>{
    const name = s.products?.product_name;
    if (!name) return;

    productMap[name] = (productMap[name] || 0) + s.quantity;
  });

  const topProductEntry = Object.entries(productMap)
    .sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('stat-best-product').textContent =
    topProductEntry ? topProductEntry[0] : "—";

  // ---- TOP CATEGORY ----
  const categoryMap = {};

  sales.forEach(s=>{
    const cat = s.products?.category;
    if (!cat) return;

    categoryMap[cat] = (categoryMap[cat] || 0) + s.quantity;
  });

  const topCategoryEntry = Object.entries(categoryMap)
    .sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('stat-top-category').textContent =
    topCategoryEntry ? topCategoryEntry[0] : "—";
}


/* ============================================================
   5. CHART.JS — Sales analytics charts
   Charts: salesTrendChart, categoryPieChart, productBarChart
             dashMiniChart (line), dashPieChart (pie)
============================================================ */

// Chart instance references (to destroy before re-render)
const chartInstances = {};

// Shared color palette
const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#db2777', '#8b5cf6', '#0ea5e9', '#84cc16'
];

/**
 * renderLineChart(canvasId, labels, data, label)— Renders a line chart
 */
function renderLineChart(canvasId, labels, data, label){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        fill: true,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        pointBackgroundColor: '#2563eb',
        pointRadius: 5,
        tension: 0.4,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });

  chartInstances[canvasId] = chart;

  // 🔥 IMPORTANT LINE (THIS FIXES PDF)
  window[canvasId + "_instance"] = chart;
}


/**
 * renderPieChart(canvasId, labels, data)— Renders a doughnut/pie chart
 */
function renderPieChart(canvasId, labels, data){
  const canvas = document.getElementById(canvasId);
  if (!canvas)return;

  if (chartInstances[canvasId]){
    chartInstances[canvasId].destroy();
  }

  // Show empty state if no data
  if (data.length === 0){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('Add products to see category data', canvas.width / 2, canvas.height / 2);
    return;
  }

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, data.length),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: 'easeOutQuart'
      },
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#64748b',
            padding: 14,
            font: { size: 12 },
            boxWidth: 12,
            boxHeight: 12,
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(ctx){
              const total = ctx.dataset.data.reduce((a, b)=> a + b, 0);
              const pct   = total > 0 ? Math.round(ctx.parsed / total * 100): 0;
              return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} units (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * renderBarChart(canvasId, labels, data)— Renders a bar chart
 */
function renderBarChart(canvasId, labels, data){
  const canvas = document.getElementById(canvasId);
  if (!canvas)return;

  if (chartInstances[canvasId]){
    chartInstances[canvasId].destroy();
  }

  // Limit to top 10 products for readability
  const combined = labels.map((l, i)=> ({ label: l, value: data[i] }));
  combined.sort((a, b)=> b.value - a.value);
  const top10 = combined.slice(0, 10);

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top10.map(p => p.label),
      datasets: [{
        label: 'Sales Count',
        data: top10.map(p => p.value),
        backgroundColor: CHART_COLORS.slice(0, top10.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 12,
          cornerRadius: 8,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            maxRotation: 40,
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });
}

async function renderMonthlyChart(){

  const sales = await getSalesAnalytics();

  if (!sales || sales.length === 0) return;

  const map = {};

  sales.forEach(s => {
    const date = new Date(s.sale_date);
    const month = date.toISOString().slice(0,7);

    map[month] = (map[month] || 0) + s.quantity;
  });

  const labels = Object.keys(map).sort();
  const data = labels.map(m => map[m]);

  renderLineChart(
    "monthlySalesChart",
    labels,
    data,
    "Monthly Sales"
  );
}


async function renderCategoryGrowth(){

  const sales = await getSalesAnalytics();

  const map = {};

  sales.forEach(s=>{
    const cat = s.products?.category || "Other";
    map[cat] = (map[cat] || 0) + s.quantity;
  });

  renderBarChart(
    "categoryGrowthChart",
    Object.keys(map),
    Object.values(map)
  );
}

/**
 * refreshCharts()— Builds chart data from localStorage and re-renders all charts
 */
async function refreshCharts(){

  const user = await getCurrentUser();

  const { data: sales } = await supabaseClient
    .from("sales")
    .select("sale_date, quantity, products(product_name, category)")
    .eq("user_id", user.id);

  if(!sales || sales.length === 0) return;

  const dateMap = {};
  sales.forEach(s=>{
    dateMap[s.sale_date] = (dateMap[s.sale_date] || 0) + s.quantity;
  });

  const labels = Object.keys(dateMap).sort();
  const data = labels.map(d=>dateMap[d]);

  renderLineChart("salesTrendChart", labels, data, "Sales");
  renderLineChart("dashMiniChart", labels, data, "Sales");
  // CATEGORY PIE
  const categoryMap = {};
  sales.forEach(s=>{
    const cat = s.products?.category || "Other";
    categoryMap[cat] = (categoryMap[cat] || 0) + s.quantity;
  });

  renderPieChart(
    "categoryPieChart",
    Object.keys(categoryMap),
    Object.values(categoryMap)
  );

  // DASHBOARD PIE
  renderPieChart(
    "dashPieChart",
    Object.keys(categoryMap),
    Object.values(categoryMap)
  );
  await renderProductPerformance();
  await renderCategoryGrowth();
  await renderPredictionChart();
}


/** refreshDashboard()— Re-renders stats, charts, and insights */
async function refreshDashboard(){
  await updateStatsCards();
  refreshCharts();

  // Run lightweight updates only
  updateInsights();
  updateTopProducts();
  updateLowStock();
  updateRestockSuggestions();

  await renderMonthlyChart(); 
  await loadAIInsights(); 

  // Avoid repeated heavy calls
}

async function renderPredictionChart(){
  const user = await getCurrentUser();

  const { data: sales } = await supabaseClient
    .from("sales")
    .select("*")
    .eq("user_id", user.id)
    .order("sale_date");

  if(!sales || sales.length === 0) return;

  const dateMap = {};

sales.forEach(s=>{
  const d = s.sale_date;
  dateMap[d] = (dateMap[d] || 0) + s.quantity;
});

const labels = Object.keys(dateMap).sort();
const actual = Object.values(dateMap);

// Moving average prediction
const predicted = actual.map((_, i) => {
  const start = Math.max(0, i - 2);
  const subset = actual.slice(start, i + 1);
  return Math.round(subset.reduce((a,b)=>a+b,0) / subset.length);
});

const canvas = document.getElementById("predictionChart");
if(!canvas) return;

if(chartInstances["predictionChart"]){
  chartInstances["predictionChart"].destroy();
}

chartInstances["predictionChart"] = new Chart(canvas,{
  type:"line",
  data:{
    labels,
    datasets:[
      {
        label:"Actual Sales",
        data:actual,
        borderColor:"#2563eb",
        backgroundColor:"rgba(37,99,235,0.1)",
        tension:0.4
      },
      {
        label:"Predicted (Moving Avg)",
        data:predicted,
        borderColor:"#ef4444",
        borderDash:[6,6],
        tension:0.4
      }
    ]
  }
});
}


/* ============================================================
   6. MARKET INSIGHTS ANALYZER
   Analyzes product data and generates insight cards
============================================================ */

/**
 * updateInsights()— Computes analytics from product data and
 * updates the 4 insight cards: trending, fastest growing, top, total
 */
async function updateInsights(){

  const user = await getCurrentUser();

  const { data: sales } = await supabaseClient
    .from("sales")
    .select("quantity, products(product_name, category)")
    .eq("user_id", user.id);

  if(!sales || sales.length === 0) return;

  let total = 0;
  const productMap = {};
  const categoryMap = {};

  sales.forEach(s=>{
    total += s.quantity;

    const name = s.products?.product_name;
    const cat = s.products?.category;

    if(name) productMap[name] = (productMap[name] || 0) + s.quantity;
    if(cat) categoryMap[cat] = (categoryMap[cat] || 0) + s.quantity;
  });

  const topProduct = Object.entries(productMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const topCategory = Object.entries(categoryMap).sort((a,b)=>b[1]-a[1])[0]?.[0];

  document.getElementById("insight-top").textContent = topProduct || "—";
  document.getElementById("insight-growing").textContent = topCategory || "—";
  document.getElementById("insight-total-sales").textContent = total;
  document.getElementById("insight-trending").textContent = topProduct || "—";
}

async function updateTopProducts(){

  const sales = await getSalesAnalytics();

  const map = {};

  sales.forEach(s=>{
    const name = s.products?.product_name;
    map[name] = (map[name] || 0) + s.quantity;
  });

  const sorted = Object.entries(map)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);

  const list = document.getElementById("top-products-list");

  list.innerHTML = sorted.map(([name, qty]) => `
    <li>${name} — ${qty} sold</li>
  `).join("");
}

/* ============================================================
   7. FAKESTOREAPI — Real Market Trends
   Fetch top 5 trending products from FakeStoreAPI
============================================================ */

let marketFetched = false; // Prevent duplicate fetches

/**
 * fetchMarketTrends()— Calls FakeStoreAPI, renders top 5 product cards
 */
async function fetchMarketTrends(){
  const grid = document.getElementById('market-grid');
  if (!grid)return;

  // Show loading
  grid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:32px; color:#94a3b8;">
      <div class="spinner" style="margin:0 auto 12px;"></div>
      Loading real market trends...
    </div>`;

  try {
    const res  = await fetch('https://fakestoreapi.com/products?limit=5');
    if (!res.ok)throw new Error('API unavailable');
    const data = await res.json();

    grid.innerHTML = data.map((prod, i)=> `
      <div class="market-card">
        <img src="${prod.image}" alt="${escapeHTML(prod.title)}" class="market-img" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><text y=\\'.9em\\' font-size=\\'80\\'>📦</text></svg>'"/>
        <div class="market-info">
          <div class="market-rank">${i + 1}</div>
          <div class="market-name">${escapeHTML(prod.title)}</div>
          <div class="market-category">${escapeHTML(prod.category)}</div>
          <div class="market-price">$${prod.price.toFixed(2)}</div>
        </div>
      </div>
    `).join('');

    marketFetched = true;
  } catch (err){
    // Fallback: show friendly error with demo products
    grid.innerHTML = `
      <div style="grid-column:1/-1; background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:20px; color:#dc2626; text-align:center;">
        <div style="font-size:1.5rem; margin-bottom:8px;">🌐</div>
        <strong>Could not load live market data.</strong><br>
        <span style="color:#64748b; font-size:0.85rem;">Check your internet connection or try again later.</span>
        <br><br>
        <button class="btn-pill" onclick="fetchMarketTrends()">↻ Retry</button>
      </div>`;
  }
}


/* ============================================================
   8. DEMAND FORECAST ENGINE
   Classifies products by sales count into High / Medium / Low demand
   and estimates next-week demand
============================================================ */

/**
 * updateForecast()— Runs the demand classification algorithm
 * High:   sales >= 200
 * Medium: sales 50–199
 * Low:    sales < 50
 */
async function updateForecast(){

  const sales = await getSalesAnalytics();

  const map = {};

  sales.forEach(s=>{
    const name = s.products?.product_name;
    map[name] = (map[name] || 0) + s.quantity;
  });

  const high = [];
  const medium = [];
  const low = [];

  const values = Object.values(map);

  // Safety check (VERY IMPORTANT)
  if (values.length === 0) return;

  const max = Math.max(...values);
  const min = Math.min(...values);

  // Avoid division by zero
  const range = max - min || 1;

  Object.entries(map).forEach(([name, qty]) => {
    const ratio = (qty - min) / range;

     if (ratio > 0.66) high.push({ name, qty });
     else if (ratio > 0.33) medium.push({ name, qty });
     else low.push({ name, qty });
  });

  // render lists
  renderForecastList("forecast-high-list", high, "High", "🔴");
  renderForecastList("forecast-med-list", medium, "Medium", "🟡");
  renderForecastList("forecast-low-list", low, "Low", "🟢");
}

async function updateLowStock(){

  const products = await getProducts();

  const lowStock = products.filter(p => p.stock <= 5);

  const list = document.getElementById("low-stock-list");

  if(!list) return;

  if(lowStock.length === 0){
    list.innerHTML = `<li style="color:#10b981;">✅ All products sufficiently stocked</li>`;
    return;
  }

  list.innerHTML = lowStock.map(p => `
    <li style="color:#ef4444;">
      ⚠ ${escapeHTML(p.name)} — only ${p.stock} left
    </li>
  `).join("");

}

async function updateRestockSuggestions(){

  const products = await getProducts();

  const container = document.getElementById("ai-restock");

  if(!container) return;

  if(products.length === 0){
    container.innerHTML = "Add products to generate suggestions.";
    return;
  }

  const suggestions = products
    .filter(p => p.stock <= 5)
    .sort((a,b) => a.stock - b.stock)
    .slice(0,3);

  if(suggestions.length === 0){
    container.innerHTML = `
      <span style="color:#10b981;">
      ✅ Inventory levels look healthy. No urgent restock needed.
      </span>
    `;
    return;
  }

  container.innerHTML = suggestions.map(p => `
    <div style="margin-bottom:8px;">
      ⚠ <strong>${escapeHTML(p.name)}</strong> stock is low (${p.stock} left).<br>
      Suggested restock: <strong>${20 - p.stock} units</strong>
    </div>
  `).join("");

}

/**
 * renderForecastList(listId, products, label, emoji)
 * Renders list items into a forecast card's <ul>
 */
function renderForecastList(listId, products, label, emoji){
  const list = document.getElementById(listId);
  if (!list)return;

  if (products.length === 0){
    list.innerHTML = `<li>No data</li>`;
    return;
  }

  list.innerHTML = products
    .sort((a, b)=> b.qty - a.qty)
    .slice(0, 6)
    .map(p => `
      <li>
        <span>${emoji} ${escapeHTML(p.name)}</span>
        <span>${p.qty} units</span>
      </li>
    `).join('');
}



/* ============================================================
   9. AI CHATBOT ENGINE
   Parses user questions, analyzes localStorage product data,
   returns relevant smart responses
============================================================ */

/**
 * buildAIResponse(question)— Core AI response generator
 * Matches question to known intents and returns dynamic answers
 * @param {string} question
 * @returns {string} HTML response string
 */
async function buildAIResponse(question){

  try {
    const products = await getProducts();

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        products
      })
    });

    let data;

  try {
      data = await res.json();
    } catch (e) {
       return "⚠ Invalid AI response";
    }

  if (!res.ok) {
        return "⚠ AI server error";
    }

    if (data.error) {
      return "⚠ " + data.error;
    }

    return data.answer;

  } catch (err) {
    console.error("AI FRONTEND ERROR:", err);
    return "⚠ Failed to connect to AI server";
  }
}

async function loadAIInsights(){

  const products = await getProducts();
  const container = document.getElementById("ai-insights");

  if(!container) return;

  if(products.length === 0){
    container.innerHTML = "📦 Add products to generate insights.";
    return;
  }

  try {

    container.innerHTML = "🤖 Generating AI insights...";

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: "Give overall business insights for my store",
        products
      })
    });

    let data;

  try {
       data = await res.json();
     } catch (e) {
        container.innerHTML = "⚠ AI response error";
        return;
     }

    if (data.error) {
      container.innerHTML = "⚠ " + data.error;
      return;
    }

    container.innerHTML = `
      <div style="white-space:pre-line;">
        ${data.answer}
      </div>
    `;

  } catch (err) {
    console.error("AI Insights Error:", err);
    container.innerHTML = "⚠ Failed to load AI insights";
  }
}



/* --- Floating Chatbot Widget --- */

/** Toggle chatbot window open/closed */
function toggleChatbot(){
  const win = document.getElementById('chatbot-window');
  win.classList.toggle('open');
  // Scroll to bottom when opening
  if (win.classList.contains('open')){
    const msgs = document.getElementById('chatbot-messages');
    if (msgs)msgs.scrollTop = msgs.scrollHeight;
  }
}

/**
 * sendChatMessage()— Reads chatbot input, builds response, appends to widget
 */
function sendChatMessage(){
  const input    = document.getElementById('chatbot-input');
  const messages = document.getElementById('chatbot-messages');
  if (!input || !input.value.trim())return;

  const question = input.value.trim();
  input.value    = '';

  appendChatMsg(messages, 'user', '👤', question);

  // Simulate AI thinking delay
  setTimeout(async ()=> {
  const response = await buildAIResponse(question);
    appendChatMsg(messages, 'bot', '🤖', response);
    messages.scrollTop = messages.scrollHeight;
  }, 600);
}

/** Quick suggestion chip clicked */
function quickAsk(question){
  const input = document.getElementById('chatbot-input');
  if (input){ input.value = question; sendChatMessage(); }
}

/* --- Full-page AI Chat (section-ai)--- */

/** Send message in the full-page AI panel */
function sendAIPageMessage(){
  const input    = document.getElementById('ai-page-input');
  const messages = document.getElementById('ai-page-messages');
  if (!input || !input.value.trim())return;

  const question = input.value.trim();
  input.value    = '';

  appendChatMsg(messages, 'user', '👤', question);
  messages.scrollTop = messages.scrollHeight;

  setTimeout(async ()=> {
    const response = await buildAIResponse(question);
    appendChatMsg(messages, 'bot', '🤖', response);
    messages.scrollTop = messages.scrollHeight;
  }, 700);
}

/** Quick suggestion from full-page buttons */
function askAI(question){
  const input = document.getElementById('ai-page-input');
  if (input){ input.value = question; sendAIPageMessage(); }
}

/**
 * appendChatMsg(container, type, icon, text)
 * Appends a chat message bubble to the messages container
 */
function appendChatMsg(container, type, icon, text){
  if (!container)return;
  const div = document.createElement('div');
  div.className = `chat-msg ${type}`;
  div.innerHTML = `
    <div class="chat-msg-icon">${icon}</div>
    <div class="chat-msg-bubble">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}


/* ============================================================
   10. LOGOUT SYSTEM
   Clears session and redirects to login
============================================================ */

/**
 * logoutUser()— Clears session data and redirects to index.html
 */
async function logoutUser(){

  if (!confirm("Are you sure you want to logout?"))return;

  await supabaseClient.auth.signOut();

  window.location.href = "index.html";

}

/* ============================================================
   11. UTILITIES
============================================================ */

/** showToast(message, type)— Display a floating toast notification */
function showToast(message, type = 'success'){
  const toast = document.getElementById('toast');
  if (!toast)return;
  toast.textContent = message;
  toast.className   = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=> { toast.className = 'toast'; }, 3000);
}

/** formatDate(dateStr)— Format 'YYYY-MM-DD' to 'Jan 1, 2025' */
function formatDate(dateStr){
  if (!dateStr) return "—";

  const d = new Date(dateStr);

  if (isNaN(d)) return "—";

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/** escapeHTML(str)— Sanitize user input before inserting into DOM */
function escapeHTML(str){
  if (typeof str !== 'string')return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
async function exportReport() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  let y = 20;
  const pageWidth = 210;

  // wait for charts
  await new Promise(resolve => setTimeout(resolve, 800));

  // ===== HEADER =====
  pdf.setFillColor(30,136,229);
  pdf.rect(0, 0, pageWidth, 25, "F");

  pdf.setTextColor(255,255,255);
  pdf.setFontSize(20);
  pdf.text("RetailTrend Analytics Report", 20, 15);

  pdf.setFontSize(10);
  pdf.text(new Date().toLocaleString(), 150, 15);

  pdf.setTextColor(0,0,0);

  // ===== KPI =====
  y = 35;

  const totalProducts = document.getElementById("stat-total-products")?.innerText || "0";
  const totalSales = document.getElementById("stat-total-sales")?.innerText || "0";
  const bestProduct = document.getElementById("stat-best-product")?.innerText || "-";

  function drawCard(x, y, title, value) {
    pdf.setFillColor(245,245,245);
    pdf.roundedRect(x, y, 80, 25, 3, 3, "F");

    pdf.setFontSize(10);
    pdf.text(title, x + 5, y + 8);

    pdf.setFontSize(14);
    pdf.text(String(value), x + 5, y + 18);
  }

  drawCard(15, y, "Total Products", totalProducts);
  drawCard(105, y, "Total Sales", totalSales);

  y += 30;
  drawCard(15, y, "Top Product", bestProduct);

  // ===== AI =====
  y += 35;

  pdf.setFontSize(14);
  pdf.setTextColor(30,136,229);
  pdf.text("AI Insights", 20, y);

  pdf.setFillColor(240,240,240);
  pdf.roundedRect(15, y + 5, 180, 30, 3, 3, "F");

  const aiText = document.getElementById("ai-insights")?.innerText;

  const finalAI = aiText && aiText.trim() !== ""
    ? aiText
    : `Top product is ${bestProduct}. Sales are steady. Improve low-demand products.`;

  pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize(finalAI, 170), 20, y + 12);

  // ===== SALES CHART =====
  y += 50;

  pdf.setFontSize(14);
  pdf.setTextColor(30,136,229);
  pdf.text("Sales Trend", 20, y);

  const chart1 = window["salesTrendChart_instance"];

  if (chart1) {
    const img = chart1.toBase64Image();
    pdf.addImage(img, "PNG", 15, y + 5, 180, 60);
  } else {
    pdf.text("Chart not available", 20, y + 15);
  }

  // ===== MONTHLY =====
  y += 65;

  if (y > 250) {
    pdf.addPage();
    y = 20;
  }

  pdf.setFontSize(14);
  pdf.setTextColor(30,136,229);
  pdf.text("Monthly Sales Performance", 20, y);

  const chart2 = window["monthlySalesChart_instance"];

  if (chart2) {
    const img2 = chart2.toBase64Image();
    pdf.addImage(img2, "PNG", 15, y + 5, 180, 60);
  } else {
    pdf.text("Chart not available", 20, y + 15);
  }

  // ===== TABLE PAGE =====
  pdf.addPage();
  y = 20;

  pdf.setFontSize(16);
  pdf.setTextColor(30,136,229);
  pdf.text("Product Inventory Report", 20, y);

  y += 10;

  pdf.setFillColor(30,136,229);
  pdf.rect(15, y - 5, 180, 8, "F");

  pdf.setTextColor(255,255,255);
  pdf.text("Product", 20, y);
  pdf.text("Category", 80, y);
  pdf.text("Stock", 130, y);
  pdf.text("Price", 160, y);

  pdf.setTextColor(0,0,0);

  const yStart = y - 5;
  y += 8;

  const { data: products } = await supabaseClient.from("products").select("*");

  products?.forEach((p) => {

    if (y > 280) {
      pdf.addPage();
      y = 20;
    }

    pdf.rect(15, y - 5, 180, 8);

    pdf.text(String(p.product_name), 20, y);
    pdf.text(String(p.category || "Other"), 80, y);
    pdf.text(String(p.stock || 0), 130, y);
    pdf.text("Rs. " + (p.price || 0), 160, y);

    y += 8;
  });

  const yEnd = y;

  pdf.line(75, yStart, 75, yEnd);
  pdf.line(125, yStart, 125, yEnd);
  pdf.line(155, yStart, 155, yEnd);

  // ===== FOOTER =====
  const pages = pdf.internal.getNumberOfPages();

  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);

    pdf.line(15, 285, 195, 285);
    pdf.setFontSize(9);
    pdf.setTextColor(120);

    pdf.text(`Page ${i} of ${pages}`, 160, 292);
    pdf.text("RetailTrend | Smart Analytics Platform", 20, 292);
  }

  pdf.save("RetailTrend_Final_Report.pdf");
}

/* ============================================================
   12. BOOTSTRAP — Initialize the dashboard on page load
============================================================ */

document.addEventListener('DOMContentLoaded', async function (){

  await sessionGuard();

  setDefaultDate();
  const saleDate = document.getElementById("sale-date");

  if(saleDate){
	saleDate.value = new Date().toISOString().split("T")[0];
     } 

  await renderProductTable();
  await loadSalesProducts();
     await loadSalesHistory();
  await updateStatsCards();
  await calculateProfit();
  await updateLowStock();
     await updateRestockSuggestions();
  await updateInsights();
  await updateForecast();

  await loadAIInsights();

  setTimeout(refreshCharts, 100);

  fetchMarketTrends();

  ['prod-name','prod-category','prod-sales','prod-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el)el.addEventListener('keydown', function(e){
      if (e.key === 'Enter')addProduct();
    });
  });

  // REALTIME DATABASE LISTENER
const { data: { user } } = await supabaseClient.auth.getUser();

if (user?.id) {

  // PRODUCTS
  supabaseClient
    .channel('products-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `user_id=eq.${user.id}`
      },
      () => {
        refreshDashboard();
      }
    )
    .subscribe();

  // SALES
  supabaseClient
    .channel('sales-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sales',
        filter: `user_id=eq.${user.id}`
      },
      () => {
        loadSalesHistory();
        refreshDashboard();
      }
    )
    .subscribe();
}
});
// 🌙 DARK MODE
document.addEventListener("DOMContentLoaded", () => {

  const toggleBtn = document.getElementById("theme-toggle");

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
  }

  toggleBtn?.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const mode = document.body.classList.contains("dark") ? "dark" : "light";
    localStorage.setItem("theme", mode);
  });

});
// ⏳ HIDE LOADER
window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "none";

  document.body.style.display = "flex"; // show page
});
function setDefaultDate() {
  const today = new Date().toISOString().split("T")[0];

  ["prod-date", "sale-date"].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}
async function calculateProfit(){

  const sales = await getSalesAnalytics();

  let revenue = 0;
  let cost = 0;

  sales.forEach(s => {
    const price = s.products?.price || 0;

    revenue += price * s.quantity;
    cost += (price * 0.6) * s.quantity; // assume 60% cost
  });

  const profit = revenue - cost;

  document.getElementById("stat-profit").textContent =
    "₹" + new Intl.NumberFormat('en-IN').format(profit);
}

async function generateDummyProducts() {

  const user = await getCurrentUser();

  const products = [
    { name: "iPhone 14", category: "Electronics", stock: 50, price: 80000 },
    { name: "Samsung TV", category: "Electronics", stock: 30, price: 45000 },
    { name: "Nike Shoes", category: "Sports", stock: 100, price: 5000 },
    { name: "T-Shirt", category: "Clothing", stock: 200, price: 800 },
    { name: "Coffee Maker", category: "Home & Living", stock: 40, price: 3500 },
    { name: "Backpack", category: "Accessories", stock: 120, price: 1500 },
    { name: "Face Cream", category: "Beauty", stock: 90, price: 600 },
    { name: "Cricket Bat", category: "Sports", stock: 60, price: 2500 },
    { name: "Laptop Dell", category: "Electronics", stock: 25, price: 70000 },
    { name: "AI Book", category: "Books", stock: 150, price: 500 }
  ];

  for (let p of products) {
    await supabaseClient.from("products").insert([
      {
        user_id: user.id,
        product_name: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price,
        created_at: getRandomDate().toISOString()
      }
    ]);
  }

  alert("✅ Dummy products added");

  await renderProductTable();
  await loadSalesProducts();
}

async function generateUltraRealisticSales() {

  const user = await getCurrentUser();

  const { data: products } = await supabaseClient
    .from("products")
    .select("*")
    .eq("user_id", user.id);

  if (!products || products.length === 0) {
    alert("Add products first!");
    return;
  }

  for (let i = 0; i < 150; i++) {

    const dateObj = getRandomDate(60);
    const day = dateObj.getDay();

    let quantity = Math.floor(Math.random() * 5) + 1;

    // Weekend boost
    if (day === 0 || day === 6) {
      quantity += Math.floor(Math.random() * 10) + 5;
    }

    // Festival spike
    if (Math.random() < 0.05) {
      quantity += Math.floor(Math.random() * 20) + 10;
    }

    // Popular products
    const weightedProducts = [
      ...products,
      ...products.slice(0, 3),
      ...products.slice(0, 2)
    ];

    const product =
      weightedProducts[Math.floor(Math.random() * weightedProducts.length)];

    // Slow products
    if (products.indexOf(product) > 5) {
      quantity = Math.max(1, Math.floor(quantity / 2));
    }

    await supabaseClient.from("sales").insert([
      {
        product_id: product.id,
        quantity,
        total_price: quantity * (product.price || 100),
        sale_date: dateObj.toISOString(),
        user_id: user.id
      }
    ]);
  }

  alert("🚀 Ultra realistic data generated");

  await loadSalesHistory();
  refreshDashboard();
}

function getRandomDate(daysBack = 30) {
  const today = new Date();
  const past = new Date();

  past.setDate(today.getDate() - Math.floor(Math.random() * daysBack));

  return past;
}