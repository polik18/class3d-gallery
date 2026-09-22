# Class3D Gallery CLI Agent 入口

本專案使用 repo 內的持久化 checkpoint，對話紀錄不是施工狀態的權威來源。

## 每次接手必做

1. 執行 `npm run project:status`。
2. 執行 `git status --short --branch`，保留所有既有修改；不得用 reset、checkout 或 clean 丟棄未知變更。
3. 讀取 `project/checkpoint.json`、`project/handoffs/current.md` 與目前任務對應的 `project/tasks/*.md`。
4. checkpoint、Git HEAD 或工作樹若不一致，先執行 `npm run project:validate`，標記並處理 `RECOVERY_REQUIRED`，不得自行宣稱已完成。

## 狀態與驗收

- `project/checkpoint.json` 是即時施工狀態權威；`project/task-manifest.json` 是固定工作分解與依賴。
- 任務依序使用 `PENDING`、`IN_PROGRESS`、`VERIFYING`、`ACCEPTED`。異常使用 `NEEDS_FIX`、`BLOCKED` 或 `RECOVERY_REQUIRED`。
- 開工使用 `npm run task:start -- <task-id>`。
- 每個可恢復節點使用 `npm run task:checkpoint -- --next "下一步"`。
- 驗證完成後先把任務設為 `VERIFYING`、保存 evidence、提交功能 commit，再以 `npm run task:finish -- <task-id> --commit <sha> --evidence <path>` 驗收。
- 沒有測試證據與 commit 的任務不得標記 `ACCEPTED`。

## 固定產品決策

- 作品檔、展覽標題、按讚、留言與人氣全部保存在同一台展覽電腦的瀏覽器。
- 不建立後端，不做跨裝置同步，不把作品或互動資料傳到伺服器。
- 發布平台維持 GitHub Pages；本機資料使用 Object URL 與 IndexedDB。
- 任何自動展示都不得增加人工人氣統計。

## 修改原則

- 在 `feature/multimedia-gallery-v2` 分支施工；已驗收里程碑才合併 `main`。
- 一次只認領一個 task；跨 task 的決策寫入 `project/decisions/`。
- 日誌與證據放在 `project/`，不要把原始長輸出塞入本檔。
- 每次交接需留下：已完成內容、修改檔案、驗證結果、未完成事項與下一個確切步驟。
