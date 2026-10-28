# 手勢映畫

使用攝影機即時控制圖片播放，左側為鏡像攝影機與手部骨架，右側為圖片展示。辨識與圖片處理皆在瀏覽器執行，FastAPI 提供網頁及 `/health`，部署目標為 Render。

## 本機啟動

需要 Python 3.12.13；開發與 Render 使用相同版本。

```powershell
uv sync
uv run uvicorn main:app --reload
```

也可使用 pip：

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

開啟 http://localhost:8000 ，不要直接開啟 HTML 檔案或使用 IDE 的內嵌預覽。首次使用須連網載入固定版本 MediaPipe 0.10.21、WASM 與 Hand Landmarker 模型；先允許攝影機權限，預覽開啟後才載入模型，模型載入有 45 秒逾時提示。Google Fonts 為選用字型，載入失敗會使用系統字型。正式網站需 HTTPS 並允許攝影機權限。影像不會上傳伺服器，但瀏覽器仍會向 CDN 與模型服務下載資源。

## 操作

| 手勢 | 動作 |
| --- | --- |
| 張開手掌，往鏡像預覽左側移動 | 上一張 |
| 張開手掌，往鏡像預覽右側移動 | 下一張 |
| 只伸出食指，維持約 0.45 秒 | 第一張 |
| 只伸出小指，維持約 0.45 秒 | 最後一張 |
| 張開任一手，手心／手背翻轉，翻轉後穩定約 0.22 秒 | 圖片左右鏡像翻轉，再翻一次恢復 |
| 握拳約 0.45 秒 | 圖片上下翻轉，放開再握拳恢復 |
| 比讚（拇指朝上、其餘四指彎曲）約 0.45 秒 | 圖片向上跳，再落回原位 |
| 倒讚（拇指朝下、其餘四指彎曲）約 0.45 秒 | 圖片下移壓縮，再恢復原位 |
| 雙手張開、分開後拍合 | 第一次灰階、第二次半透明（40% 不透明度）、第三次恢復色彩與不透明度，循環切換 |
| 同一手只伸出食指與中指，移動兩指間距 | 以剛進入手勢時為 100%，張開放大、靠近縮小（50%～250%） |
| 食指伸直、其餘三指收起，拇指與食指張開成 L 形至少約 0.18 秒，再壓下拇指 | 開槍：圖片隨機出現穿透彈孔 |
| OK：拇指與食指圈合，其餘三指伸出，保持約 0.5 秒 | 播放約 3 秒謝幕：布幕合攏、「謝謝觀賞」、自動拉開 |

OK 謝幕可由任一手觸發，維持姿勢只播放一次，放開約 0.15 秒後可重新比手勢，兩次觸發間隔至少 3.5 秒。布幕只覆蓋圖片展示區，不更動圖片或既有縮放、翻轉、灰階、彈孔狀態；停止攝影機會取消謝幕。系統啟用「減少動態效果」時改為靜態謝幕畫面，約 1.6 秒後消失。

開槍時請將 L 形手勢朝向攝影機，讓食指與拇指清楚可見。每次抬起拇指重新準備，再壓下觸發；維持壓下姿勢不會連發，射擊間隔至少 0.65 秒。單獨伸食指仍可到第一張；辨識到 L 形開槍準備時暫停該手的第一張指令，射擊完收手或換手勢即可恢復。丟失追蹤會取消開槍準備，避免重新進入畫面誤觸。

彈孔是圖片上的透明遮罩與孔邊特效，不修改原始圖片檔；位置會避開圖片留白區域，最多保留最近 12 個孔。彈孔會跟著圖片縮放、翻轉、灰階及透明度，切圖或重新載入圖片即清除。現代 Chrome／Edge 支援此遮罩效果；實際手勢辨識仍需攝影機驗證。

兩指縮放會以手掌大小正規化，減少整隻手靠近鏡頭造成的縮放；畫面顯示目前百分比。兩指離開畫面、失去追蹤、收起手指或停止攝影機，立即恢復 100%。重新進入兩指手勢會建立新的間距基準。縮放在圖片中心進行，超出展示區的部分會裁切；可與翻轉、灰階、透明度、跳躍／下蹲效果疊加。縮放只影響圖片，不更動版面或控制按鈕。

新增效果可由任一手觸發。握拳、比讚、倒讚維持時只觸發一次，須放開或改變手勢後再次觸發；雙手同時握拳只翻轉一次。拍手以兩手由分開到靠近的視覺動作判斷，不使用麥克風；每次須重新分開雙手，並間隔至少 1.1 秒。先張開雙手，看到「拍手已準備」後，約 1 秒內向中間拍合；不必用力或發出聲音。畫面會提示雙手是否就緒、正在靠近或目前只看到一隻手。已觀察到接近拍合的位移時，容許約 0.22 秒內的單手重疊，且剩餘手部須位於原雙手中間；直接移出畫面、雙手都消失或長時間失去追蹤不算拍手。嚴重遮擋仍可能漏判。拍手期間暫停揮掌切圖以避免誤觸。

