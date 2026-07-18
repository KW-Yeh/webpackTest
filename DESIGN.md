---
name: Notion Analysis — 猜 A 猜 B 實作規格
authority: .vibeflow-attachments/a945f7b5-DESIGN.md
status: 唯一視覺規格
---

# 猜 A 猜 B：Notion 設計規格

本文件是本 repo 唯一可供實作與驗收的視覺規格；它同步自任務附件 `.vibeflow-attachments/a945f7b5-DESIGN.md`（Notion Analysis）。任何 Apple、SF Pro、黑色全域導覽、18px 卡片、全頁深色 tile 或其他舊規格均已失效，不得作為實作依據。

本次只調整視覺與互動呈現，不改變猜數字規則、路由、Redux/localStorage 格式或 PeerJS 協定。

## 1. 設計語言

介面應像一張溫暖、安靜且可閱讀的文件：暖白畫布襯托白色內容面，近黑 Inter 文字建立層級，只有 Notion 藍承擔主要操作。留白、hairline 與極淡陰影用來分群；彩色僅用於裝飾或既有語意狀態，不能取代版面結構。

### 色彩與語意

| 用途 | Token | 值／規則 |
|---|---|---|
| 頁面畫布 | `canvas-soft` | `#f6f5f4`；完整頁面不得以純白或深色作為主畫布。 |
| 表面／欄位 | `surface` | `#ffffff`；卡片、面板、modal、輸入欄位。 |
| 主要文字 | `ink` | `#000000`（實作可用接近黑）；次要文字 `#31302e`，輔助文字 `#615d59`。 |
| hairline | `hairline` | `#e6e6e6`，用於卡片邊界與分隔線。 |
| 唯一結構與 CTA 色 | `primary` | `#0075de`；pressed `#005bab`；文字為白色。連結、active 與 focus 亦使用 primary。 |
| 深靛夜色 | `secondary` | `#213183`；**只可作單一 hero-band**，不可作勝利 modal、side bar、卡片或其他結構面。 |
| sticker 裝飾色 | sky／purple／pink／orange／teal／green | 僅限 icon tile、confetti、loader 等裝飾；不得作 CTA、按鈕填色或結構背景。 |
| 語意狀態 | 成功／錯誤／上下線／A-B 結果 | 可維持既有綠、橘、紅等狀態色，且必須附有文字、字母或圖示等非色彩線索；不可變成主要 CTA 或大面積結構面。 |

一般文字與背景對比至少 4.5:1；大字與非文字 UI（含 focus indicator）至少 3:1。placeholder 與純裝飾可使用 faint 色，但不得傳達必要資訊。

## 2. 字體與層級

- 全站唯一字體家族：`Inter, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif`。不得使用 SF Pro、`ui-monospace` 或其他 monospace 作為可見 UI／數字／紀錄的字體。
- 數字、房號、猜測輸入與紀錄仍使用 Inter；需要對齊時使用 lining/tabular numerals，而非更換字體家族。
- 標題使用 700 與緊湊 tracking；body 維持 400、16px、約 1.5 line-height。可用層級：40/26/22/20px 標題、16px body、15px dense body、14px caption、12px eyebrow。
- 不可用重字重當作 body 的唯一層級手段；以標題、留白與文字色建立閱讀順序。

## 3. 元件規格

### 圓角、邊界與陰影

| 元件語意 | 圓角 | 表面／深度 |
|---|---:|---|
| 文字、數字、房碼與聊天輸入 | 4px | 白色、1px hairline；不可做 pill。 |
| utility／nav／次要操作 | 8px | 白色或暖白、hairline。 |
| 一般內容卡、紀錄卡、圖框、遊戲面板 | 12px | 白色、hairline；預設不需明顯陰影。 |
| modal、toast、大型容器／image well | 16px | 白色 surface；modal／toast 可用低調層疊陰影。 |
| 主／次 CTA、badge、圓形 icon | 9999px | CTA 使用 primary 或白色次要 surface；不可套用到輸入欄。 |

陰影必須是極淡的多層陰影；不可使用硬邊、重投影或漸層填色來製造層級。

### 按鈕與輸入

