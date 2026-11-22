# Read and Act — 技术设计文档（初稿）

- 需求来源：[Read and Act: App Design and Training Protocol](https://docs.google.com/document/d/1E5ZqGVcoUTjTp1DgBZCEboNz70He_CuX0GANIp1AMLg)（下文的“需求 §N”指其 App Development 页的章节）
- 状态：初稿，2026-11-21。标了【假设】的地方是我先替研究者做的默认选择，对应第 14 节的待确认问题。
- 进度（2026-11-21）：M0 验证页、M1、M2（Mode A 全流程和导出）、M3（Mode B）已实现。尚未实现：研究者的 session 内面板、中断后恢复、设置页的麦克风自检；滤镜在真人脸上的效果和 Safari 还没有实测。

## 1. 产品一句话

研究者在浏览器里打开固定的 A 或 B 链接，选好学生 ID 和材料后把设备交给三年级学生；学生按固定顺序完成：学单词 → 听故事 → 逐句跟读 → 复读（A）或角色扮演（B）→ 理解题 → 感受问卷 → 保存。App 记录录音和操作日志，研究者事后批量导出。

A/B 的差别只有三样：角色名、动物耳朵鼻子滤镜、场景背景。其余组件、内容、奖励规则、音频链路完全相同。

## 2. 已定决策

| 事项 | 决定 | 原因 |
|---|---|---|
| 框架 | Next.js（App Router）+ TypeScript | 指定 |
| 托管 | Vercel 默认域名 | 指定；采集不在中国大陆，无访问问题 |
| 样式 | Tailwind | 指定 |
| 状态 | Zustand | 指定 |
| 主题 | 固定的 `useTheme`，不可切换，A/B 共用 | 指定；避免主题成为实验干扰变量 |
| 目标环境 | 标准 web app，面向现代浏览器；布局按横屏平板尺寸设计（需求指定 iPad 横屏） | 不为某个设备写专门代码；开发在桌面 Chrome，每个里程碑在 Safari 上过一遍 |
| 存储 | v1 只存浏览器本地（IndexedDB），研究者手动导出 ZIP；数据结构按 v2 可上传来设计（见 §7） | 无后端；录音不上第三方云，IRB 路径最简单 |
| 离线 | v1 不做 PWA；设置页预加载全部资源后才能开始 | session 中途断网不受影响，实现简单 |
| 服务端 | 核心流程不依赖任何服务端代码 | 可纯静态导出，随时能换托管 |
| 第三方资源 | 模型、字体、音频全部放站内 | 少一个外部依赖，加载更快 |
| 不做 | 语音识别、发音打分、自动切词、自动生成内容、保存视频 | 需求明确排除 |

## 3. 路由与页面

| 路由 | 使用者 | 内容 |
|---|---|---|
| `/a`、`/b` | 研究者 → 学生 | 同一个 `SessionApp`，mode 由路由决定并写入 session 记录，界面上没有切换入口 |
| `/researcher` | 研究者（PIN） | session 列表、导出、设置（轮数等）、名单维护 |
| `/` | — | 空白页，不放任何链接 |

`/a`、`/b` 进入后整个 session 都在同一个页面内推进，URL 不变、不整页刷新。原因：整页刷新会丢掉音频解锁状态，有的浏览器还会重新弹摄像头和麦克风授权。

一个 session 内的阶段：

```
setup（研究者） → handover（"Let's read!" + Start） → 6 个活动 → saving → complete
```

### setup（研究者设置页）
- 选学生 ID（来自名单）、材料（来自 manifest）；可勾选“本次附加最终角色反馈”。
- 设备自检：扬声器试听、麦克风电平、（B）摄像头和滤镜预览。授权弹窗在这一步由研究者处理掉。
- 预加载该材料的全部音频、图片，以及（B）人脸模型，显示进度；未完成不能继续。
- 如果该学生该材料有未完成的 session，提示“继续 / 作废并新开”，并记录一次中断。

## 4. 活动流程与状态机

每个活动是一个显式状态机，状态迁移是 Zustand store 里的 action。“学生录音时不播放任何示范或同伴音频”这类验收项由状态机结构保证，不靠零散的判断。

| # | 活动 ID | 需求 | 状态 |
|---|---|---|---|
| 1 | `words` | §3 | 每个词：`model`（按内容里定义的顺序逐段播放并高亮）→ `practice`（点分块发音、Play Model、Listen Again）→ Next；最后一个词 Done → 星星 |
| 2 | `listen` | §4 | `idle → playing ⇄ paused → ended`；Listen Again 重播；逐词高亮跟随播放进度 |
| 3 | `rehearse` | §5 | 每句：`modelPlaying → ready → recording → saving →` 下一句；全部角色的台词都读；B 中角色名和滤镜随当前台词自动切换 |
| 4 | `perform` | §6 | A：每句 `ready → recording → saving`。B：`roleSelect →` 每句若非本人角色 `partnerPlaying`，否则 `yourTurn → recording → saving`；一轮结束给星星；轮数可配置，默认 2 |
| 5 | `quiz` | §7 | 每题：选项可改，Next；记录首次作答、每次改动、最终作答 |
| 6 | `feedback` | §8 | 3 题，每题一屏、四个表情按钮、无默认选中、不能跳过；研究者勾选时追加 2 道最终反馈题（文字按钮） |

通用规则：
- 主按钮 Record → Done：Done 同时完成停止、保存、前进三件事。
- 保存失败时不前进，录音留在内存里并显示重试（需求 §6、§9）。
- 重读产生新的 take，永不覆盖旧录音。
- 不做基于时间的自动前进。
- 【假设】`listen` 里 Next 在完整听完一遍后才可点。
- 【假设】`rehearse` 里 Done 之后自动高亮下一句并播放其示范；Read Again 回到刚读完的那一句重录，Hear My Reading 播放最近一次录音。
- 【假设】`perform`（B）每一轮开始时重新选角色，可以和上一轮相同。
- 【假设】`quiz` 作答后不显示对错。
- 【假设】`words` 里只有一个 Listen again 按钮，重播当前词的整段示范；需求里的 Play Model 和 Listen Again 合并成了这一个。示范完整播过一遍后才能点 Next。
- 【假设】Mode A 不显示角色名；`perform` 朗读全部台词。
- 【假设】`listen` 在两个模式下完全相同：纯文本，不显示角色名，不开摄像头（需求写的是两个模式用同样的示范内容）。
- 【假设】Mode B 的 `perform` 每轮先选角色：点角色时舞台上预览对应滤镜，点 Next 才确认；只列出有台词的角色。Listen carefully 播放自己当前这一句的示范。

Mode B 的摄像头从设置页开到 `perform` 结束，之后的理解题和问卷不再占用摄像头。设置页的就绪面板里有一个带滤镜的预览，供研究者确认摄像头正常。目前麦克风和摄像头是两次授权提示。

实现方式：活动由 session 流程启动和结束（每个活动导出一个 `enter` / `leave` 控制器），不依赖组件挂载，所以声音和录音在每个活动里只会启动一次。`rehearse` 和 `perform` 共用一个朗读循环，区别只在“步骤计划”（每一步是学生读还是同伴读）和是否先播示范；Mode B 的角色扮演只需要换一份计划。`quiz` 和 `feedback` 共用一个“一屏一题”的状态机。

## 5. 内容模型

内容全部由研究者提供，放在 `public/content/` 下，和代码分离；加载时用 zod 校验，缺文件或字段在设置页就报错，不会带到学生面前。

```ts
type Material = {
  id: string;
  version: string;            // 内容改动就升版本，写入每条记录
  title: string;
  characters: Character[];
  scene?: { image: string };  // 仅 B 使用
  words: WordItem[];
  lines: Line[];               // 按剧本顺序
  quiz: Question[];
};

type Character = {
  id: string;
  name: string;                               // 仅 B 显示
  // 仅 B 使用；B 模式下每个有台词的角色都必须有。
  // 目前只有 "shapes"（纯色椭圆的占位画法：耳朵位置、颜色、相对两眼间距的大小）；
  // 拿到正式美术后在旁边加 "sprites"（PNG 贴图），用同一组锚点。
  filter?: { type: "shapes"; earAnchor: "top" | "side"; /* 颜色和尺寸 */ };
};

type WordItem = {
  id: string;
  text: string;
  image: string;
  chunks: { text: string; audio: string }[];  // 研究者定义的分块，如 ex / pl / ore
  // 示范序列：按顺序播放，每一步高亮指定分块或整个词
  model: { audio: string; highlight: number[] | "all" }[];
};

type Line = {
  id: string;
  characterId: string;
  text: string;
  audio: string;                               // 每句一个音频文件
  words?: { start: number; end: number }[];    // 每个词的起止毫秒，用于逐词高亮
};

type Question = {
  id: string;
  version: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId?: string;                    // 只用于导出时计分，不在界面显示
};
```

- 逐词时间戳 `words` 由一个离线脚本做强制对齐生成，人工抽查；缺失时退化成逐句高亮。
- 感受问卷（§8）是 App 级别的固定内容，带版本号，不放在材料里。
- 学生名单 `public/content/roster.json` 只有匿名 ID；研究者页面可以在本机临时添加 ID。

## 6. 媒体层

四个互相独立的模块，活动代码只通过它们的接口使用媒体能力。

| 模块 | 职责 | 要点 |
|---|---|---|
| `AudioEngine` | 预加载、播放单段或序列、停止、进度回调 | Web Audio，一个 `AudioContext`，在 Start 点击时解锁；全部片段在设置页解码进内存 |
| `Recorder` | 开始、停止并返回 Blob | `MediaRecorder`；格式运行时用 `isTypeSupported` 选（Safari 通常是 `audio/mp4`）；A/B 用同一条链路，保证录音可比 |
| `Camera` | 前置摄像头预览（仅 B） | 镜像显示；画面只在本机处理，不保存、不上传 |
| `FaceFilter` | 人脸关键点 → 在 canvas 上贴耳朵和鼻子（仅 B） | MediaPipe Face Landmarker（`@mediapipe/tasks-vision`），wasm 和模型放 `public/mediapipe/`；按两眼间距缩放、按头部倾斜旋转；检测不到脸时隐藏贴图 |

布局（B，需求 §6）：上方是摄像头预览和场景背景，下方是大号台词和主按钮；滤镜不遮挡文字；当前句高亮，上一句和下一句保留可见。A 用同样的下半部分，上方留白或放标题。

防误操作：禁用双指缩放、下拉刷新和边缘回弹；竖屏时提示把设备横过来；用 Wake Lock 防止息屏。（用 iPad 时还可以开系统的“引导式访问”。）

## 7. 数据与存储

IndexedDB 是浏览器内置的本地数据库：按 key 存 JS 对象，可以建索引，可以直接存 Blob（音频文件），异步、带事务，容量按磁盘比例分配，远大于 localStorage。原生 API 比较啰嗦，用 Dexie 封装（Promise 接口、带 schema 版本迁移）。一个 session 的录音估计在 10MB 以内。它做不到的是跨设备共享：数据只在这台设备的这个浏览器里，这正是 v2 要上传的原因。

五张表：

| 表 | 主要字段 |
|---|---|
| `sessions` | `sessionId`、`studentId`、`materialId`、`materialVersion`、`mode`、`startedAt`、`endedAt`、`status`（进行中 / 完成 / 未完成）、配置快照、App 版本、设备信息、`exportedAt`、研究者备注、进度快照（用于恢复） |
| `events` | `sessionId`、`seq`、`t`（时间戳）、`tMono`（单调时钟）、`activity`、`type`、`payload` |
| `recordings` | `recordingId`、`sessionId`、`activity`、`round`、`lineId`、`characterId`、`take`、`startedAt`、`durationMs`、`mimeType`、`sizeBytes` |
| `recordingBlobs` | `recordingId`、`blob`（音频本体，和元数据分开存） |
| `responses` | `sessionId`、`kind`（quiz / feedback / finalFeedback）、`questionId`、`questionVersion`、`firstOptionId`、`changes[]`、`finalOptionId`、`finalOptionLabel`、`correct`（仅理解题，只用于导出）、`status`（已答 / 缺失） |

### 事件日志
只追加。需求 §10 要的各种计数和时长都不单独维护，导出时从事件算出来：

- `activity_start` / `activity_end`
- `model_play_start` / `model_play_end`（带原因：自动、Listen Again、Play Model）
- `chunk_tap`
- `partner_play_start` / `partner_play_end`
- `turn_wait_start`（"Your turn!" 出现）
- `record_start` / `record_stop`、`take_saved`、`take_save_failed`
- `own_playback_start` / `own_playback_end`
- `read_again`、`role_selected`、`round_complete`、`star_awarded`
- `answer_select`
- `support_marked`、`note_added`、`interruption`、`resume`
- `app_hidden` / `app_visible`（切到后台）

这样“等待时间 / 同伴播放时间 / 学生录音时间分别统计”“必需轮数与额外重读分开计”都是导出时的计算，不需要改采集代码就能加新指标。

### saving 阶段
每个 take 在点 Done 时就已写入本地。最后的 Saving... 做的是：核对事件日志里的每个 `take_saved` 都能在 `recordings` 表读到，把 session 标为完成，然后才显示 "Congratulations!"。失败则显示错误信息和研究者的 Try Again。

### 为 v2 上传做的准备
v2 的形态：本地库仍然是第一落点（session 不依赖网络），另加一个同步步骤把未上传的行发到服务端。服务端是和这几张表同构的 Postgres 表，加对象存储放音频。v1 现在就做下面几件事，到 v2 只需要加代码，不用迁移数据：

- 所有主键都是客户端生成的 UUID，不用自增 ID，多台设备的数据合并不会撞。
- `events` 只追加，`recordings` 写入后不改。上传就是“不存在则插入”，可以反复重试，没有冲突要处理。
- 每一行都带 `syncedAt`（v1 恒为空）和 `schemaVersion`。同步就是：查 `syncedAt` 为空的行 → 上传 → 回填时间。
- 行内容是纯 JSON（时间用毫秒时间戳），和将来请求体的形状一致。
- 音频本体单独一张表，上传确认后可以只删本体、保留元数据，释放空间。
- 读写都走 `SessionStore` 接口；v2 的同步是它旁边的一个独立模块，活动代码不动。

### 导出
研究者页面或 session 结束后的研究者面板，在浏览器内打包 ZIP，通过系统分享面板（存到“文件”或 AirDrop）交出去：

```
export_<日期>/
  sessions.csv
  events.csv
  recordings.csv      每个音频文件一行，含学生、session、材料、活动、轮次、台词、角色、take
  responses.csv
  summary.csv         每个 session 每个活动的时长、播放次数、轮数、重读次数、帮助次数
  audio/<studentId>/<sessionId>/<activity>_r<round>_<lineId>_<characterId>_t<take>.m4a
  raw/<sessionId>.json
```

导出后在 session 上记 `exportedAt`；研究者页面醒目显示“还有 N 个 session 未导出”。启动时申请持久化存储（`navigator.storage.persist()`）。

## 8. 研究者功能

- session 中：长按屏幕右上角约 1.5 秒呼出面板。
  - 一键标记“已提供帮助”（自动带上当前活动和台词）
  - 写备注、标记中断
  - 跳到下一个活动（当前活动记为未完成）、结束 session
  - 完成后：导出本次 session
- `/researcher`：PIN 只为挡住学生，不是安全措施；默认值在 `src/features/researcher/pin.ts`，部署时用环境变量 `NEXT_PUBLIC_RESEARCHER_PIN` 覆盖。导出分两步：先生成 ZIP，再由研究者点下载或分享，点了才记为已导出。session 列表、批量导出、轮数等设置、名单维护。历史记录不随新 session 改动。

## 9. Theme

`src/theme/theme.ts` 是唯一来源。根布局把它转成 CSS 变量，Tailwind 的 `@theme` 引用这些变量，所以类名（如 `bg-primary`、`rounded-card`）和 `useTheme()` 拿到的是同一份值。`useTheme()` 返回这份只读对象，供 canvas 绘制和动画使用。

默认用“晴空蓝”（可以整套换，只改这一个文件）：

| token | 值 | 用途 |
|---|---|---|
| `primary` / `primaryDark` / `onPrimary` | `#1E88D9` / `#1669AD` / `#FFFFFF` | 主按钮（Start、Next、Done） |
| `secondary` / `secondaryDark` / `onSecondary` | `#FFC83D` / `#D9A520` / `#2E2A47` | 次按钮、星星 |
| `accent` | `#FF6B5E` | 点缀、"Your turn!" |
| `record` / `recordDark` | `#EF4A54` / `#B8323B` | 录音按钮，只用在这里 |
| `highlight` | `#FFE27A` | 当前词、当前分块 |
| `background` / `surface` / `line` | `#FFF8EE` / `#FFFFFF` / `#E9DFCF` | 页面、卡片、描边 |
| `ink` | `#2E2A47` | 正文（对背景对比度 12.9:1） |

- 圆角：三档 `sm 8px / md 12px / lg 16px`；按钮和卡片用 `lg`，单词分块用 `md`，小元素用 `sm`。
- 尺寸：触控目标不小于 64px；主按钮高 80px；当前台词字号不小于 32px。
- 按钮样式：纯色 + 同色系深色描边，底边加厚，做出“可以按下去”的感觉。
- 字体：英文 Andika（`a`、`g` 是手写体字形，和小学教材一致），构建时打包进站内；中文用系统苹方。
- 动效：150–250ms；只有拿到星星时有一次轻微弹跳；遵循系统的“减弱动态效果”。

## 10. 状态管理

| store | 内容 | 持久化 |
|---|---|---|
| `useSessionStore` | session 元信息、当前阶段和活动、各活动的游标、星星数；action 即状态迁移，并同时写事件日志 | 是，快照写入 `sessions` 表，用于意外刷新后恢复 |
| `useMediaStore` | 预加载进度、麦克风和摄像头授权状态 | 否 |
| `useTheme` | 固定 token | — |

## 11. 目录结构

```
src/
  app/            a/ b/ researcher/ layout.tsx globals.css
  features/
    session/      SessionApp、store、阶段切换
    activities/   words/ listen/ rehearse/ perform/ quiz/ feedback/
    researcher/   设置页、面板、导出页
  media/          audioEngine.ts recorder.ts camera.ts faceFilter.ts
  data/           db.ts events.ts export.ts
  content/        schema.ts loader.ts feedbackItems.ts
  theme/          theme.ts useTheme.ts
  components/ui/  Button、Card、StarBar 等
public/
  content/        manifest.json roster.json <materialId>/{material.json,audio/,images/}
  filters/        <characterId>/{ears.png,nose.png}
  mediapipe/      wasm 和模型
scripts/          align-words（生成逐词时间戳）
```

## 12. 里程碑

| 阶段 | 内容 | 完成标准 |
|---|---|---|
| M0 技术验证 | 一个裸页面：摄像头 + 耳朵鼻子贴图 + 顺序播放 + 录音 + 写入 IndexedDB + 回放 | 在桌面 Chrome 和 Safari 上各连续跑 20 句不出错；定下麦克风常开还是每次开关、录音参数 |
| M1 骨架 | 项目脚手架、theme、基础组件、路由、内容加载（用一份假材料）、数据库和事件日志 | 假材料能通过校验并显示 |
| M2 Mode A 全流程 | 6 个活动 + saving + 导出 | A 链接从头走到尾，导出的 ZIP 完整 |
| M3 Mode B | 角色、滤镜、场景、选角、轮流朗读 | 需求 §11 中 B 相关的验收项通过 |
| M4 研究者功能 | 设置页自检、session 内面板、恢复、设置 | 中断后可恢复；帮助和备注出现在导出里 |
| M5 真实内容与验收 | 换上最终文本、音频、图片；按需求 §11 在实际使用的设备上逐条验收 | 全部验收项通过 |

先做 A 再做 B：B 等于 A 加上方的摄像头区域，这个顺序保证共用组件确实是共用的。

## 13. 风险

| 风险 | 应对 |
|---|---|
| Safari 内核在摄像头、录音、自动播放上和 Chrome 行为不同（iPad 上的 Chrome 也是 Safari 内核），例如麦克风开启时播放音量可能变小 | 只用标准 API；每个里程碑在 Safari 上过一遍；备选是每次录音才打开麦克风、录完释放 |
| 性能较低的设备上人脸追踪卡顿 | 降低检测频率并做插值 |
| Safari 清理本地存储导致丢数据 | 申请持久化存储；每个 session 后导出；未导出提示 |
| 学生误触离开页面 | 禁用手势；引导式访问；进度可恢复 |
| 逐词时间戳不准 | 脚本生成后人工抽查；可退化为逐句高亮 |

## 14. 待研究者确认

影响开发的先后顺序排列：

1. 实际用哪个浏览器、一共几台设备（型号不重要）。
2. IRB 对录音存放位置有没有要求（目前按只存本机、手动导出设计）。
3. 学生人数、材料份数、开始采集的时间。
4. 音频谁录、什么格式；耳朵、鼻子、场景背景的图谁出。
5. Mode A 里台词前显示角色名吗？第 6 步的 "assigned lines" 是全部台词，还是和 B 中一个角色等量的台词？
6. 理解题答完后显示对错吗？
7. Listen and Read 里 Done 会自动前进，那么 Hear My Reading 和 Read Again 针对的是哪一句？
8. Listen First 里可以没听完就点 Next 吗？
9. Read and Act 第二轮可以重新选角色吗？必须换一个吗？
10. "Activity timing is configurable" 在不自动前进的前提下具体指什么？只给研究者看已用时间吗？
11. 最终角色反馈题在哪几次 session 出现？A 模式的 session 也问滤镜那一题吗？
12. 星星显示在哪里？跨 session 累计吗？