左右與上下翻轉可疊加；跳躍／下蹲不覆寫翻轉。灰階、透明度循環不重設翻轉方向；切圖時保留效果，重新整理重設。依系統「減少動態效果」偏好停用跳躍／下蹲動畫，仍顯示辨識提示。

同時最多追蹤雙手，任一手翻面即可觸發；雙手同時翻面只翻轉一次圖片。原切圖手勢由持續追蹤的一隻手操作，避免偵測順序交換造成誤切。翻面以手掌關節平面方向變化估算，手側面與不穩定姿勢不觸發；新手進入畫面只建立方向基準。圖片翻轉方向會保留到後續切圖，重新整理頁面恢復原向。文字、按鈕、攝影機預覽不跟著翻轉。

邏輯回歸檢查：`node tests/gestures.mjs`。實際翻手請保持手部在畫面內，翻到另一面後稍作停留；手部交叉、遮擋或追蹤中斷可能影響辨識，仍需實機驗證。

每次觸發間隔至少 1.1 秒；食指／小指須放下或改變手勢後才能再次觸發。到達首尾不循環。手掌移動須在約 0.65 秒內超過畫面寬度 19%。請讓手掌朝向攝影機、四指清楚可見；此版本以關節距離估算手勢，遮擋或大幅旋轉可能降低準確度，不是完整手語辨識。

可用第一張／上一張／下一張／最後一張按鈕、圓點與鍵盤 ←、→、Home、End 操作。「載入圖片」支援多選，依選取順序取代示範圖片；重新整理即重設，不儲存也不上傳。示範圖是專案附帶的 SVG 風景插畫。

## Render

將專案提交至 GitHub，於 Render 建立 Blueprint 並選取此儲存庫，使用 `render.yaml`；也可手動建立 Python Web Service：

- Build：`pip install -r requirements.txt`
- Start：`uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check：`/health`
- Python：`3.12.13`

此專案不需要伺服器攝影機、GPU、OpenCV 或 Python MediaPipe 套件。實際辨識效能取決於使用者裝置與光線。

## 檔案

- `main.py`：FastAPI 入口與健康檢查。
- `static/index.html`、`style.css`：響應式左右分欄版面。
- `static/app.js`：攝影機生命週期、模型載入、骨架繪製與圖片播放。
- `static/gesture.js`：手指姿勢、揮掌位移與觸發節流。
- `static/images/`：本機示範圖片。
- `requirements.txt`、`pyproject.toml`：Python 套件清單。
- `render.yaml`：Render 部署設定。

## 驗收

確認按鈕／鍵盤／圖片載入、首尾邊界、拒絕攝影機權限、停止後攝影機釋放，以及所有手勢、縮放與圖片特效。攝影機與辨識必須在具有攝影機的真實瀏覽器中驗證；單元測試無法代表實際辨識率。

## 依賴管理與部署前檢查

Python 直接依賴只有 FastAPI 與 Uvicorn；MediaPipe 在瀏覽器載入，不需安裝 Python 版 MediaPipe、OpenCV、NumPy 或 TensorFlow。

`pyproject.toml` 定義直接依賴範圍，`uv.lock` 鎖定完整相依版本，`requirements.txt` 由鎖定檔自動匯出，包含精確版本、跨平台條件與 SHA-256 雜湊，不要手動修改版本。

```powershell
# 新增或更新依賴後
uv lock
uv export --frozen --no-dev --no-emit-project --format requirements-txt --output-file requirements.txt

# 提交前
uv sync --frozen
uv pip check
uv run python tests/smoke.py
node tests/gestures.mjs
```

Node.js 22 以上僅供本機與 GitHub Actions 執行前端測試，Render 執行時不需要 Node.js 或 npm 建置。`.github/workflows/check.yml` 會在 push 與 pull request 自動檢查套件、網頁資源、健康檢查、手勢邏輯與 JavaScript 語法。

## GitHub 上傳與 Render 部署

1. 在 GitHub 建立空的儲存庫，不另外建立 README，以避免初次推送產生歷史衝突。
2. 設定本機提交身分與 remote，提交後推送；以下網址與 email 必須替換為自己的資料：

```powershell
git config user.name "YOUR_NAME"
git config user.email "YOUR_GITHUB_EMAIL"
git add .
git commit -m "Prepare gesture gallery for Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

3. 確認 GitHub Actions 檢查通過。
4. 在 Render 選擇 **New → Blueprint**，連結此 GitHub 儲存庫，套用根目錄 `render.yaml`；在 Render 確認適用方案與費用後建立服務。
5. 部署完成後開啟 Render 提供的 HTTPS 網址，先確認 `/health` 回傳 `{"status":"ok"}`，再允許攝影機權限並測試手勢。

若手動建立 Web Service，Root Directory 留空、Python 版本設為 `3.12.13`，使用上方 Render 章節中的命令與健康檢查路徑。

正式網站仍須能連線 jsDelivr 與 Google 模型服務；模型是在使用者第一次開啟攝影機時下載。影像與載入的圖片不會上傳至 GitHub 或 Render。
