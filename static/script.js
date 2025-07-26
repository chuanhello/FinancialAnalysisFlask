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
        if (stockChart) {
            stockChart.destroy();
        }
    
        var dataPoints1 = [], dataPoints2 = [], dataPoints3 = [];
        
        // 處理價格資料 (K線圖)
        data.price_data.forEach(item => {
            const date = new Date(item.date);
            dataPoints1.push({
                x: date,
                y: [item.open, item.high, item.low, item.close],
                color: item.open < item.close ? "#28a745" : "#dc3545"
            });
        });
        
        // 處理成交量資料
        data.volume_data.forEach((item, index) => {
            const date = new Date(item.date);
            const priceItem = data.price_data[index];
            dataPoints2.push({
                x: date,
                y: item.volume,
                color: priceItem.open < priceItem.close ? "#28a745" : "#dc3545"
            });
        });
        
        // 處理導航資料
        data.navigator_data.forEach(item => {
            const date = new Date(item.date);
            dataPoints3.push({
                x: date,
                y: item.close
            });
        });
    
        stockChart = new CanvasJS.StockChart("stockChartContainer", {
            exportEnabled: true,
            theme: "light2",
            title: {
                text: `${data.ticker} 股價走勢圖`
            },
            charts: [{
                toolTip: {
                    shared: true
                },
                axisX: {
                    lineThickness: 2,
                    tickLength: 0,
                    crosshair: {
                        enabled: true,
                        snapToDataPoint: true
                    }
                },
                axisY2: {
                    title: "股價 (USD)",
                    prefix: "$"
                },
                legend: {
                    verticalAlign: "top",
                    horizontalAlign: "left"
                },
                data: [{
                    name: "股價",
                    yValueFormatString: "$#,###.##",
                    axisYType: "secondary",
                    type: "candlestick",
                    risingColor: "#28a745",
                    fallingColor: "#dc3545",
                    dataPoints: dataPoints1
                }]
            }, {
                height: 100,
                toolTip: {
                    shared: true
                },
                axisX: {
                    crosshair: {
                        enabled: true,
                        snapToDataPoint: true
                    }
                },
                axisY2: {
                    title: "成交量",
                    labelFormatter: function(e) {
                        return CanvasJS.formatNumber(e.value, "##,,.##") + "M";
                    }
                },
                legend: {
                    horizontalAlign: "left"
                },
                data: [{
                    axisYType: "secondary",
                    name: "成交量",
                    type: "column",
                    dataPoints: dataPoints2
                }]
            }],
            navigator: {
                data: [{
                    color: "#6c757d",
                    dataPoints: dataPoints3
                }],
                slider: {
                    minimum: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
                    maximum: new Date()
                }
            }
        });
        
        stockChart.render();
    }
	// 翻轉卡片初始化函數
	function initFlipCards() {
		const flipCards = document.querySelectorAll('.flip-card');
		
		flipCards.forEach(card => {
			card.addEventListener('click', function(e) {
				e.preventDefault();
				toggleFlipCard(this);
			});
			
			// 新增鍵盤支援
			card.addEventListener('keypress', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleFlipCard(this);
				}
			});
			
			// 設定可聚焦屬性以支援鍵盤操作
			card.setAttribute('tabindex', '0');
		});
	}

	// 切換翻轉狀態
	function toggleFlipCard(card) {
		card.classList.toggle('flipped');
		
		// 更新aria-label以提升無障礙體驗
		const isFlipped = card.classList.contains('flipped');
		const metric = card.dataset.metric.toUpperCase();
		
		if (isFlipped) {
			card.setAttribute('aria-label', `${metric} 詳細說明 - 點擊返回數值顯示`);
		} else {
			card.setAttribute('aria-label', `${metric} 指標 - 點擊查看詳細說明`);
		}
	}

	// 當載入新的分析結果時，重置所有翻轉卡片
	function resetFlipCards() {
		const flipCards = document.querySelectorAll('.flip-card');
		flipCards.forEach(card => {
			card.classList.remove('flipped');
			const metric = card.dataset.metric.toUpperCase();
			card.setAttribute('aria-label', `${metric} 指標 - 點擊查看詳細說明`);
		});
	}
    
    function displayResults(data) {
	    // 重置翻轉卡片狀態
		resetFlipCards();
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
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
        // 隱藏所有圖表
        document.getElementById('profitabilityChart').style.display = 'none';
        document.getElementById('dupontChart').style.display = 'none';
        document.getElementById('stockPriceChart').style.display = 'none';
    
        // 顯示對應圖表
        if (tabName === 'profitability') {
            document.getElementById('profitabilityChart').style.display = 'block';
        } else if (tabName === 'dupont') {
            document.getElementById('dupontChart').style.display = 'block';
        } else if (tabName === 'stock-price') {
            document.getElementById('stockPriceChart').style.display = 'block';
            // 重新渲染股價圖表以確保正確顯示
            if (stockChart) {
                setTimeout(() => stockChart.render(), 100);
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
	// 初始化翻轉卡片功能
    initFlipCards();
});
