#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, render_template, request, jsonify
import requests, json, datetime
import pandas as pd
import yfinance as yf
#import numpy as np

app = Flask(__name__)

# ----------- 基本設定 -----------
HEADERS = {
    "User-Agent": "chuan4ni@gmail.com",
    "Accept-Encoding": "gzip, deflate"
}

TICKER_JSON_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL_TMPL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

# ----------- 原有函數（稍作修改以適應Web環境）-----------

def get_cik_from_ticker(ticker: str) -> str:
    """回傳補零後的 10 位 CIK 字串"""
    try:
        data = requests.get(TICKER_JSON_URL, headers=HEADERS, timeout=20).json()
        for obj in data.values():
            if obj["ticker"].lower() == ticker.lower():
                return f'{int(obj["cik_str"]):010d}'
        raise ValueError(f"ticker {ticker} not found in SEC list")
    except Exception as e:
        raise ValueError(f"Error fetching ticker data: {str(e)}")

def pull_company_facts(cik_10: str) -> dict:
    """下載 Company Facts JSON"""
    try:
        url = FACTS_URL_TMPL.format(cik=cik_10)
        return requests.get(url, headers=HEADERS, timeout=20).json()
    except Exception as e:
        raise ValueError(f"Error fetching company facts: {str(e)}")

def facts_to_df(facts: dict, tag: str, addup: bool) -> pd.DataFrame:
    """將指定 tag 轉成 DataFrame（僅限 10-Q及10-K）"""
    if tag not in facts["facts"]["us-gaap"]:
        return pd.DataFrame(columns=["end", "val"])
    
    raw = facts["facts"]["us-gaap"][tag]["units"]["USD"]
    rows = [
        (r["end"], r["val"], r['fp'])
        for r in raw
        if r.get("form") in ("10-Q","10-K") and (r.get("fp", "").startswith("Q") or r.get("fp", "").startswith("FY"))
    ]
    
    df = pd.DataFrame(rows, columns=["end", tag, 'fp'])
    df["end"] = pd.to_datetime(df["end"])
    df = df.sort_values("end").drop_duplicates("end", keep="last")
    
    if "FY" in df["fp"].unique():
        for i in range(3, len(df)):
            if df.iloc[i]["fp"] == "FY" and addup:
                df.at[df.index[i], tag] -= df.iloc[i-3:i][tag].sum()
    
    return df.drop(columns='fp')

def latest_12_quarters(facts: dict, tag: str, addup: bool) -> pd.Series:
    """取最近 12 期的資料"""
    df = facts_to_df(facts, tag, addup).set_index("end")
    return df[tag].tail(12)

