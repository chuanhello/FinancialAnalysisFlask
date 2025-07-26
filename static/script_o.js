let profitabilityChart = null;
let dupontChart = null;
let stockChart = null; // 新增股價圖表變數

document.addEventListener('DOMContentLoaded', function() {
    const tickerInput = document.getElementById('tickerInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    const resultsSection = document.getElementById('resultsSection');
    
    // 事件監聽器
    analyzeBtn.addEventListener('click', analyzeStock);
    tickerInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            analyzeStock();
        }
    });
    
    // 分頁切換
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    // 設置頁籤點擊事件
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    function analyzeStock() {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            showError('請輸入股票代號');
            return;
        }
    
        hideError();
        hideResults();
        showLoading();
        analyzeBtn.disabled = true;
    
        // 同時發送財務分析和股價資料請求
        Promise.all([
            fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: ticker })
            }).then(response => response.json()),
            
            fetch('/stock-price', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: ticker })
            }).then(response => response.json())
        ])
        .then(([financialData, priceData]) => {
            hideLoading();
            analyzeBtn.disabled = false;
            
            if (financialData.success && priceData.success) {
                displayResults(financialData);
                createStockChart(priceData); // 創建股價圖表
            } else {
                const error = !financialData.success ? financialData.error : priceData.error;
                showError(error || '分析失敗，請稍後再試');
            }
        })
        .catch(error => {
            hideLoading();
            analyzeBtn.disabled = false;
            showError('網路錯誤，請檢查連線狀態');
            console.error('Error:', error);
        });
    }
    // 新增創建股價圖表函數
    function createStockChart(data) {
        console.log('創建股價圖表，資料：', data); // 除錯用
        
        // 確保容器存在
        const container = document.getElementById('stockChartContainer');
        if (!container) {
            console.error('找不到圖表容器 #stockChartContainer');
            return;
        }
    
        // 清除之前的圖表
        if (window.stockChart) {
            window.stockChart.destroy();
        }
    
        // 檢查資料格式
        if (!data.price_data || !data.volume_data || !data.navigator_data) {
            console.error('股價資料格式不正確');
            return;
        }
    
        var dataPoints1 = [], dataPoints2 = [], dataPoints3 = [];
        
        try {
            // 處理K線圖資料
            data.price_data.forEach((item, index) => {
                const date = new Date(item.date + 'T00:00:00');
                if (isNaN(date.getTime())) {
                    console.warn('無效日期:', item.date);
                    return;
                }
                
                dataPoints1.push({
                    x: date,
                    y: [
                        Number(item.open), 
                        Number(item.high), 
                        Number(item.low), 
                        Number(item.close)
                    ]
                });
            });
            
            // 處理成交量資料
            data.volume_data.forEach((item, index) => {
                const date = new Date(item.date + 'T00:00:00');
                if (isNaN(date.getTime())) return;
                
                const priceItem = data.price_data[index];
                const isGreen = priceItem && priceItem.close >= priceItem.open;
                
                dataPoints2.push({
                    x: date,
                    y: Number(item.volume),
                    color: isGreen ? "#28a745" : "#dc3545"
                });
            });
            
            // 處理導航資料
            data.navigator_data.forEach(item => {
                const date = new Date(item.date + 'T00:00:00');
                if (isNaN(date.getTime())) return;
                
                dataPoints3.push({
                    x: date,
                    y: Number(item.close)
                });
            });
    
            console.log('資料點數量 - K線:', dataPoints1.length, '成交量:', dataPoints2.length, '導航:', dataPoints3.length);
    
            // 創建股價圖表
            window.stockChart = new CanvasJS.StockChart("stockChartContainer", {
                exportEnabled: true,
                animationEnabled: true,
                theme: "light2",
                title: {
                    text: `${data.ticker} 一年期股價走勢`
                },
                charts: [{
                    toolTip: {
                        shared: true,
                        contentFormatter: function(e) {
                            var content = "<strong>" + CanvasJS.formatDate(e.entries[0].dataPoint.x, "YYYY-MM-DD") + "</strong><br/>";
                            content += "開盤: $" + e.entries[0].dataPoint.y[0].toFixed(2) + "<br/>";
                            content += "最高: $" + e.entries[0].dataPoint.y[1].toFixed(2) + "<br/>";
                            content += "最低: $" + e.entries[0].dataPoint.y[2].toFixed(2) + "<br/>";
                            content += "收盤: $" + e.entries[0].dataPoint.y[3].toFixed(2);
                            return content;
                        }
                    },
                    axisX: {
                        crosshair: {
                            enabled: true,
                            snapToDataPoint: true,
                            labelFormatter: function(e) {
                                return CanvasJS.formatDate(e.value, "YYYY-MM-DD");
                            }
                        }
                    },
                    axisY: {
                        title: "股價 (USD)",
                        prefix: "$",
                        labelFormatter: function(e) {
                            return "$" + e.value.toFixed(2);
                        }
                    },
                    legend: {
                        verticalAlign: "top"
                    },
                    data: [{
                        name: "股價",
                        type: "candlestick",
                        color: "#000000",
                        risingColor: "#28a745",
                        fallingColor: "#dc3545",
                        dataPoints: dataPoints1
                    }]
                }, {
                    height: 120,
                    toolTip: {
                        shared: true,
                        contentFormatter: function(e) {
                            return "<strong>" + CanvasJS.formatDate(e.entries[0].dataPoint.x, "YYYY-MM-DD") + "</strong><br/>" +
                                   "成交量: " + CanvasJS.formatNumber(e.entries[0].dataPoint.y, "#,##0");
                        }
                    },
                    axisX: {
                        crosshair: {
                            enabled: true,
                            snapToDataPoint: true
                        }
                    },
                    axisY: {
                        title: "成交量",
                        labelFormatter: function(e) {
                            return CanvasJS.formatNumber(e.value, "#,##0,,") + "M";
                        }
                    },
                    data: [{
                        name: "成交量",
                        type: "column",
                        dataPoints: dataPoints2
                    }]
                }],
                navigator: {
                    data: [{
                        dataPoints: dataPoints3
                    }],
                    slider: {
                        minimum: dataPoints3.length > 0 ? dataPoints3[Math.max(0, dataPoints3.length - 90)].x : new Date(),
                        maximum: dataPoints3.length > 0 ? dataPoints3[dataPoints3.length - 1].x : new Date()
                    }
                },
                rangeSelector: {
                    enabled: true,
                    buttons: [{
                        label: "1個月",
                        range: 1,
                        rangeType: "month"
                    }, {
                        label: "3個月", 
                        range: 3,
                        rangeType: "month"
                    }, {
                        label: "6個月",
                        range: 6,
                        rangeType: "month"
                    }, {
                        label: "全部",
                        rangeType: "all"
                    }]
                }
            });
    
            // 渲染圖表
            window.stockChart.render();
            console.log('股價圖表已成功渲染');
            
        } catch (error) {
            console.error('創建股價圖表時發生錯誤:', error);
        }
    }
    
    
    function displayResults(data) {
        // 顯示公司資訊
        document.getElementById('companyTicker').textContent = data.ticker;
        document.getElementById('cikInfo').textContent = `CIK: ${data.cik}`;
        
        // 顯示最新指標
        const latest = data.latest;
        document.getElementById('roeValue').textContent = formatPercentage(latest.ROE);
        document.getElementById('roaValue').textContent = formatPercentage(latest.ROA);
        document.getElementById('roicValue').textContent = formatPercentage(latest.ROIC);
        document.getElementById('roceValue').textContent = formatPercentage(latest.ROCE);
        
        // 顯示杜邦分析
        document.getElementById('npmValue').textContent = formatPercentage(latest.Net_Profit_Margin);
        document.getElementById('tatValue').textContent = formatNumber(latest.Total_Asset_Turnover, 2);
        document.getElementById('emValue').textContent = formatNumber(latest.Equity_Multiplier, 2);
        
        // 創建圖表
        createCharts(data);
        
        showResults();
    }
    
    function createCharts(data) {
        createProfitabilityChart(data);
        createDupontChart(data);
    }
    
    function createProfitabilityChart(data) {
        const ctx = document.getElementById('profitabilityCanvas').getContext('2d');
        
        if (profitabilityChart) {
            profitabilityChart.destroy();
        }
        
        profitabilityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [
                    {
                        label: 'ROE (%)',
                        data: data.data.ROE.map(v => v ? (v * 100).toFixed(2) : null),
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'ROA (%)',
                        data: data.data.ROA.map(v => v ? (v * 100).toFixed(2) : null),
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'ROIC (%)',
                        data: data.data.ROIC.map(v => v ? (v * 100).toFixed(2) : null),
                        borderColor: '#f093fb',
                        backgroundColor: 'rgba(240, 147, 251, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'ROCE (%)',
                        data: data.data.ROCE.map(v => v ? (v * 100).toFixed(2) : null),
                        borderColor: '#f5576c',
                        backgroundColor: 'rgba(245, 87, 108, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '獲利能力指標趨勢（近12季）',
                        font: { size: 16 }
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }
    
    function createDupontChart(data) {
        const ctx = document.getElementById('dupontCanvas').getContext('2d');
        
        if (dupontChart) {
            dupontChart.destroy();
        }
        
        dupontChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [
                    {
                        label: '淨利率 (%)',
                        data: data.data.Net_Profit_Margin.map(v => v ? (v * 100).toFixed(2) : null),
                        borderColor: '#ff9a56',
                        backgroundColor: 'rgba(255, 154, 86, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: '總資產週轉率',
                        data: data.data.Total_Asset_Turnover.map(v => v ? v.toFixed(2) : null),
                        borderColor: '#4ecdc4',
                        backgroundColor: 'rgba(78, 205, 196, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    },
                    {
                        label: '權益乘數',
                        data: data.data.Equity_Multiplier.map(v => v ? v.toFixed(2) : null),
                        borderColor: '#45b7d1',
                        backgroundColor: 'rgba(69, 183, 209, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '杜邦分析三因子趨勢（近12季）',
                        font: { size: 16 }
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '淨利率 (%)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '倍數'
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
    }
    
    function switchTab(tabName) {
        console.log('切換到頁籤:', tabName);
        
        // 移除所有 active 類別
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 添加 active 類別到當前頁籤
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    
        // 隱藏所有圖表容器
        const containers = ['profitabilityChart', 'dupontChart', 'stockPriceChart'];
        containers.forEach(containerId => {
            const element = document.getElementById(containerId);
            if (element) {
                element.style.display = 'none';
            }
        });
    
        // 顯示對應的圖表容器
        const targetContainer = document.getElementById(tabName === 'stock-price' ? 'stockPriceChart' : tabName + 'Chart');
        if (targetContainer) {
            targetContainer.style.display = 'block';
            
            // 如果是股價圖表頁籤，延遲渲染以確保容器已顯示
            if (tabName === 'stock-price' && window.stockChart) {
                setTimeout(() => {
                    window.stockChart.render();
                    console.log('重新渲染股價圖表');
                }, 100);
            }
        }
    }
    
    function formatPercentage(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        return (value * 100).toFixed(2) + '%';
    }
    
    function formatNumber(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        return value.toFixed(decimals);
    }
    
    function showLoading() {
        loading.style.display = 'flex';
    }
    
    function hideLoading() {
        loading.style.display = 'none';
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
    
    function hideError() {
        errorMessage.style.display = 'none';
    }
    
    function showResults() {
        resultsSection.style.display = 'block';
    }
    
    function hideResults() {
        resultsSection.style.display = 'none';
    }
});
