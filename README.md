# Class3D Gallery v1.2

班級作品 3D 展示平台的可執行架構預覽。前端已提供 Vite 入口與互動式 3D 展場，並串接目前的資料模型。

## 本機啟動

```bash
npm install
npm run dev
```

正式建置與型別檢查：

```bash
npm run check
npm run build
```

## 目前狀態

已具備：

- 教師/學生角色模型
- 後端同步接口
- Dashboard 統計架構
- 作品分享 URL
- 學生個人頁資料模型
- 展示模式切換

目前畫面使用示範資料；後端保持 Adapter 設計，可接 Firebase / Supabase，但尚未連接雲端、正式登入或權限規則。

下一階段：

- 完整雲端資料庫
- 權限管理
- 正式部署文件