- Primary CTA：`#0075de`、白字、pill、按下改 `#005bab`。
- Secondary CTA：白色 surface、ink、pill，可有極淡陰影或 hairline。
- Utility button：白色／暖白、ink、8px、`4px 14px` 級的緊湊 padding。
- 行動裝置可操作控制的有效 hit area 至少 44×44px；視覺尺寸較小時必須以 padding 或等效點擊區補足。
- 焦點必須以清楚可見的 primary focus ring 呈現，不得只依賴顏色、hover 或移除 outline。

### Modal、Party Sidebar 與 Toast

- **Modal**：白色 16px elevated surface、hairline 與低調 Level-2 shadow。慶祝 confetti 可用 sticker 裝飾色，但不能把 modal 底色改為深靛。內容與主要操作在 390px 寬時必須完整置中、可見、可點，不能裁切或超出 viewport。
- **Party sidebar**：是 app-shell 資訊面板，不是 hero。使用白色／暖白 surface、hairline、12px（一般面板）或 16px（大型容器）圓角；active/focus 使用 primary，玩家上下線仍可用語意狀態點。不得使用深靛整塊底色。
- **Toast／notification**：白色 16px elevated surface、ink-secondary 文字、primary icon、低調陰影。暫時出現時不得覆蓋必要內容、文字或主要控制；在 mobile 必須避開正在閱讀／操作的區域，且「shown state」必須可被視覺測試看見。

## 4. 版面、響應式與可及性

- Desktop 驗收尺寸為 1280×800；mobile 為 390×844。主要內容在 desktop 應置於寬而集中的容器；mobile 改為單欄堆疊。
- 任何納入狀態均不得出現水平捲動、右側裁切、被固定浮層遮住的重要內容，或無法操作的控制。
- 多欄 party／聊天／紀錄在 mobile 必須自然堆疊；輸入、CTA、modal 與 toast 可用寬度不得超出 viewport。
- 鍵盤 `Tab` 到每個互動群時，`:focus-visible` 必須存在且 outline 或 box-shadow 清楚可見。
- 驗收以 PLAN §4 的 MX-01～MX-16 為準：每個狀態均在 desktop/mobile 檢查畫面、focus 與 `document.documentElement.scrollWidth <= window.innerWidth`。

## 5. 已凍結 findings 的規格對照

| Finding | 規格依據 | 實作後應達成的結果 | 矩陣 |
|---|---|---|---|
| D-001 | Modal 為白色 16px elevated surface；深靛只用單一 hero。 | 勝利 modal 不再以深靛作結構底色，圓角為 16px；慶祝色僅為裝飾。 | MX-07 D/M |
| D-002 | Mobile 不得裁切、溢出或讓必要 action 不可操作。 | 勝利 modal 於 390×844 完整置中、可見、可操作且無水平溢出。 | MX-07 M |
| D-003 | sidebar 是淺色 app-shell 面板；深靛不可重複作結構面。 | party sidebar 改為 surface/canvas、hairline 與 primary active/focus。 | MX-13 D/M |
| D-004 | 全站可見 UI 使用 Inter；數字採 lining/tabular 規則而非 monospace。 | 猜測輸入、房碼、紀錄、sidebar target 等呈現 Inter。 | MX-04、05、10–14 D/M |
| D-005 | Toast 不得遮蔽必要資訊或控制。 | mobile toast 不遮住房間名單、遊戲資訊、規則或操作。 | MX-10–14 M |
| D-006 | shown toast 必須以白色 elevated toast 完整呈現並可審查。 | notification fixture／快照看得到 card、icon 與文字，不得為空白。 | MX-15 D/M |

## 6. 實作與驗收禁止事項

- 不得恢復 Apple token、SF Pro、18px 一般卡片、黑色全域導覽或多個深色結構 tile。
- 不得以 sticker 色作主要 CTA／結構背景，或以更新快照取代實際設計審核。
- 不得削弱對比、focus、44px hit area、功能回歸或無水平溢出的驗收門檻。
- 每個視覺修正必須對應 D-001～D-006 與至少一個 MX ID；未列為 must-fix 的偏好不得自行擴張施工。
