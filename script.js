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
  date: p.created_at
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

async function clearProductsDB(){

  const { data: { user } } = await supabaseClient.auth.getUser();

  const { error } = await supabaseClient
    .from("products")
    .delete()
    .eq("user_id", user.id);

  if (error)console.error(error);
}
/** Set today's date as default value for the date input */
function setDefaultDate(){
  const dateInput = document.getElementById('prod-date');
  if (dateInput && !dateInput.value){
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

async function recordSale(productId, quantity){

  const { data: product, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if(error){
    console.error(error);
    return;
  }

  const totalPrice = quantity * (product.price || 0);

  // insert sale
  const { error: saleError } = await supabaseClient
    .from("sales")
    .insert([
      {
        product_id: productId,
        quantity: quantity,
        total_price: totalPrice
      }
    ]);

  if(saleError){
    console.error(saleError);
    return;
  }

  // update stock
  await supabaseClient
    .from("products")
    .update({ stock: product.stock - quantity })
    .eq("id", productId);

  showToast("Sale recorded","success");

  refreshDashboard();
  await loadSalesHistory();
}

async function recordSaleFromForm(){

  const productId = document.getElementById("sale-product").value;
  const qty = parseInt(document.getElementById("sale-qty").value);
  const date = document.getElementById("sale-date").value;

  if(!productId || !qty){
    showToast("Enter quantity","error");
    return;
  }

  const { data: product, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .single();

  if(error){
    console.error(error);
    return;
  }

  const totalPrice = qty * (product.price || 0);

  const { error: saleError } = await supabaseClient
    .from("sales")
    .insert([
      {
        product_id: productId,
        quantity: qty,
        total_price: totalPrice,
        sale_date: date
      }
    ]);

  if(saleError){
    console.error(saleError);
    showToast("Sale failed","error");
    return;
  }

  await supabaseClient
    .from("products")
    .update({
      stock: product.stock - qty
    })
    .eq("id", productId);

  showToast("Sale recorded","success");

  await loadSalesHistory();
  refreshDashboard();
}

/**
 * addProduct()— Reads form fields, validates, saves to localStorage
 * then refreshes charts and stats
 */
async function addProduct(){

  const name = document.getElementById("prod-name").value;
  const category = document.getElementById("prod-category").value;
  const stock = parseInt(document.getElementById("prod-sales").value);

  if(!name || !category || !stock){
    showToast("Fill all fields","error");
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();

  const { data, error } = await supabaseClient
    .from("products")
    .insert([
      {
        user_id: user.id,
        product_name: name,
        category: category,
        stock: stock
      }
    ]);

  if(error){
    showToast(error.message,"error");
    return;
  }

  showToast("Product added successfully","success");

  renderProductTable();
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
      <td style="font-weight:600; color:#0f172a;">${escapeHTML(p.name)}</td>
      <td><span class="badge ${categoryColors[p.category] || 'badge-blue'}">${escapeHTML(p.category)}</span></td>
      <td style="font-weight:700; color:#2563eb;">${p.stock.toLocaleString()}</td>
      <td style="color:#64748b;">${formatDate(p.date)}</td>
    </tr>
  `).join('');
}

async function loadSalesHistory(){

  const { data, error } = await supabaseClient
    .from("sales")
    .select(`
      id,
      quantity,
      total_price,
      sale_date,
      products ( product_name )
    `)
    .order("sale_date", { ascending:false });

  if(error){
    console.error(error);
    return;
  }

  const tbody = document.getElementById("sales-table-body");
  const count = document.getElementById("sales-count");

  if(!tbody) return;

  count.textContent = data.length;

  if(data.length === 0){
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon">💰</div>
            <p>No sales recorded yet.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map((s,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${formatDate(s.sale_date)}</td>
      <td>${escapeHTML(s.products.product_name)}</td>
      <td>${s.quantity}</td>
      <td>$${s.total_price}</td>
    </tr>
  `).join("");

}

/** Clear all products (with confirmation)*/
async function clearProducts(){

  if (!confirm("Delete all product data?"))return;

  await clearProductsDB();

  await renderProductTable();
  await updateStatsCards();
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

  const { data: products } = await supabaseClient
  .from("products")
  .select("*");

  const { data: sales } = await supabaseClient
  .from("sales")
  .select("*");

  const totalProductsEl = document.getElementById('stat-total-products');
  if (totalProductsEl) totalProductsEl.textContent = products.length;

  const totalSales = sales.reduce((s,x)=>s + x.quantity,0);

  const totalSalesEl = document.getElementById('stat-total-sales');
  if (totalSalesEl) totalSalesEl.textContent = totalSales;

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
  if (!canvas)return;

  // Destroy old chart if exists
  if (chartInstances[canvasId]){
    chartInstances[canvasId].destroy();
  }

  chartInstances[canvasId] = new Chart(canvas, {
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
        pointHoverRadius: 7,
        tension: 0.4,
        borderWidth: 2.5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: '#94a3b8',
          padding: 12,
          cornerRadius: 8,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
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

  const products = await getProducts();

  const monthMap = {};

  products.forEach(p => {
    const month = p.date.slice(0,7); // YYYY-MM
    monthMap[month] = (monthMap[month] || 0) + p.sales;
  });

  const labels = Object.keys(monthMap);
  const data = Object.values(monthMap);

  renderLineChart(
    "monthlySalesChart",
    labels,
    data,
    "Monthly Sales"
  );
}

async function renderCategoryGrowth(){

  const products = await getProducts();

  const map = {};

  products.forEach(p=>{
    map[p.category] = (map[p.category] || 0) + p.sales;
  });

  const labels = Object.keys(map);
  const data = Object.values(map);

  renderBarChart(
    "categoryGrowthChart",
    labels,
    data
  );
}

/**
 * refreshCharts()— Builds chart data from localStorage and re-renders all charts
 */
async function refreshCharts(){
  const products = await getProducts();

  // --- SALES TREND CHART (line)---
  // Group total sales by date
  const dateMap = {};
  products.forEach(p => {
    dateMap[p.date] = (dateMap[p.date] || 0)+ p.sales;
  });
  const sortedDates = Object.keys(dateMap).sort();
  const trendLabels = sortedDates.map(d => formatDate(d));
  const trendData   = sortedDates.map(d => dateMap[d]);

  // Main analytics page
  renderLineChart('salesTrendChart', trendLabels, trendData, 'Total Sales');
  // Dashboard mini chart
  renderLineChart('dashMiniChart', trendLabels, trendData, 'Sales');

  // --- CATEGORY PIE CHART ---
  const catMap = {};
  products.forEach(p => {
    catMap[p.category] = (catMap[p.category] || 0)+ p.sales;
  });
  const pieLabels = Object.keys(catMap);
  const pieData   = Object.values(catMap);

  renderPieChart('categoryPieChart', pieLabels, pieData);
  renderPieChart('dashPieChart',     pieLabels, pieData);

  // --- PRODUCT BAR CHART ---
  const productNames  = products.map(p => p.name);
  const productSales  = products.map(p => p.sales);
  renderBarChart('productBarChart', productNames, productSales);
  renderMonthlyChart();
  renderCategoryGrowth();
  await renderPredictionChart();
}

renderMonthlyChart();

/** refreshDashboard()— Re-renders stats, charts, and insights */
function refreshDashboard(){
  updateStatsCards();
  refreshCharts();
  updateInsights();
  updateTopProducts();
  updateLowStock();
  updateRestockSuggestions();
  loadAIInsights();
}

async function renderPredictionChart(){

  const { data: sales } = await supabaseClient
  .from("sales")
  .select("*")
  .order("sale_date");

  if(!sales || sales.length === 0) return;

  const dateMap = {};

  sales.forEach(s=>{
    const d = s.sale_date;
    dateMap[d] = (dateMap[d] || 0) + s.quantity;
  });

  const labels = Object.keys(dateMap);
  const actual = Object.values(dateMap);

  // Simple prediction model
  const predicted = actual.map((v,i)=>{
    if(i === 0) return v;
    return Math.round((v + actual[i-1]) / 2);
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
          label:"Predicted Sales",
          data:predicted,
          borderColor:"#ef4444",
          backgroundColor:"rgba(239,68,68,0.1)",
          borderDash:[6,6],
          tension:0.4
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false
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
  const products = await getProducts();

  // Default empty state
  if (products.length === 0){
    ['insight-trending', 'insight-growing', 'insight-top', 'insight-total-sales'].forEach(id => {
      const el = document.getElementById(id);
      if (el)el.textContent = id.includes('total')? '0' : 'Add products to see insights';
    });
    return;
  }

  // Total sales
  const totalSales = products.reduce((sum, p)=> sum + Number(p.sales), 0);

  // Top selling product (highest single sales count)
  const topProduct = products.reduce((best, p)=> (p.sales > best.sales ? p : best), products[0]);

  // Trending product: highest sales in the most recent 7 days
  const now    = new Date();
  const week   = new Date(now.getTime()- 7 * 24 * 60 * 60 * 1000);
  const recent = products.filter(p => new Date(p.date)>= week);
  const trending = (recent.length > 0 ? recent : products)
    .reduce((best, p)=> (p.sales > best.sales ? p : best), products[0]);

  // Fastest growing category: highest total sales by category
  const catMap = {};
  products.forEach(p => {
    catMap[p.category] = (catMap[p.category] || 0)+ p.sales;
  });
  const topCatEntry = Object.entries(catMap).sort((a, b)=> b[1] - a[1])[0];
  const fastestCat  = topCatEntry ? topCatEntry[0] : '—';

  // Update DOM
  const set = (id, val)=> { const el = document.getElementById(id); if (el)el.textContent = val; };
  set('insight-trending',    trending.name);
  set('insight-growing',     fastestCat);
  set('insight-top',         topProduct.name);
  set('insight-total-sales', totalSales.toLocaleString());
}

async function updateTopProducts(){

  const products = await getProducts();

  const sorted = [...products]
    .sort((a,b)=>b.sales-a.sales)
    .slice(0,5);

  const list = document.getElementById("top-products-list");

  if(!list) return;

  list.innerHTML = sorted.map(p => `
    <li>${p.name} — ${p.sales} units</li>
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
  const products = await getProducts();

  const high   = [];
  const medium = [];
  const low    = [];

  products.forEach(p => {
    if (p.sales >= 200)    high.push(p);
    else if (p.sales >= 50)medium.push(p);
    else                     low.push(p);
  });

  // Estimated next-week demand: weighted sum
  const avgSales   = products.length > 0
    ? products.reduce((s, p)=> s + p.sales, 0)/ products.length
    : 0;
  const nextWeek   = Math.round(avgSales * 1.12); // 12% growth projection

  // Update counters
  const set = (id, val)=> { const el = document.getElementById(id); if (el)el.textContent = val; };
  set('forecast-next-week',   nextWeek.toLocaleString());
  set('forecast-high-count',  high.length);
  set('forecast-med-count',   medium.length);
  set('forecast-low-count',   low.length);

  // Render lists
  renderForecastList('forecast-high-list', high, 'High',   '🔴');
  renderForecastList('forecast-med-list',  medium, 'Medium','🟡');
  renderForecastList('forecast-low-list',  low,  'Low',    '🟢');
}

async function updateLowStock(){

  const products = await getProducts();

  const lowStock = products.filter(p => p.sales <= 5);

  const list = document.getElementById("low-stock-list");

  if(!list) return;

  if(lowStock.length === 0){
    list.innerHTML = `<li style="color:#10b981;">✅ All products sufficiently stocked</li>`;
    return;
  }

  list.innerHTML = lowStock.map(p => `
    <li style="color:#ef4444;">
      ⚠ ${escapeHTML(p.name)} — only ${p.sales} left
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
    .filter(p => p.sales <= 5)
    .sort((a,b) => a.sales - b.sales)
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
      ⚠ <strong>${escapeHTML(p.name)}</strong> stock is low (${p.sales} left).<br>
      Suggested restock: <strong>${20 - p.sales} units</strong>
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
    list.innerHTML = `<li style="color:#94a3b8; font-size:0.82rem;">No products in this category</li>`;
    return;
  }

  list.innerHTML = products
    .sort((a, b)=> b.sales - a.sales)
    .slice(0, 6)
    .map(p => `
      <li>
        <span>${emoji} ${escapeHTML(p.name)}</span>
        <span class="forecast-badge">${p.sales.toLocaleString()} units</span>
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

  const products = await getProducts();
  const q = question.toLowerCase();

  const res = await fetch("/api/ai",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      question,
      products
    })
  });

  const data = await res.json();

  if(data.answer){
    return data.answer;
  }

  // fallback local responses if AI fails

  if (q.includes('top') || q.includes('best')){
    const top = products.reduce((best,p)=>p.sales>best.sales?p:best,products[0]);
    return `🏆 Top product: ${top.name} (${top.sales} units)`;
  }

  if (q.includes('total sales')){
    const total = products.reduce((s,p)=>s+p.sales,0);
    return `💰 Total sales: ${total}`;
  }

  return "AI could not generate a response.";
}
async function loadAIInsights(){

  const products = await getProducts();

  if(products.length === 0){
    document.getElementById("ai-insights").innerHTML =
      "Add products to generate AI insights.";
    return;
  }

  const res = await fetch("/api/ai",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      question: "Give short business insights about my store",
      products
    })
  });

  const data = await res.json();

  document.getElementById("ai-insights").innerHTML = data.answer;
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
  if (!dateStr)return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
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
async function exportReport(){
 const products = await getProducts();

  if(products.length === 0){
    showToast("No data available for report","error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const totalSales = products.reduce((s,p)=>s+p.sales,0);

  const top = products.reduce((best,p)=>
    p.sales > best.sales ? p : best
  ,products[0] || {product_name:"N/A",sales:0});

  doc.setFontSize(22);
 doc.setTextColor(37,99,235);
 doc.text("RetailTrend Analytics Report",20,20);
 doc.setTextColor(0,0,0);

  doc.setFontSize(12);
  doc.text(`Total Products: ${products.length}`,20,40);
  doc.text(`Total Sales: ${totalSales}`,20,50);
  doc.text(`Top Product: ${top.product_name}`,20,60);
  doc.text(`Top Product Sales: ${top.sales}`,20,70);

  doc.text(`Generated: ${new Date().toLocaleString()}`,20,90);

  doc.save("RetailTrend_Report.pdf");

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

if (user) {
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
        renderProductTable();
        updateStatsCards();
        refreshCharts();
        updateInsights();
        updateForecast();
      }
    )
    .subscribe();
}
});