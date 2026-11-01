# 八卦命盘 · 六爻梅花占

基于《周易》的 64 卦占卜排盘 Web 应用：**六爻纳甲**与**梅花易数**双起卦模式，
内置规则断卦引擎与可选的大模型 AI 解卦，支持占卜历史记录。前后端分离架构
（前端纯 HTML/CSS/JS，后端 Python Flask REST API）。

![首页](docs/screenshot-home.jpg)

![卦盘结果](docs/screenshot-plate.jpg)

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 六爻摇卦 | 三枚铜钱 3D 掷卦动画（手动六掷 / 自动），完整装卦：京房纳甲、六亲、六神、世应、动爻变卦、互卦、伏神、旬空、月破、六冲六合卦 |
| 梅花易数 | 时间起卦（农历年支+月日+时辰）与数字起卦，本互变三卦展示，体用生克分析 |
| 规则断卦 | 以用神（按问事类别：求财、姻缘、事业、考试、健康等 10 类）旺衰、日月生克冲合、动爻生克、进退神、回头生克、世应关系推演评分（0-100）与吉凶断语 |
| AI 解卦 | 页面右上角「模型接入」即可接入任意 OpenAI 兼容接口（DeepSeek / 智谱 / Kimi / 通义 / OpenAI / 本地 Ollama …），带服务商预设、密钥脱敏、连通性测试、模型列表拉取；流式输出四节结构化解读，思维链进度实时显示、断线自动重试 |
| 历史记录 | SQLite 自动保存每次起卦（时间、所问、卦象、断语、AI 解读），可回看、可删除 |

## 快速开始

```bash
# 1. 安装依赖（Python 3.8+）
cd backend
pip install -r requirements.txt

# 2. 启动服务
python app.py
# * 八卦命盘服务已启动: http://127.0.0.1:8000
```

浏览器打开 <http://127.0.0.1:8000> 即可使用（Windows 可直接双击 `启动.bat`）。
后端同时托管前端静态页面并开启 CORS，也可以用任意静态服务器单独部署 `frontend/`
目录，只要能访问到后端 API 即可。

## 配置 AI 解卦（可选）

两种方式任选其一。

**① 页面内配置（推荐）**：启动后点右上角「模型接入」，选服务商预设，或直接填
Base URL / API Key / 模型名，先「测试连接」确认可用，再「保存并启用」。
配置写入 `backend/config.json`，密钥只留在本机，接口回给浏览器的始终是脱敏后的
`sk-1***abcd`；也可以点「拉取列表」从 `/models` 读出该 Key 可用的模型。

**② 直接改文件**：复制 `backend/config.example.json` 为 `backend/config.json`，
填入任意 OpenAI 兼容接口的 Key：

```json
{
  "llm": {
    "base_url": "https://integrate.api.nvidia.com/v1",
    "api_key": "nvapi-你的Key",
    "model": "z-ai/glm-5.3-flash",
    "temperature": 0.7,
    "max_tokens": 16384,
    "disable_thinking": true
  }
}
```

常用服务商只需改 `base_url` 与 `model`：

| 服务商 | base_url | model 示例 | 备注 |
| --- | --- | --- | --- |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `z-ai/glm-5.3-flash` | 免费，公共接口排队慢（全程约 2~5 分钟），页面会显示模型思考进度 |
| DeepSeek 官方 | `https://api.deepseek.com/v1` | `deepseek-chat` | 快，max_tokens 用默认即可 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` | 无需 Key；请求会自动绕过系统代理 |

也可用环境变量 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 覆盖；配置改动即时生效，无需重启。

**思考型模型注意**（GLM-5.3、DeepSeek-R1 类）：思维链与正文共享 `max_tokens`，
若配置过小会出现"模型未返回正文内容"的提示，把 `max_tokens` 调大即可；
`disable_thinking: true` 会尝试携带关闭思考的参数（接口不支持时自动去掉）。
后端已内置：思维链进度实时回传（页面显示"已思考 N 字"）、中文 UTF-8 解码、
连接重置自动重试（最多 3 次）。

## 部署到线上

> 这不是纯静态站：排盘、断卦、历史记录都在 Python 后端，**GitHub Pages 只能托管
> `frontend/` 那张静态页，接口会全部 404**。所以要么用支持 Python 的托管平台，
> 要么找一台能跑 Docker 的服务器。

### 方式一：Render（最省事，有免费额度）

1. 把仓库推到 GitHub（见下方[推到 GitHub](#推到-github)）；
2. 打开 <https://render.com> → New → **Blueprint**，选中这个仓库；
   Render 会读根目录的 `render.yaml` 自动建服务；
3. 想开放 AI 解卦，就在服务的 Environment 里填 `LLM_BASE_URL` / `LLM_API_KEY` /
   `LLM_MODEL` 三个变量（不填则只有规则断卦，页面会自动隐藏 AI 入口）；
4. 部署完拿到 `https://xxx.onrender.com` 就能访问。

免费实例闲置一段时间会休眠，首次访问要等几十秒；实例重启后 SQLite 里的历史记录
会被清空（免费层不提供持久磁盘）。要长期保存历史，挂一个 Persistent Disk 把
`backend/data` 指过去，或改用下面的 Docker 方案。

### 方式二：Docker（自己的服务器、NAS、Zeabur、Fly.io 都行）

