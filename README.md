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
| `npm test` | 单元测试（导出统计和 CSV） |

摄像头和麦克风只在 HTTPS 或 `localhost` 下可用。要在别的设备上测试，用 Vercel 的预览部署，或者 `npx next dev --experimental-https`。

## 页面

| 路径 | 用途 |
|---|---|
| `/a` | Mode A（Repeated Reading）的 session：研究者设置 → 学生完成六个活动 → 保存 |
| `/researcher` | 研究者页面：本机的 session 列表和 ZIP 导出。需要 PIN，默认值见 `src/features/researcher/pin.ts`，可用环境变量 `NEXT_PUBLIC_RESEARCHER_PIN` 修改 |
| `/spike` | M0 技术验证：摄像头滤镜、顺序播放、录音、本地保存和回放，用来在目标浏览器上确认行为、比较两种麦克风策略 |

Mode B（`/b`）还没有实现。

## 内容

材料放在 `public/content/<id>/`，由 `material.json` 加音频和图片组成，格式见 [src/content/schema.ts](src/content/schema.ts)；`manifest.json` 列出可选的材料，`roster.json` 是学生的匿名编号。加载时会校验，格式有问题会在设置页直接报错。

目前只有一份 `demo` 材料，音频是机器合成的、图片是色块、逐词时间戳是按词长估算的，都只是占位，不是研究材料。`/spike` 页上的音频和滤镜图形同样是占位。

## 目录

```
src/
  app/            路由
  features/       按功能组织的界面和状态：session 流程、各个活动、研究者页面、spike
  content/        材料的格式校验和加载、固定的感受问卷
  media/          音频播放、录音、摄像头、人脸滤镜
  data/           本地数据库、事件日志、导出
  theme/          固定主题（theme.ts 是唯一来源）
  components/ui/  基础组件
public/
  content/        材料、名单
  mediapipe/      人脸模型（wasm 运行时在安装时复制进来）
  spike/          验证页用的占位音频
```