def get_company_analysis(ticker: str):
    """取得公司分析資料（Web版本）"""
    try:
        cik = get_cik_from_ticker(ticker)
        facts = pull_company_facts(cik)
        
        # 取 12 期資料
        net_income = latest_12_quarters(facts, "NetIncomeLoss", True)
        revenue_ref_time = net_income.index[-1]
        try:
            revenue = latest_12_quarters(facts, "RevenueFromContractWithCustomerExcludingAssessedTax", True)
            if revenue.index[-1] != revenue_ref_time or ticker=='OSCR':
                revenue = latest_12_quarters(facts, "Revenues", True)
        except:
            revenue = latest_12_quarters(facts, "Revenues", True)
        revenue.name = 'Revenues'
        equity = latest_12_quarters(facts, "StockholdersEquity", False)
        assets = latest_12_quarters(facts, "Assets", False)
        ebit = latest_12_quarters(facts, "OperatingIncomeLoss", True)
        cur_liab = latest_12_quarters(facts, "LiabilitiesCurrent", False)
        cash = latest_12_quarters(facts, "CashAndCashEquivalentsAtCarryingValue", False)
        
        # 合併資料
        df = pd.concat([net_income, revenue, equity, assets, ebit, cur_liab, cash], axis=1)
        
        # 計算衍生指標
        df["InvestedCapital"] = df["Assets"] - df["LiabilitiesCurrent"] - df["CashAndCashEquivalentsAtCarryingValue"]
        tax_rate = 0.25
        df["NOPAT"] = df["OperatingIncomeLoss"] * (1 - tax_rate)
        
        # 計算財務指標
        df["ROE"] = df["NetIncomeLoss"] / df["StockholdersEquity"]
        df["ROA"] = df["NetIncomeLoss"] / df["Assets"]
        df["ROIC"] = df["NOPAT"] / df["InvestedCapital"]
        df["ROCE"] = df["OperatingIncomeLoss"] / (df["Assets"] - df["LiabilitiesCurrent"])
        
        # 杜邦分析
        df["Net_Profit_Margin"] = df["NetIncomeLoss"] / df["Revenues"]
        df["Total_Asset_Turnover"] = df["Revenues"] / df["Assets"]
        df["Equity_Multiplier"] = df["Assets"] / df["StockholdersEquity"]
        
        # 準備回傳資料
        result_df = df[["ROE", "ROA", "ROIC", "ROCE", "Net_Profit_Margin", "Total_Asset_Turnover", "Equity_Multiplier"]].tail(12)
        
        # 轉換為JSON格式
        dates = [date.strftime('%Y-%m-%d') for date in result_df.index]
        
        return {
            'success': True,
            'ticker': ticker.upper(),
            'cik': cik,
            'dates': dates,
            'data': {
                'ROE': result_df['ROE'].tolist(),
                'ROA': result_df['ROA'].tolist(),
                'ROIC': result_df['ROIC'].tolist(),
                'ROCE': result_df['ROCE'].tolist(),
                'Net_Profit_Margin': result_df['Net_Profit_Margin'].tolist(),
                'Total_Asset_Turnover': result_df['Total_Asset_Turnover'].tolist(),
                'Equity_Multiplier': result_df['Equity_Multiplier'].tolist()
            },
            'latest': {
                'ROE': float(result_df['ROE'].iloc[-1]) if not pd.isna(result_df['ROE'].iloc[-1]) else None,
                'ROA': float(result_df['ROA'].iloc[-1]) if not pd.isna(result_df['ROA'].iloc[-1]) else None,
                'ROIC': float(result_df['ROIC'].iloc[-1]) if not pd.isna(result_df['ROIC'].iloc[-1]) else None,
                'ROCE': float(result_df['ROCE'].iloc[-1]) if not pd.isna(result_df['ROCE'].iloc[-1]) else None,
                'Net_Profit_Margin': float(result_df['Net_Profit_Margin'].iloc[-1]) if not pd.isna(result_df['Net_Profit_Margin'].iloc[-1]) else None,
                'Total_Asset_Turnover': float(result_df['Total_Asset_Turnover'].iloc[-1]) if not pd.isna(result_df['Total_Asset_Turnover'].iloc[-1]) else None,
                'Equity_Multiplier': float(result_df['Equity_Multiplier'].iloc[-1]) if not pd.isna(result_df['Equity_Multiplier'].iloc[-1]) else None
            }
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


# 新增股價資料取得函數
def get_stock_price_data(ticker: str):
    """取得股票一年期價格和成交量資料"""
    try:
        # 使用 Alpha Vantage API 獲取每日股價資料
        url = f'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={ticker}&interval=1day&apikey=HHTX99VMKPOTXD8A'
        r = requests.get(url)
        data = r.json()
        data = pd.DataFrame(data['Time Series (Daily)']).T[::-1]
        hist = data.rename(columns={'1. open': 'Open', '2. high': 'High', '3. low': 'Low', '4. close': 'Close', '5. volume': 'Volume'})
        hist.reset_index(inplace=True)
        hist = hist.rename(columns={'index': 'Date'})

        '''
        stock = yf.Ticker(ticker)
        # 取得一年期資料
        hist = stock.history(period="1y")
        
        # 重設索引讓Date變成欄位
        hist.reset_index(inplace=True)
        '''
        # 轉換資料格式供前端使用
        price_data = []
        volume_data = []
        navigator_data = []
        
        for _, row in hist.iterrows():
            #date_str = row['Date'].strftime('%Y-%m-%d')
            date_str = row['Date']  # 假設Date已經是字串格式
            
            # K線圖資料 (OHLC)
            price_data.append({
                'date': date_str,
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close'])
            })
            
            # 成交量資料
            volume_data.append({
                'date': date_str,
                'volume': int(row['Volume'])
            })
            
            # Navigator資料 (收盤價)
            navigator_data.append({
                'date': date_str,
                'close': float(row['Close'])
            })
        
        return {
            'success': True,
            'ticker': ticker.upper(),
            'price_data': price_data,
            'volume_data': volume_data,
            'navigator_data': navigator_data
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    
def save_html(req_content, filename="output.html"):
    with open(filename, "w", encoding="utf-8") as f:
        f.write(req_content)

def get_cik_from_url(cik):
    url = f"https://data.sec.gov/submissions/CIK{str(cik).zfill(10)}.json"
    company_filings = requests.get(url, headers=HEADERS).json()
    company_filings_df = pd.DataFrame(company_filings["filings"]["recent"])
    company_filings_df[company_filings_df.form == "10-Q"]
    access_number = company_filings_df[company_filings_df.form == "10-Q"].accessionNumber.values[0].replace("-", "")
    file_name = company_filings_df[company_filings_df.form == "10-Q"].primaryDocument.values[0]
    url_10Qadd = f"https://www.sec.gov/Archives/edgar/data/{cik}/{access_number}/{file_name}"
    req_content = requests.get(url_10Qadd, headers=HEADERS).content.decode("utf-8")
    save_html(req_content, filename=f"{cik}_{file_name}.html")


# ----------- Flask 路由 -----------

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    ticker = request.json.get('ticker', '').strip().upper()
    if not ticker:
        return jsonify({'success': False, 'error': '請輸入股票代號'})
    
    result = get_company_analysis(ticker)
    return jsonify(result)

# 新增Flask路由
@app.route('/stock-price', methods=['POST'])
def get_stock_price():
    ticker = request.json.get('ticker', '').strip().upper()
    if not ticker:
        return jsonify({'success': False, 'error': '請輸入股票代號'})
    
    result = get_stock_price_data(ticker)
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
