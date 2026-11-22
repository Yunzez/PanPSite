# Read and Act

给小学三年级英语学习者用的朗读练习 web app，用于一项教育学研究。研究者打开固定的 A 或 B 链接，学生按顺序完成：学单词 → 听故事 → 逐句跟读 → 复读（A）或角色扮演（B）→ 理解题 → 感受问卷。

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 技术栈：Next.js（App Router）+ TypeScript、Tailwind、Zustand，部署在 Vercel
- 数据：v1 只存浏览器本地（IndexedDB），由研究者手动导出

## 开发

```bash
npm install
npm run dev
```

`npm install` 之后会自动把 MediaPipe 的 wasm 运行时复制到 `public/mediapipe/wasm/`（已被 git 忽略）。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |

摄像头和麦克风只在 HTTPS 或 `localhost` 下可用。要在别的设备上测试，用 Vercel 的预览部署，或者 `npx next dev --experimental-https`。

## 当前进度

M0 技术验证页在 `/spike`：摄像头滤镜、顺序播放、录音、本地保存和回放在同一页上跑通，用来在各个目标浏览器上确认行为、比较两种麦克风策略。页面上的示范音频和滤镜图形都是占位内容，不是研究材料。

## 目录

```
src/
  app/            路由
  features/       按功能组织的界面和状态（目前只有 spike）
  media/          音频播放、录音、摄像头、人脸滤镜
  data/           本地数据库
  theme/          固定主题（theme.ts 是唯一来源）
  components/ui/  基础组件
public/
  mediapipe/      人脸模型（wasm 运行时在安装时复制进来）
  spike/          验证页用的占位音频
```