```bash
docker build -t bagua-mingpan .
docker run -d -p 8000:8000 \
  -e PUBLIC_MODE=1 \
  -e LLM_BASE_URL=https://api.deepseek.com/v1 \
  -e LLM_API_KEY=sk-你的Key \
  -e LLM_MODEL=deepseek-chat \
  -v $(pwd)/data:/app/backend/data \
  --name bagua \
  bagua-mingpan
```

`-v` 把 SQLite 挂在宿主机上，容器重建也不丢历史。

### 方式三：Railway / Heroku 这类平台

根目录已带 `Procfile`，直接用即可；`PORT` 由平台注入，程序会自动读取。

### 部署时的环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` / `HOST` | 监听端口与地址，平台一般自动注入 |
| `PUBLIC_MODE=1` | **公开部署必开**：锁死 `/api/llm/config`、`/api/llm/test`、`/api/llm/models`，防止访客改你的模型地址（那也是个 SSRF 口子）或刷爆你的额度；同时对 AI 解卦按 IP 限流 |
| `AI_RATE_LIMIT` / `AI_RATE_WINDOW` | 限流阈值，默认每个 IP 600 秒 5 次 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 覆盖 `config.json`，优先级最高；生产环境请用这个而不是提交配置文件 |

**千万别把 `backend/config.json` 提交上去**——`.gitignore` 已经把它和 `data/*.db`
挡掉了。如果曾经提交过，先去服务商后台吊销那个 Key。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | 元信息（问事类别、LLM 是否已配置、公开模式是否锁定） |
| GET | `/api/healthz` | 健康检查（部署平台探活用） |
| POST | `/api/chart/liuyao` | 六爻排盘：`{"lines":[7,8,9,7,7,7], "question":"…", "category":"shiye", "time":"ISO时间"}`，lines 自下而上，6老阴/7少阳/8少阴/9老阳 |
| POST | `/api/chart/meihua` | 梅花排盘：`{"mode":"time"}` 或 `{"mode":"number","n1":10,"n2":3}`，其余同上 |
| GET | `/api/history` | 历史列表（`?limit=&offset=`） |
| GET | `/api/history/<id>` | 历史详情（含完整卦盘 JSON） |
| DELETE | `/api/history/<id>` | 删除记录 |
| POST | `/api/interpret/llm` | AI 解卦（流式纯文本）：`{"record_id": 1}` |
| GET | `/api/llm/config` | 当前模型配置（密钥脱敏）与服务商预设 |
| POST | `/api/llm/config` | 保存模型配置，写入 `backend/config.json`（`api_key` 留空表示不修改，`clear_key:true` 清空） |
| POST | `/api/llm/test` | 用表单里尚未保存的值试连一次，返回延迟与模型回复 |
| GET | `/api/llm/models` | 拉取模型列表：`?base_url=…&api_key=…` |

## 项目结构

```
backend/
  app.py                  # Flask 入口与路由
  requirements.txt
  config.example.json     # LLM 配置模板
  core/
    constants.py          # 干支/五行/八卦/纳甲/八宫/六亲/六神等易学常量
    hexagram.py           # 卦象模型（卦序、卦宫、世应、互变卦、伏神、冲合）
    calendar_utils.py     # lunar-python 封装（农历、四柱干支、时辰、旬空）
    liuyao.py             # 六爻排盘引擎
    meihua.py             # 梅花易数引擎
    interpret.py          # 六爻规则解读引擎
    llm.py                # OpenAI 兼容客户端：配置读写、连通性测试、SSE 流式
    db.py                 # SQLite 历史记录
  data/
    hexagram_texts.json   # 64 卦卦辞爻辞（386 条，含用九用六）
    divination.db         # 历史记录库（运行时生成）
  test_core.py            # 核心正确性测试（134 项断言）
frontend/
  index.html
  css/style.css           # 古典中式样式 + 入场/掷卦/印章动效
  js/app.js               # 交互、渲染与「模型接入」面板逻辑
_research/                # 卦爻辞数据来源与加工脚本（可删）
docs/                     # README 截图
Dockerfile                # 容器部署
render.yaml               # Render 蓝图（一键建服务）
Procfile                  # Railway / Heroku 启动命令
启动.bat                  # Windows 双击启动（纯 ASCII + CRLF）
```

## 正确性验证

`python test_core.py` 运行 134 项断言，全部通过，覆盖：

- **八宫卦序全表**：64 卦卦宫、卦位、世应与京房八宫完全一致
- **纳甲六亲**：如乾为天六爻（子孙甲子水 / 妻财甲寅木 / 父母甲辰土 / 官鬼壬午火 /
  兄弟壬申金 / 父母壬戌土）逐爻核对
- **六神起法**（日干起青龙等）、**旬空**（六十甲子逐旬）
- **伏神**：天风姤缺妻财伏二甲寅、风水涣缺官鬼/妻财伏己亥/己酉
- **六冲 / 六合卦**：十冲八合全表
- **梅花「观梅占」经典案例**：辰年十二月十七日申时 → 泽火革之泽山咸、用克体，
  与《梅花易数》原书记载一致
- **变卦六亲按本宫装**（依《卜筮正宗》《增删卜易》主流做法，与地支按变卦装相区分）
- 随机 200 次排盘无异常；全部 10 个问事类别的排盘与解读可运行

卦爻辞文本取自开源数据（open-iching，原文为公有领域古籍），已逐条人工核对，
勘误 1 处（乾卦九二「见龙再田」→「见龙在田」）。

## 免责声明

本项目仅作传统文化研究与娱乐参考，卦理断语由规则与语言模型生成，
不构成医疗、投资、法律等任何现实决策依据。
