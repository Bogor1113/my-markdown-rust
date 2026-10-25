# 🗄️ 课件01-Oracle 数据库

| 年月日        | 版本   | 修改人 | 修改内容                                                                                |
| :--------- | :--- | :-- | :---------------------------------------------------------------------------------- |
| 2026-03-28 | V1.0 | 波哥  | 对标2026年一线互联网、政企大厂大数据开发真实岗位招聘JD、企业实操业务场景                                             |
| 2026-09-28 | V1.2 | 波哥  | 深度修订：修复隐式转换/连续登录等知识性错误；业务口径全部统一为电商；新增实训环境说明、AI使用约定、每章AI加餐、附录（建表脚本+语法对照表）            |
| 2026-09-28 | V1.3 | 波哥  | SQL 强化：新增 NTILE 分桶、CONNECT BY 层级查询；附录B 扩充 Oracle→Hive 迁移踩坑清单；新增附录C 电商 SQL 综合练习 10 题 |
| 2026-10-09 | V1.8 | 波哥  | 全库风格统一：开头模块顺序对齐、课程定位引用块标准化、分隔线统一                                                    |

> 📚   课程定位  ：大数据开发必备的 SQL 基础，配合 Hive 数仓构建
> 🎯   重点技能  ：SQL 查询、PL/SQL 编程、索引优化、表分区
> 💬   场景  ：面试官问"你 Oracle 平时怎么用？"你说"就查查 orders 表"——然后他沉默了 💀——现在谁还光会查表！都要能讲出电商业务场景！
> ✅   学完能做什么  ：你能用电商业务表写 SQL、讲业务，面试官就知道你是 2026 年人 🏄‍♂️

***

## 🗓️ 课时建议表

> 按   每课时 45 分钟  计，合计   28 课时 ≈ 3.5 天  （每天 8 课时）。
> PL/SQL 章节（第七、八章）互联网方向可略讲，政企/银行方向必讲。

| 章节               | 建议课时 | 必讲重点                                                | 可略过       |
| :--------------- | :--: | :-------------------------------------------------- | :-------- |
| 第一章 SQL 基础查询     |   3  | SELECT 语法、WHERE 过滤、GROUP BY 聚合、ORDER BY 排序          | 数学函数      |
| 第二章 集合运算与子查询     |   3  | UNION ALL vs UNION、IN/EXISTS 区别、相关子查询               | MINUS 详解  |
| 第三章 单行函数         |   2  | 字符函数、日期函数、转换函数                                      | 数值函数细节    |
| 第四章 分析函数         |   4  | ROW\_NUMBER/RANK/DENSE\_RANK  、SUM OVER 窗口、LEAD/LAG | NTILE 细节  |
| 第五章 多表关联         |   3  | INNER/LEFT/RIGHT JOIN、自连接、笛卡尔积陷阱                    | FULL JOIN |
| 第六章 DDL 与 DML    |   2  | CREATE TABLE、INSERT/UPDATE/DELETE、约束                | ALTER 细节  |
| 第七章 PL/SQL 编程    |   3  | 基本结构、游标、存储过程                                        | 函数、包      |
| 第八章 异常处理         |   1  | 预定义异常、自定义异常                                         | 异常传播      |
| 第九章 数据库对象        |   2  | 序列、视图、索引概念                                          | 物化视图      |
| 第十章 索引与优化        |   3  | 索引原理、索引失效 6 场景、执行计划                                 | HINT 语法   |
| 第十一章 Oracle 优化技巧 |   2  | 优化思路、SQL 改写                                         | 优化器模式细节   |
| 第十二章 面试高频问题      |   2  | 速查表 + AI 模拟面试                                       | —         |
| 合计               |  30  | <br />                                              | <br />    |

## ⭐ 各章面试权重速览

| 章节            | 面试频率          | 重要程度      |
| :------------ | :------------ | :-------- |
| 第四章 分析函数      | 🔥🔥🔥🔥🔥 必问 | ⭐⭐⭐ 核心    |
| 第五章 多表关联      | 🔥🔥🔥🔥 高频   | ⭐⭐⭐ 核心    |
| 第十章 索引与优化     | 🔥🔥🔥🔥🔥 必问 | ⭐⭐⭐ 核心    |
| 第二章 集合运算与子查询  | 🔥🔥🔥🔥 高频   | ⭐⭐ 重要     |
| 第六章 DDL 与 DML | 🔥🔥🔥 中频     | ⭐⭐ 重要     |
| 第九章 数据库对象     | 🔥🔥🔥 中频     | ⭐⭐ 重要     |
| 第十一章 优化技巧     | 🔥🔥🔥🔥 高频   | ⭐⭐⭐ 核心    |
| 第七章 PL/SQL    | 🔥🔥 低频（互联网）  | ⭐⭐ 重要（政企） |

## 🛠️ 实训环境说明

本课程所有 SQL 都在在在机房统一安装好的 Oracle 环境在在里练习，无需自己安装。

| 事项        | 说明                                          |
| --------- | ------------------------------------------- |
| 数据库       | 机房服务器上的 Oracle（老师会公布 IP / 服务名 / 端口）         |
| 连接工具      | SQL Developer 或 PL/SQL Developer（桌面图标见机房镜像） |
| 登录账号      | 老师统一发放的用户名/密码，每人一个独立 schema                 |
| 敲 SQL 的地方 | 打开「SQL 窗口」写查询，「命令窗口」跑脚本                     |
| 出错了先看     | 报错信息第一行（ORA-xxxxx 错误码），拿着它去问 AI             |

> 📌   开课前自检  ：连上数据库 → `SELECT 1 FROM dual;` 能返回 1，环境就 OK。连不上先举手找老师，不要自己重装。

## 🤖 AI 学习指南（本课程专用）

本课程配套 AI 工具为   DeepSeek  （chat.deepseek.com，注册免费）。。。从第一章开始，每章末尾都有「🤖 AI 加餐」。。，教你把 AI 变成 24 小时陪练。

三条铁律：

1. AI 是陪练，不是枪手  ——练习必须自己先写，写不出来才能问，且要求 AI「只给提示不给答案」。
2. AI 会一本正经地胡说  ——AI 给的 SQL 和结论，必须贴到 Oracle 里跑一遍验证。跑通了才算数。
3. 报错先问 AI 再举手  ——把「报错信息 + 你的 SQL + 表结构」三件套发给 DeepSeek，90% 的问题自己就能解决。

本课程高频提示词（复制即用）：

```text
我在学 Oracle SQL，执行下面的语句报错了。

【我的SQL】
<粘贴你的SQL>

【报错信息】
<粘贴 ORA-xxxxx 完整报错>

【表结构】
<粘贴建表语句或字段列表>

请：1. 解释报错原因（用零基础能懂的话）；2. 给出修改后的SQL；3. 告诉我这个错误以后怎么避免。
```

***

## 🔍 一、 SQL基础查询

> 💡   本章要解决的问题  ：不会SQL怎么写数据？从"连SELECT都不会"到"能完整写出一条查询语句"。本章是SQL一切的起点，零基础也能上手。
>
> 🚀   学习路线  ：认识数据库 → 基础查询 → 排序分组 → DUAL表 → 书写规范 → SQL执行顺序 → 高级分组
>
> 📚   前置知识  ：无（零基础可学）
> 🎯   学习目标  ：学完本章，你能写出完整的SQL查询语句，理解SQL执行顺序，处理NULL值。

### 📚 SQL核心词汇速查

💡   老司机带路  ：SQL命令都是英文单词或缩写，见词知意，多敲几遍自然记住！先把基础查词搞定，后续每章开头逐步引入新词汇。

| 单词/短语           | 含义               | 单词/短语             | 含义           |
| --------------- | ---------------- | ----------------- | ------------ |
| SELECT          | 查询（选择）           | FROM              | 从（哪张表）       |
| WHERE           | 条件过滤             | AND / OR / NOT    | 且 / 或 / 非    |
| ORDER BY        | 排序（ASC升序/DESC降序） | GROUP BY          | 分组           |
| HAVING          | 分组后过滤            | DISTINCT          | 去重           |
| AS              | 别名               | IN                | 在...之中       |
| BETWEEN ... AND | 介于...之间          | LIKE              | 模糊匹配         |
| NULL / IS NULL  | 空值 / 是空值         | COUNT / SUM / AVG | 计数 / 求和 / 平均 |
| MAX / MIN       | 最大 / 最小          | DUAL              | Oracle虚拟测试表  |

> 🤔   思考题  ：SQL被称为"结构化查询语言"，和Python/Java这种编程语言比，本质区别是什么？（答案：SQL是声明式语言——你告诉它"要什么"，不用告诉它"怎么做"）

> 💬   课堂讨论  ：有人说"SQL很简单，几天就能学会"，也有人说"SQL很深，三年没学透"。你们觉得SQL简单还是难？聊聊你们的看法。

***

### 🎯 1.1 认识数据库

> 💬   场景  ：面试官问"Oracle和MySQL有什么区别？"
>
> 🎯   学完能答  ：Oracle是大型企业级数据库，MySQL是互联网开源数据库

💡   一句话理解  ：数据库就是"存数据的仓库"——只不过这个仓库是电子化的，有严格的组织结构，存进去容易、找出来也快。

> 🔥   开学第一问：为什么要学 SQL ？
>
> 你可能会想："现在都 AI 时代了，还要学 SQL 吗？"
>
> 三个理由告诉你，SQL 不但没过时，反而更重要了：
>
> 1. 数据是所有公司的核心资产  ——只要公司有业务，就有数据；有数据，就得存在数据库里；要从数据库里拿数据，就得写 SQL。AI 再厉害，也得先有数据才能训练模型。
> 2. SQL 是数据行业的"普通话"  ——不管你做数据分析、数据开发、数据挖掘、产品经理，甚至运营，只要你要跟数据打交道，SQL 是标配。不会 SQL 等于进了数据行业不会说话。
> 3. SQL 很好学，见效很快  ——跟 Java、Python 比，SQL 语法简单得多。今天学 SELECT，明天就能查数据；这周学完基础，下周就能写报表。
>
> 📌   一句话  ：：：SQL 是数据行业的门槛技能，也是你拿高薪的第一张门票。：： 把 SQL 学扎实了，后面学 Hive、Spark、Flink 都是顺水推舟。

#### 📦 数据库里有什么？

想象一下 Excel 表格——

| Excel 概念    | 数据库对应概念        | 举例                                     |
| :---------- | :------------- | :------------------------------------- |
| 一个 Excel 文件 | 数据库（Database）  | `EC_DB`（电商数据库）                         |
| 一个 Sheet 页  | 表（Table）       | `orders` 订单表、`customers` 客户表           |
| 一列（A列、B列）   | 列 / 字段（Column） | order\_id、customer\_name、total\_amount |
| 一行（第2行、第3行） | 行 / 记录（Row）    | 一笔订单 = 一行数据                            |

> 📌   一句话记住  ：：：库里面有表，表里面有行有列：：。这是数据库最基本的结构，后面所有 SQL 都是围绕"查表里的数据"展开的。

#### 🏢 Oracle vs MySQL

💡   一句话理解  ：Oracle 像奔驰（稳、安全、贵），MySQL 像比亚迪（免费、开源、够用）。大公司用 Oracle，互联网公司用 MySQL。本章用 Oracle 学 SQL，80%语法 MySQL 通用。

| 维度 | Oracle       | MySQL          |
| :- | :----------- | :------------- |
| 公司 | 甲骨文（Oracle）  | 甲骨文（收购 Sun 得来） |
| 授权 | 商业收费，很贵      | 开源免费（社区版）      |
| 定位 | 企业级、金融级      | 互联网、中小型应用      |
| 语法 | PL/SQL（功能强大） | 标准 SQL 为主      |
| 特点 | 稳定、安全、功能全    | 轻量、快、生态好       |

> 💬   课堂讨论  ：你们觉得为什么互联网公司都用 MySQL 而不是 Oracle？——除了免费，还有什么原因？（提示：扩展性、云原生、人才成本……）

> 🤔   那我们为什么不学 MySQL 学 Oracle ？
>
> 很多同学会问这个问题。三个原因：
>
> 1. Oracle 是 SQL 的"完整版"  ——窗口函数、分析函数、PL/SQL 存储过程，Oracle 做得最全最成熟。先学 Oracle 这个"全集"，再看 MySQL 这个"子集"，一眼就能看懂。反过来学就会有很多"啊？原来还有这种操作"的盲区。
> 2. 银行、国企、大公司的核心系统大多用 Oracle  ——金融行业数据开发岗位，Oracle 是硬要求。
> 3. 语法 80% 通用  ——你 Oracle 学好了，到 MySQL 里基本不用重新学，就是几个函数名字不一样，查一下就知道了。

***

### 📝 1.2 基础查询

💼   工作场景：   每天到公司第一件事——连上 Oracle 查前一天的数据有没有正常入库。SELECT 是你和数据库对话的唯一方式，以下全是日常高频操作。

#### ▫️ 你的第一条 SQL

> 🖥️   跟着敲  ：打开 SQL 窗口，复制下面这条，按 F8 或 Ctrl+Enter 执行——恭喜你，这是你人生中第一条 Oracle SQL！

```sql
-- 🎯 你的第一条SQL：查订单表有多少条数据
SELECT COUNT(*) FROM orders;
```

> 📌   SELECT 语法骨架  （记住这个框架，后面所有查询都是在这个基础上加东西）：
>
> ```
> SELECT  要哪些列
> FROM    从哪张表
> WHERE   满足什么条件  ← 可选
> ```

#### ▫️ 基本查询与算术运算

```sql
-- 💼 查指定列：看订单表关键字段，数据有没有正常同步
SELECT order_id, customer_id, total_amount, status
FROM orders;

-- 💼 查所有列：快速看一眼数据全貌（生产环境慎用，大表会卡死）
SELECT * FROM orders;

-- 💼 算术运算：对金额做折扣计算——不用写Python，SQL直接算
SELECT order_id,
       total_amount,
       total_amount * 0.9 AS discount_price   -- 打9折
FROM orders;
```

💡   小知识  ：SQL 支持 `+ - * /` 四则运算，和数学里一样，先乘除后加减。

#### ▫️ WHERE 条件过滤

WHERE 是用得最多的子句————查全表是例外，加条件才是常态——。

```sql
-- 💼 = 等于：只查已支付的订单
SELECT * FROM orders WHERE status = 'PAID';

-- 💼 > < >= <= 比较：查金额超过1000的大额订单
SELECT * FROM orders WHERE total_amount > 1000;

-- 💼 BETWEEN AND：区间查询，查金额在100-3000之间的订单（含两端）
SELECT * FROM orders WHERE total_amount BETWEEN 100 AND 3000;
-- 等价于：WHERE total_amount >= 100 AND total_amount <= 3000

-- 💼 IN 列表：查多个状态的订单，比写多个OR简洁
SELECT * FROM orders WHERE status IN ('PAID', 'SHIPPED', 'COMPLETED');
```

#### ▫️ LIKE 模糊匹配

> 💡   两个通配符必须记住  ：
>
> * `%` ：匹配配配任意多个配配字符（0个、1个、100个都行）
> * `_` ：匹配配配恰好一个配配字符

```sql
-- 💼 % 匹配任意多字符：查客户编号以C开头的（C1001、C1002...）
SELECT * FROM orders WHERE customer_id LIKE 'C%';

-- 💼 % 可以放中间：查订单号里包含2024的
SELECT * FROM orders WHERE order_id LIKE '%2024%';

-- 💼 _ 匹配单个字符：查订单号第5位是A的（如 ORD-A1234）
SELECT * FROM orders WHERE order_id LIKE '____A%';  -- 4个下划线 + A + 任意

-- 💼 组合使用：姓张，名字总共两个字的客户
SELECT * FROM customers WHERE customer_name LIKE '张_';
```

> ⚠️   易错点  ：`LIKE '%xxx'` 这种种种左模糊种种查询用不到索引，大数据量下会很慢——第十章索引优化会详细讲。

#### ▫️ AND / OR / NOT 逻辑运算

多个条件组合时用 AND、OR、NOT。

```sql
-- 💼 AND：同时满足——已支付 AND 金额大于1000
SELECT * FROM orders WHERE status = 'PAID' AND total_amount > 1000;

-- 💼 OR：满足一个就行——已支付 OR 已发货
SELECT * FROM orders WHERE status = 'PAID' OR status = 'SHIPPED';

-- 💼 NOT：取反——不是已取消的订单
SELECT * FROM orders WHERE NOT status = 'CANCELLED';
```

> ⚠️   巨坑预警  ：：：AND 的优先级比 OR 高！：： 和数学里"先乘除后加减"一样，SQL 里"先 AND 后 OR"。
>
> ```sql
> -- ❌ 你以为的：状态是PAID或者SHIPPED，并且金额>1000
> -- ✅ 实际执行的：(状态=PAID) 或者 (状态=SHIPPED 且 金额>1000)
> SELECT * FROM orders WHERE status = 'PAID' OR status = 'SHIPPED' AND total_amount > 1000;
>
> -- ✅ 正确写法：加括号明确优先级
> SELECT * FROM orders WHERE (status = 'PAID' OR status = 'SHIPPED') AND total_amount > 1000;
> ```
>
> 📌   好习惯  ：只要有 AND 和 OR 混用，，，一律加括号，，，别靠优先级记——记不住还容易错。

#### ▫️ NULL 值处理

```sql
-- 💼 IS NULL：查还没付款的订单（payment_time 为空），催收系统要用
SELECT * FROM orders WHERE payment_time IS NULL;

-- 💼 IS NOT NULL：查已经付款的订单
SELECT * FROM orders WHERE payment_time IS NOT NULL;
```

> ⚠️   易错点  ：NULL 不能使用 `= NULL` 判断，必须用 `IS NULL`。`WHERE payment_time = NULL` 永远查不到数据——这不是 bug，是 SQL 标准规定的。
>
> 🔥   面试高频  ：NULL 的三个特性——
>
> 1. `NULL + 数字 = NULL`（任何值和 NULL 运算结果都是 NULL）
> 2. `NULL = NULL` 结果是未知（不是 TRUE），所以用 = 查不到
> 3. `COUNT(*)` 会统计 NULL 行，`COUNT(列名)` 会忽略 NULL 值

***

### 📊 1.3 排序与分组

💼   工作场景：   排序看排名、分组做汇总——这是做报表的两大核心操作。运营说"给我每个城市的销售额，从高到低排，只看100万以上的城市"——一句话就把排序、分组、过滤全考到了。

#### ▫️ ORDER BY 排序

```sql
-- 💼 单字段排序：查订单金额从高到低排，找大额订单（运营排查刷单）
SELECT * FROM orders ORDER BY total_amount DESC;

-- 💼 多字段排序：先按客户升序，同一客户再按金额降序
SELECT * FROM orders ORDER BY customer_id ASC, total_amount DESC;
```

> 📌   必记  ：
>
> * ORDER BY 默认是   ASC  （升序，从小到大），可以省略不写
> * DESC 是降序（从大到小），必须写
> * 多字段排序：先按第一个字段排，相同的再按第二个字段排

##### ORDER BY 的三种排序依据

新手常以为 ORDER BY 后面只能写字段名，其实有三种写法——

| 排序依据 | 写法示例                         | 什么时候用              | 推荐度    |
| :--- | :--------------------------- | :----------------- | :----- |
| 字段名  | `ORDER BY total_amount DESC` | 最常用，直观清晰           | ⭐⭐⭐ 推荐 |
| 列别名  | `ORDER BY total DESC`        | SELECT里定义了别名，可以直接用 | ⭐⭐ 常用  |
| 列序号  | `ORDER BY 3 DESC`            | 按第3列排（从1开始数）       | ⚠️ 不推荐 |

```sql
-- 💼 用别名排序：SELECT里起了别名total，ORDER BY可以直接用
SELECT customer_id, SUM(total_amount) AS total
  FROM orders
 GROUP BY customer_id
 ORDER BY total DESC;    -- ✅ 可以用别名，因为 ORDER BY 在 SELECT 之后执行（见1.6执行顺序）

-- ⚠️ 用列序号排序：按第2列排，虽然能跑但非常不推荐
SELECT customer_id, SUM(total_amount)
  FROM orders
 GROUP BY customer_id
 ORDER BY 2 DESC;        -- ❌ 不推荐。加一个字段序号就变了，维护噩梦
```

> 🤔   思考题  ：为什么 ORDER BY 能用 SELECT 里的别名，WHERE 却不能？
>
> 答案在   1.6节 SQL执行顺序  ——执行顺序是 FROM → WHERE → GROUP BY → SELECT → ORDER BY。
> WHERE 执行的时候 SELECT 还没执行，别名还不存在；ORDER BY 执行的时候 SELECT 已经执行完了，别名已经有了。
> 这是新手第一天就会踩的坑，一定要记住。

##### NULL 的排序问题

Oracle 里 NULL 排序的默认行为和你想的可能不一样——

```sql
-- 💼 控制NULL排在哪里：折扣为空的放最后（运营说空值不算折扣，放最后）
SELECT * FROM orders ORDER BY discount_amount DESC NULLS LAST;

-- 💼 折扣为空的放最前
SELECT * FROM orders ORDER BY discount_amount ASC NULLS FIRST;
```

> 📌   Oracle vs MySQL  ：Oracle 中 ASC 排序时 NULL 默认排排排最后排排，MySQL 中 NULL 默认排排排最前排排。
>
> 为什么不一样？   Oracle 认为 NULL 是"无穷大"，所以升序时放最后、降序时放最前；MySQL 认为 NULL 是"无穷小"，刚好相反。
>
> 面试时如果面试官问"NULL 排序在前还是在后"，记得反问一句"是 Oracle 还是 MySQL？" 😎

#### ▫️ GROUP BY 分组聚合

> 💡   一句话理解  ：分组就是"分门别类算总数"——按客户分组，算每个客户花了多少钱；按地区分组，算每个地区卖了多少货。

五大聚合函数（用得最多的）：

| 函数            | 作用        | 特点        |
| :------------ | :-------- | :-------- |
| `COUNT(*)`    | 统计行数      | 包含 NULL 行 |
| `COUNT(列名)`   | 统计该列非空值数量 | 忽略 NULL   |
| `SUM(列名)`     | 求和        | 忽略 NULL   |
| `AVG(列名)`     | 平均值       | 忽略 NULL   |
| `MAX/MIN(列名)` | 最大/最小值    | 忽略 NULL   |

```sql
-- 💼 按客户统计订单数和总金额——算每个客户的贡献度（RFM模型的M值）
SELECT customer_id,
       COUNT(*)            AS order_count,   -- 订单数
       SUM(total_amount)   AS total_amount,  -- 总金额
       AVG(total_amount)   AS avg_amount,    -- 客单价
       MAX(total_amount)   AS max_amount     -- 单笔最高
FROM orders
GROUP BY customer_id;
```

##### ⚠️ GROUP BY 的铁律（新手必错）

> 正确说法  ：：：SELECT 中的非聚合列，必须全部出现在 GROUP BY 中。：：
>
> ❌ 不是"GROUP BY 的列必须出现在 SELECT 中"——这句话说反了，GROUP BY 的列完全可以不在 SELECT 里。

```sql
-- ❌ 报错：ORA-00979: not a GROUP BY expression
-- 原因：total_amount 既不在 GROUP BY 里，也没被聚合函数包裹
SELECT customer_id, total_amount FROM orders GROUP BY customer_id;

-- ✅ 正确：total_amount 被 SUM 聚合了
SELECT customer_id, SUM(total_amount) FROM orders GROUP BY customer_id;

-- ✅ 也正确：GROUP BY 了 city，但 SELECT 里可以不显示 city（只是这样写意义不大）
SELECT customer_id, SUM(total_amount)
  FROM orders
 GROUP BY customer_id, city;   -- GROUP BY 的列可以比 SELECT 多
```

> 🤔   为什么要有这条规则？   你按 customer\_id 分组后，同一个 customer\_id 对应多行订单，total\_amount 有好几个值——Oracle 不知道你要哪一个，所以必须用 SUM/MAX/MIN 等聚合函数告诉它。

#### ▫️ HAVING 分组后过滤

WHERE 是分组组组前组组过滤行，HAVING 是分组组组后组组过滤组。

```sql
-- 💼 只看总消费超过1万的客户——重点客户筛选
SELECT customer_id, SUM(total_amount) AS total
FROM orders
WHERE status = 'PAID'          -- 先过滤：只统计已支付的订单（分组前）
GROUP BY customer_id
HAVING SUM(total_amount) > 10000;  -- 再过滤：只留总额超1万的组（分组后）
```

> 🤔   经典面试题  ：WHERE 和 HAVING 有什么区别？
>
> | 维度          | WHERE         | HAVING        |
> | :---------- | :------------ | :------------ |
> | 作用时机        | 分组前过滤滤滤行滤滤    | 分组后过滤滤滤组滤滤    |
> | 能用聚合函数吗     | ❌ 不能          | ✅ 能           |
> | 能用SELECT别名吗 | ❌ 不能          | ✅ Oracle中可以   |
> | 性能          | 先过滤，分组数据量小，更快 | 先分组再过滤，数据量大时慢 |
>
> 📌   原则  ：能在 WHERE 里过滤的，绝不放到 HAVING 里——早过滤早轻松。

#### ▫️ DISTINCT 去重 vs GROUP BY 去重

> 💡   一句话理解  ：DISTINCT 就是"去掉重复的"——一个客户下了10单，你只想知道"有哪些客户"，就用 DISTINCT。

```sql
-- 💼 单列去重：有哪些客户下过单（一个客户可能出现多次，去重后只剩一个）
SELECT DISTINCT customer_id FROM orders;

-- 💼 多列去重：有哪些(客户,状态)的组合——是对组合去重，不是只对第一列！
SELECT DISTINCT customer_id, status FROM orders;
```

> ⚠️   巨坑预警  ：DISTINCT 作用于它它它后面所有列它它的组合，不是只作用于第一列！
>
> ```sql
> -- ❌ 新手以为：按customer_id去重，顺便带上status
> -- ✅ 实际是：按(customer_id, status)组合去重
> SELECT DISTINCT customer_id, status FROM orders;
> ```
>
> 同一个客户如果有 PAID 和 CANCELLED 两种状态，会出现两行——这不是 bug，是你理解错了 DISTINCT 的作用范围。

##### DISTINCT 和 GROUP BY 怎么选？

两者都能去重，但适用场景不一样：

| 对比项  | DISTINCT                     | GROUP BY                         |
| :--- | :--------------------------- | :------------------------------- |
| 用途   | 单纯去重                         | 去重 + 聚合                          |
| 写法   | `SELECT DISTINCT col FROM t` | `SELECT col FROM t GROUP BY col` |
| 性能   | 简单去重时差不多                     | 需要聚合时用它                          |
| 推荐场景 | 只需要去重，不需要计算                  | 需要 COUNT/SUM/AVG 等聚合             |

> 📌   一句话  ：：：只去重用 DISTINCT，要聚合用 GROUP BY：：。不要用 GROUP BY 做纯去重的事，语义不清。

#### 🎯 综合练习（把本节串起来）

> 💼   场景  ：运营要一份报表——"统计2026年5月每个城市的已支付订单数和总金额，只显示总金额超过5万的城市，按总金额从高到低排。"
>
> 自己先写，再看答案——

```sql
-- ✅ 参考答案：WHERE + GROUP BY + HAVING + ORDER BY 一条龙
SELECT city,
       COUNT(*)        AS order_count,   -- 订单数
       SUM(total_amount) AS total_amount -- 总金额
  FROM orders
 WHERE order_date >= DATE '2026-05-01'   -- WHERE：先过滤时间和状态（分组前）
   AND order_date <  DATE '2026-06-01'
   AND status = 'PAID'
 GROUP BY city                            -- GROUP BY：按城市分组
HAVING SUM(total_amount) > 50000          -- HAVING：只留总金额超5万的城市
 ORDER BY total_amount DESC;              -- ORDER BY：按金额从高到低排
```

> 🧠   记住这个结构  ：SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY
> 这是报表 SQL 的标准骨架，80% 的统计查询都长这个样子。

***

### 🗄️ 1.4 DUAL表

💼   工作场景：   跑批脚本里经常要取当前时间、算日期、随手测个函数有没有写对——不用建表，DUAL 直接上。

#### ▫️ DUAL 表到底是什么？

学 SELECT 时，有时候就想"试试这个函数返回什么"——但 Oracle 有个铁规矩：：：SELECT 语句必须有 FROM 子句：：。你想写 `SELECT 1+1` 直接算结果？Oracle 不允许，必须写成 `SELECT 1+1 FROM 某张表`。

那没有真实的表怎么办？Oracle 就造了一张专门用来干这种事的"假表"————DUAL 表——。

| 属性 | 值                                   |
| :- | :---------------------------------- |
| 表名 | DUAL                                |
| 列数 | 1 列（列名叫 DUMMY）                      |
| 行数 | 1 行（值是 'X'）                         |
| 用途 | 满足 SELECT ... FROM 的语法要求，用来算表达式、测函数 |

> 🤔   为什么叫 DUAL ？   这个名字听起来怪怪的。最早 Oracle 设计它的时候，本来想放两行数据（dual = 双重、二元），后来改成一行了，但名字就这么沿用下来了。不用纠结名字，记住它是"凑语法用的假表"就行。

#### ▫️ DUAL 表的常见用法

```sql
-- 💼 跑批时取当前时间做分区字段
SELECT SYSDATE FROM dual;

-- 💼 测试一个函数返回什么，比如刚学的 TO_CHAR
SELECT TO_CHAR(SYSDATE, 'yyyy-mm-dd') FROM dual;

-- 💼 取当前操作用户，日志里记录是谁跑的
SELECT USER FROM dual;

-- 💼 随手算个算术表达式
SELECT 100 * 0.85 AS discount_price FROM dual;

-- 💼 拼接字符串看效果
SELECT 'Hello' || ' ' || 'World' AS result FROM dual;
```

> 📌   重点掌握  ：DUAL 是 Oracle 独有的，MySQL / SQL Server 不需要（可以直接 `SELECT 1+1` 不用 FROM）。
> 面试时可能会问"Oracle 的 DUAL 表有什么用？"——答"一行一列的虚表，用来满足 SELECT 必须带 FROM 的语法，测函数、算表达式"就够了。

***

### ✍️ 1.5 SQL 书写规范与技巧

> 基础查询已经会了，但写出来的 SQL 好不好看、容不容易改、别人能不能看懂，差别就在这些细节里。。。好的 SQL 是写给人看的，顺便让机器执行一下。。。
>
> 面试官看你的 SQL 写得规不规范，基本就能判断你有没有在团队里写过生产代码——写得乱七八糟的，大概率是自学的野路子。

💼   工作场景：

* 别名  ：字段名是英文的，报表要显示中文标题，用别名
* 常量列  ：跑批时每行都要标记今天的业务日期，加一列常量
* 注释  ：复杂 SQL 不加注释，三天后你自己都看不懂
* 书写规范  ：大小写、缩进、换行——团队协作的基本素养

#### ▫️ 别名（AS）

```sql
-- 标准写法：带 AS，最清晰（推荐）
SELECT customer_id AS id, customer_name AS name FROM customers;

-- 省略 AS：也行，但可读性稍差
SELECT customer_id id, customer_name name FROM customers;

-- 别名含中文/空格/特殊字符，必须加双引号
SELECT total_amount AS "订单金额（元）" FROM orders;
```

> ⚠️   巨坑：不加双引号，Oracle 会把别名转成大写！
>
> ```sql
> -- 你以为列名叫 TotalAmount，实际是 TOTALAMOUNT（全大写）
> SELECT total_amount AS TotalAmount FROM orders;
>
> -- 加了双引号才严格保留大小写
> SELECT total_amount AS "TotalAmount" FROM orders;
> ```
>
> 中文别名不受影响（中文没有大小写），但英文别名要注意——
> 你用 JDBC 取 `rs.getString("TotalAmount")` 会报错，因为实际列名是 `"TOTALAMOUNT"`。
> 保险做法：英文别名一律小写，中文别名一律加双引号。

#### ▫️ 常量列

查询结果里加一列固定值——跑批、数据打标常用。

```sql
-- 💼 跑批标记：每行都带上业务日期，下游知道这批数据是哪天的
SELECT '2026-05-22' AS biz_date, customer_name, total_amount
FROM orders;

-- 💼 数据来源标记：多张表UNION ALL时，标记每行来自哪张表
SELECT 'orders' AS source, order_id, total_amount FROM orders
UNION ALL
SELECT 'refunds' AS source, refund_id, refund_amount FROM refunds;
```

#### ▫️ 注释

```sql
-- 双减号是单行注释（推荐，简洁）
SELECT * FROM orders;   -- 查询订单表

/* 斜星号是多行注释
   可以写很多行
   适合复杂SQL开头写整体说明 */
SELECT order_id, customer_id
  FROM orders;
```

> 📌   建议  ：
>
> * 单行注释用 `--`，写在语句后面或单独一行
> * 多行注释用 `/* */`，一般用于 SQL 开头写整体说明
> * 复杂 SQL 一定要加注释，不然三天后连你自己都看不懂写了什么
> * ⚠️ `/* */` 不能嵌套，里面再出现 `/*` 会报错

#### ▫️ 书写规范（团队协作必看）

> 💡   为什么要讲规范？   你写的 SQL 不是只给你自己看的。同事要接你的活、面试官要看你的代码、三个月后你自己要回头改——写得乱七八糟，谁都难受。

三条黄金法则：

1. 关键字大写  ：SELECT、FROM、WHERE、GROUP BY……一眼看出结构
2. 字段和表名小写  ：和关键字形成对比
3. 每个子句换行  ：SELECT 一行、FROM 一行、WHERE 一行……结构清晰

```sql
-- ❌ 反面教材：挤成一团，谁看得懂？
select customer_id,sum(total_amount) as total from orders where status='PAID' group by customer_id having sum(total_amount)>10000 order by total desc;

-- ✅ 正面教材：关键字大写 + 每个子句换行 + 缩进
SELECT customer_id,
       SUM(total_amount) AS total
  FROM orders
 WHERE status = 'PAID'
 GROUP BY customer_id
HAVING SUM(total_amount) > 10000
 ORDER BY total DESC;
```

##### 两种缩进风格

| 风格     | 特点                         | 适用场景             |
| :----- | :------------------------- | :--------------- |
| 关键字右对齐 | FROM/WHERE 右对齐，左边一条竖线全是关键字 | Oracle 传统风格，大厂常用 |
| 逗号前置   | 逗号写在字段前面，删字段时不用管最后一个逗号     | 现代风格，方便维护        |

关键字右对齐风格（上面的例子就是）：

```
SELECT ...
  FROM ...
 WHERE ...
 GROUP BY ...
HAVING ...
 ORDER BY ...
```

逗号前置风格：

```sql
SELECT  customer_id
     ,  SUM(total_amount) AS total
     ,  COUNT(*) AS order_count
  FROM orders
 WHERE status = 'PAID'
 GROUP BY customer_id
```

> 📌   两种风格都可以，关键是团队统一。   你进了公司，看老代码怎么写你就怎么写，别自己发明风格。

***

### 🔄 1.6 ⭐ SQL执行顺序（🔥面试必考）

> 💡   一句话理解  ：SQL不按你写的顺序执行！你写的是 SELECT → FROM → WHERE，实际上 Oracle 先读 FROM 再 WHERE 最后 SELECT。不理解执行顺序，写复杂 SQL 就会翻车。

💼   工作场景：   你是不是写过这种 SQL——`SELECT total_amount AS amt FROM orders WHERE amt > 1000` 然后报错？因为你不知道 SELECT 在 WHERE 之后才执行，别名还没定义。理解执行顺序，，，写复杂SQL不再靠蒙，，。

> 🐶   面试官说  ："WHERE 里能用聚合函数吗？为什么？"——答出 SQL执行顺序，面试官就觉得你基础扎实。

#### ▫️ 实际执行顺序

```sql
-- 你写的顺序              -- Oracle实际执行顺序
SELECT customer_id,        -- ⑤ SELECT（最后选列）
       SUM(total_amount)   --   聚合函数在这步计算
FROM orders                -- ① FROM（先确定从哪张表取）
WHERE status = 'PAID'      -- ② WHERE（过滤行，此时不能使用聚合函数）
GROUP BY customer_id       -- ③ GROUP BY（分组）
HAVING SUM(total_amount)   -- ④ HAVING（过滤组，此时可以使用聚合函数）
  > 10000
ORDER BY customer_id;      -- ⑥ ORDER BY（最后排序）
```

📌   必记5个关键规则  ：

1. FROM最先执行  ——先确定表，再操作数据
2. WHERE在GROUP BY之前  ——所以WHERE不能用聚合函数（还没分组呢）
3. HAVING在GROUP BY之后  ——所以HAVING能用聚合函数
4. SELECT在HAVING之后  ——所以SELECT里的别名不能在WHERE中用（如 `WHERE total > 100` 中的 `total` 还没定义）
5. ORDER BY最后  ——所以ORDER BY可以用别名

> 🧠   记忆口诀  ：：：F：：rom →   W  here →   G  roup by →   H  aving →   S  elect →   O  rder by
>
> 谐音记：：："房 屋 搁 画 书 哦"：：——想象你把画搁在书房里。每个字对应一个子句的首字母。
>
> 或者更简单：：："FWGHSO"：：，读几遍就记住了。

#### ▫️ 逐步拆解：一条 SQL 是怎么跑出来的？

光记顺序还是抽象，我们拿一条具体 SQL 一步步看，每一步中间结果是什么样的——

SQL 语句

：

```sql
SELECT city, SUM(total_amount) AS total
  FROM orders
 WHERE status = 'PAID'
 GROUP BY city
HAVING SUM(total_amount) > 5000
 ORDER BY total DESC;
```

逐步执行过程

：

|  步骤 | 操作       | 中间结果（行数变化）         | 这一步做了什么                            |
| :-: | :------- | :----------------- | :--------------------------------- |
|  ①  | FROM     | 1000 行（全表）         | 先把 orders 表全部读进来，确定数据来源            |
|  ②  | WHERE    | 700 行（过滤掉300行未支付的） | 逐行检查 status='PAID'，留下符合条件的行        |
|  ③  | GROUP BY | 20 组（20个城市）        | 按 city 分组，同一城市的行合为一组               |
|  ④  | HAVING   | 8 组（只剩总金额超5000的城市） | 对每组算 SUM(total\_amount)，留下大于5000的组 |
|  ⑤  | SELECT   | 8 行（确定最终显示哪些列）     | 选出 city 和 total 两列，聚合值在这步落定        |
|  ⑥  | ORDER BY | 8 行（顺序变了，行数不变）     | 按 total 降序排列，输出最终结果                |

> 📌   看出来了吗？   数据量是越来越小的——从 1000 行 → 700 行 → 20 组 → 8 组。
> 这就是为什么"能在 WHERE 过滤的绝不要放到 HAVING"——早过滤，后面每一步处理的数据都更少，更快。

> 🔥   面试高频  ：以下问题全部围绕SQL执行顺序出题——
>
> * ❓ "WHERE为什么不能使用聚合函数？" → 因为WHERE在GROUP BY之前执行，还没分组
> * ❓ "SELECT里的别名能在WHERE中用吗？" → 不能，SELECT在WHERE之后执行
> * ❓ "ORDER BY能用别名吗？" → 可以，ORDER BY在SELECT之后执行
>
> ⚠️   易错点  ：新手常写 `SELECT total_amount AS amt FROM orders WHERE amt > 1000` —— 报错！因为WHERE执行时别名`amt`还没定义。得写成 `WHERE total_amount > 1000`。

***

### 📊 1.7 高级分组（CUBE / ROLLUP / GROUPING SETS）

> 普通 `GROUP BY` 只按一个维度汇总。`ROLLUP` 按层级汇总（年→月→日），`CUBE` 按所有组合汇总（像魔方所有面），`GROUPING SETS` 只要指定的组合。

💼 工作场景：

* 电商经营日报  ：要同时输出「全公司总销售额 → 各大区小计 → 各门店明细」三个层级——一条 ROLLUP 搞定，不用分别跑三条 SQL 再 UNION ALL
* 品类分析  ：按「地区 × 品类」交叉汇总退货率——CUBE 一次算出所有组合的汇总，比手动排列组合省 10 倍时间
* ETL 跑批  ：用 GROUPING 函数标记汇总行，下游数仓知道哪些是原始数据、哪些是合计行，不会把汇总 NULL 当脏数据处理

```sql
-- ROLLUP：按层级汇总（电商月报：先按年，再按月，最后总计）
SELECT
    TO_CHAR(order_date, 'yyyy') AS year,
    TO_CHAR(order_date, 'mm') AS month,
    SUM(total_amount) AS total
FROM orders
GROUP BY ROLLUP(TO_CHAR(order_date, 'yyyy'), TO_CHAR(order_date, 'mm'));
-- 结果：逐年小计 → 逐月小计 → 总计，三种粒度

-- CUBE：所有维度组合（分析不同大区、不同品类的销量）
SELECT o.region_id, i.category_id, SUM(i.quantity) AS sales
FROM order_items i JOIN orders o ON i.order_id = o.order_id
GROUP BY CUBE(o.region_id, i.category_id);
-- 结果：总体合计、按大区合计、按品类合计、大区+品类明细，四种组合

-- GROUPING SETS：只取你想要的组合
SELECT o.region_id, i.category_id, SUM(i.quantity) AS sales
FROM order_items i JOIN orders o ON i.order_id = o.order_id
GROUP BY GROUPING SETS (
    (o.region_id),         -- 按大区汇总
    (i.category_id),       -- 按品类汇总
    ()                     -- 总合计
);

-- GROUPING 函数：判断当前行是原始值还是汇总NULL
-- CUBE/ROLLUP 产生的 NULL 不是数据里的 NULL，用 GROUPING 来区分
SELECT
    o.region_id,
    i.category_id,
    SUM(i.quantity) AS sales,
    GROUPING(o.region_id) AS is_region_total,     -- 1=大区合计行
    GROUPING(i.category_id) AS is_category_total  -- 1=品类合计行
FROM order_items i JOIN orders o ON i.order_id = o.order_id
GROUP BY CUBE(o.region_id, i.category_id);
```

> 🔥   面试高频  ：`ROLLUP` 和 `CUBE` 的区别——ROLLUP 是层级汇总（A→B→总计），CUBE 是全部组合（A+B+AB+总计）。面试会问「要同时查年总计、月小计、日明细，怎么写？」
>
> ⚠️   易错点  ：CUBE/ROLLUP 输出的 NULL 不是数据缺失，是"汇总行"。用 `GROUPING` 函数区分，别用 `NVL` 把汇总 NULL 当脏数据处理了。
>
> 📌   必记  ：`GROUP BY ROLLUP(A, B)` = GROUP BY A,B + GROUP BY A + 总计，三条 SQL 的 UNION ALL。`GROUP BY CUBE(A, B)` = A+B+AB+总计，四条。

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第一章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 基础查询  → SELECT / FROM / WHERE          │
│ 📌 条件过滤  → =/>/BETWEEN/IN/LIKE/AND/OR    │
│ 📌 排序分组  → ORDER BY / GROUP BY / HAVING   │
│ 📌 去重      → DISTINCT（作用于所有列组合）    │
│ 📌 执行顺序  → FROM→WHERE→GROUP→HAVING→SELECT │
│ 📌 高级分组  → ROLLUP(层级) / CUBE(组合)      │
│ 📌 书写规范  → 关键字大写 + 换行缩进          │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：NULL必须用IS NULL判断                │
│ ⚠️ 易错：AND优先级比OR高，混用必加括号        │
│ ⚠️ 易错：WHERE不能用聚合函数                   │
│ ⚠️ 易错：DISTINCT作用于所有列，不是第一列      │
│ ⚠️ 易错：SELECT非聚合列必须在GROUP BY中（反过来不要求）│
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. SQL执行顺序  ：FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
2. NULL处理  ：`IS NULL`/`IS NOT NULL`，`NULL + 数字 = NULL`
3. WHERE vs HAVING  ：WHERE分组前过滤，HAVING分组后过滤
4. ROLLUP vs CUBE  ：ROLLUP层级汇总，CUBE所有组合

#### 🎯 动手练习

> 练习1  ：创建一个订单表（orders），包含字段：order\_id、customer\_id、total\_amount、order\_date、status
> （建表语法第六章才学，本章直接执行   附录A   里的建表脚本即可，重点做练习2）

> 练习2  ：写出SQL完成以下需求：
>
> 1. 查询金额大于1000的已支付订单
> 2. 统计每个客户的订单数和总金额
> 3. 找出总金额超过5000的客户
> 4. 按月份统计销售额，同时显示年总计和月小计

#### 🤖 AI 加餐：让 DeepSeek 当你的 SQL 陪练

场景1：让 AI 出题

（提示词直接复制）：

```text
我是零基础学 Oracle SQL 的新手，刚学完 SELECT/WHERE/ORDER BY/GROUP BY/HAVING/DISTINCT。
请出 5 道基于电商订单表 orders(order_id, customer_id, total_amount, order_date, status) 的练习题，
从易到难，只出题不给答案。我写完后会发给你批改。
```

场景2：让 AI 只给提示不给答案

（铁律1）：

```text
这道题我卡住了：<粘贴题目>
我的思路/我写的SQL：<粘贴你的SQL，哪怕错的>
请不要直接给完整答案，用提示的方式引导我自己改出来。
```

⚠️ 验证要点

：AI 批改说"正确"不算数，必须贴进 Oracle 里跑一遍，亲眼看到结果对才算对。

#### 🔗 下一章预告

第二章：集合运算与子查询

* 学完集合运算（UNION/INTERSECT/MINUS），你会合并多个查询结果
* 学完子查询，你会嵌套查询解决复杂问题
* 学完CASE WHEN，你会像编程一样做条件判断
* 面试高频  ：IN vs EXISTS性能对比、子查询优化

***

> 📖   上一章回顾  ：第一章我们学习了SQL基础查询，掌握了SELECT、WHERE、GROUP BY等核心语法，理解了SQL执行顺序。这些是写SQL的基础。

上一章我们学会了"查数据"，这一章我们学习"组合数据"——把多个查询结果合并、嵌套查询解决复杂问题。

***

## 🔀 二、集合运算与子查询

> 💡   一句话理解  ：UNION是纵向拼接（行变多），JOIN是横向拼接（列变多）。合并名单 vs 合并成绩表，是两回事。
>
> 🚀   本章要解决的问题  ：从单表查询进阶到多表/多查询的结果组合。集合运算合并行，子查询嵌套查，CASE WHEN做分类统计。面试中90%的SQL题靠本章知识就能解决。
>
> 📚   前置知识回顾  ：
>
> * 第一章：SQL基础查询（SELECT、WHERE、GROUP BY、HAVING）
> * SQL执行顺序：FROM→WHERE→GROUP BY→HAVING→SELECT→ORDER BY
>
> 🎯   本章学习目标  ：
>
> * 掌握集合运算（UNION、INTERSECT、MINUS）合并多个查询结果
> * 理解子查询的分类和应用场景（标量、IN、EXISTS）
> * 掌握CASE WHEN条件表达式进行数据分类
> * 理解ROWNUM和ROWID的区别及应用

### 📦 2.1 集合运算

> 💡   一句话理解  ：集合运算是是是纵向拼接是是——把多个查询的结果按行叠在一起。UNION 是合并两份名单，JOIN 是合并两张成绩表，一纵一横，别搞混。

💼   工作场景：

* UNION ALL  ：分区表合并查询——把1月到12月的订单分区表 UNION ALL 成一张大表做年报表
* INTERSECT  ：找交集——今天下单的客户和昨天下单的客户，哪些是回头客
* MINUS  ：找差集——营销活动名单里，哪些人还没下单（需要发短信催单）

#### ▫️ 四种集合操作符

| 操作符       | 含义 | 特点       | 类比               |
| :-------- | :- | :------- | :--------------- |
| UNION     | 并集 | 去重 + 排序  | 两份名单合并，重复的人只留一个  |
| UNION ALL | 并集 | 不去重，性能最好 | 两份名单直接拼一起，有重复也不管 |
| INTERSECT | 交集 | 去重       | 两份名单里都有的人        |
| MINUS     | 差集 | A有B没有    | A名单里有、B名单里没有的人   |

```sql
-- 💼 UNION ALL：合并2025和2026两年的订单（分区表合并，最常用）
SELECT order_id, customer_id, total_amount, order_date FROM orders_2025
UNION ALL
SELECT order_id, customer_id, total_amount, order_date FROM orders_2026;

-- 💼 UNION：合并两个渠道的客户名单（去重）
SELECT customer_id FROM orders WHERE channel = 'APP'
UNION
SELECT customer_id FROM orders WHERE channel = 'WEB';

-- 💼 INTERSECT：找连续两天下单的回头客
SELECT customer_id FROM orders WHERE order_date = '2026-05-20'
INTERSECT
SELECT customer_id FROM orders WHERE order_date = '2026-05-21';

-- 💼 MINUS：营销活动名单里，哪些人还没下单（需要催单）
SELECT customer_id FROM marketing_campaign  -- 活动名单
MINUS
SELECT customer_id FROM orders WHERE order_date >= '2026-05-01';  -- 已下单的
```

> 🔥   面试高频：UNION vs UNION ALL
>
> | 维度   | UNION        | UNION ALL      |
> | :--- | :----------- | :------------- |
> | 去重   | ✅ 去重         | ❌ 不去重          |
> | 排序   | ✅ 会排序（去重要排序） | ❌ 不排序          |
> | 性能   | 慢（排序开销大）     | 快（直接拼接）        |
> | 使用场景 | 需要去重的结果      | 确认不会重复 / 重复不影响 |
>
> 📌   原则  ：能不用 UNION 就不用 UNION——数据量大的时候，UNION 的排序开销会非常恐怖。

> ⚠️   易错点1  ：集合运算要求各查询的的的列数相同、列类型兼容的的。
>
> ```sql
> -- ❌ 报错：列数不同
> SELECT id, name FROM a UNION SELECT id FROM b;
>
> -- ❌ 报错：类型不匹配（数字 vs 字符串）
> SELECT id FROM a UNION SELECT name FROM b;
> ```

> ⚠️   易错点2  ：ORDER BY 只能写在在在最后一个查询在在后面，对最终结果排序。
>
> ```sql
> -- ✅ 正确：ORDER BY 在最后
> SELECT customer_id FROM orders WHERE region_id = 10
> UNION ALL
> SELECT customer_id FROM orders WHERE region_id = 20
> ORDER BY customer_id;
> ```

> 💻   动手练  ：
>
> 1. 查"在APP下单但没在WEB下单"的客户，用哪个集合操作符？（答案：MINUS）
> 2. 查"APP和WEB都下过单"的客户，用哪个？（答案：INTERSECT）
> 3. 查"APP或WEB下过单"的客户，去重用哪个？不去重用哪个？（答案：UNION / UNION ALL）

***

### 🔍 2.2 子查询

> 💡   一句话理解  ：子查询就是"套娃"——一个查询里面再嵌一个查询。里面的查完给外面用。子查询本身不难，难的是是是知道什么时候用哪种、怎么写不踩性能坑是是。

#### ▫️ 子查询的分类

按子查询询询返回的结果询询来分，有三种：

| 类型    | 返回什么      | 放在哪                | 例子               |
| :---- | :-------- | :----------------- | :--------------- |
| 标量子查询 | 1行1列（一个值） | SELECT 后 / WHERE 后 | 每行带一个"全店平均金额"做对比 |
| 列子查询  | N行1列（一列值） | WHERE 的 IN 后面      | 查询"某些客户"的所有订单    |
| 表子查询  | N行N列（一张表） | FROM 后面（当临时表用）     | 分页查询、TOP-N 问题    |

***

#### ▫️ 列子查询（IN 子查询）——最常用

> 💡   一句话理解  ：子查询返回一列值，外层用 IN 来匹配——"查这些客户的所有订单"。

💼   工作场景  ：运营给了你一份"高价值客户名单"，让你拉这些客户的所有订单明细。

```sql
-- 💼 IN子查询：查高价值客户的所有订单
SELECT * FROM orders
WHERE customer_id IN (
    -- 子查询：找出消费TOP 10%的高价值客户
    SELECT customer_id
    FROM orders
    GROUP BY customer_id
    HAVING SUM(total_amount) > 10000
);
```

> 📌   理解方式  ：先执行子查询得到一个客户ID列表，然后外层查询从 orders 表里找 customer\_id 在这个列表里的行。

> ⚠️   易错点  ：IN 子查询的子查询询询只能返回一列询询！返回两列会报错。
>
> ```sql
> -- ❌ 报错：IN 后面只能有一列
> SELECT * FROM orders WHERE (customer_id, status) IN (
>     SELECT customer_id, status FROM ...
> );
> ```

***

#### ▫️ EXISTS 子查询——面试必问

> 💡   一句话理解  ：EXISTS 不关心子查询返回什么数据，只关心"有没有"——找到就返回 TRUE，找不到返回 FALSE。

💼   工作场景  ：查"下过单的区域"——只要这个区域至少有一笔订单，就把它列出来。

```sql
-- 💼 EXISTS：查出有订单的区域
SELECT d.region_id, d.region_name
FROM departments d
WHERE EXISTS (
    SELECT 1 FROM orders o   -- SELECT 1 是惯例，写什么都行，EXISTS不看数据
    WHERE o.region_id = d.region_id
);
```

> 🔥   面试高频：IN vs EXISTS 怎么选？
>
> | 维度      | IN                   | EXISTS                |
> | :------ | :------------------- | :-------------------- |
> | 执行逻辑    | 先把子查询结果全部查出来，再匹配外层   | 外层每一行去子查询里"找有没有"，找到就停 |
> | 适合场景    | 子查询结果集集集小集集          | 子查询结果集集集大集集（有索引时更快）   |
> | NULL 处理 | 子查询有 NULL 时，IN 可能返回空 | 不受 NULL 影响            |
>
> 📌   记忆口诀  ：：：小表用 IN，大表用 EXISTS：：。但实际工作中，大数据量下推荐直接用 JOIN——优化器会帮你选最好的执行计划。

> 💡   为什么 SELECT 1？   EXISTS 只判断"存在与否"，不关心 SELECT 后面写什么。`SELECT 1`、`SELECT *`、`SELECT 'a'` 效果都一样。写 `SELECT 1` 是行业惯例，显得你专业。

***

#### ▫️ 关联子查询——难点

> 💡   一句话理解  ：子查询里用到了外层查询的字段——外层每一行，子查询都要重新算一次。像"每行带一个自己区域的平均值"。

💼   工作场景  ：找出"高于自己所在区域平均订单金额"的订单——运营要找每个区域里的大额订单。

```sql
-- 💼 关联子查询：高于所在区域平均金额的订单
SELECT e.*
FROM orders e
WHERE e.total_amount > (
    -- 子查询里用到了外层的 e.region_id
    -- 外层每换一行，region_id 就变，子查询就要重新算
    SELECT AVG(total_amount)
    FROM orders
    WHERE region_id = e.region_id
);
```

> ⚠️   性能杀手预警  ：关联子查询是是是逐行执行是是的！外层有 10 万行，子查询就跑 10 万次。数据量大的时候非常慢。
>
> ✅   优化写法  ：用 JOIN + GROUP BY 替代，只算一次：
>
> ```sql
> SELECT e.*
> FROM orders e
> JOIN (
>     SELECT region_id, AVG(total_amount) AS avg_amt
>     FROM orders
>     GROUP BY region_id
> ) r ON e.region_id = r.region_id
> WHERE e.total_amount > r.avg_amt;
> ```

***

#### ▫️ 表子查询（FROM 子句中的子查询）

> 💡   一句话理解  ：子查询的结果当一张临时表用——外层查询 FROM 的不是真实的表，是子查询查出来的结果。

💼   工作场景  ：分页查询就是最典型的例子——先给结果加行号，再按行号筛选。

```sql
-- 💼 分页查询：第 11-20 条
SELECT *
FROM (
    -- 内层：给每行加行号
    SELECT ROWNUM AS rn, o.*
    FROM orders o
    ORDER BY total_amount DESC
)
WHERE rn BETWEEN 11 AND 20;
```

> 📌   注意  ：FROM 后面的子查询必须加加加别名加加，不然外层不知道怎么引用它。

***

#### ▫️ 标量子查询

> 💡   一句话理解  ：子查询只返回一个值（1行1列），像一个常量一样用——每行都带这个值。

💼   工作场景  ：查每笔订单的金额，同时带一列"全店平均订单金额"做对比。

```sql
-- 💼 标量子查询：每行带一个全店平均值
SELECT order_id,
       customer_id,
       total_amount,
       (SELECT AVG(total_amount) FROM orders) AS shop_avg  -- 只返回一个值
FROM orders;
```

> ⚠️   性能问题  ：标量子查询也是逐行执行的——外层 10 万行，它就执行 10 万次。虽然每次只返回一个值，但次数多了也慢。数据量大时同样建议用 JOIN 替代。

***

#### 📌 子查询性能总结

1. 能用 JOIN 就不用子查询  ——优化器对 JOIN 的优化更成熟
2. IN vs EXISTS  ：小结果集用 IN，大结果集用 EXISTS
3. 关联子查询和标量子查询  ：都是逐行执行，大数据量慎用，优先用 JOIN + GROUP BY 改写
4. FROM 子查询  （内联视图）：相对安全，只会执行一次，可以放心用

> 💬   课堂讨论  ：有人说"子查询能不用就不用，性能太差"，也有人说"子查询思路清晰，嵌套几层无所谓"。你们怎么看？在什么场景下必须用子查询？

***

### ⚖️ 2.3 CASE WHEN 条件表达式

> 💡   一句话理解  ：CASE WHEN = SQL 里的 IF-ELSE，根据条件返回不同值。DECODE 是 Oracle 专属简化版，只能做等值判断。

💼   工作场景：

* CASE WHEN  ：数据分箱——把订单金额分成高/中/低三档，做客户分层
* 行转列  ：统计每个区域各状态的订单数——一行展示所有维度
* DECODE  ：字典翻译——数据库存 1/2/3，报表要显示"东区/南区/北区"

#### ▫️ CASE WHEN 基本用法

```sql
-- 💼 订单金额分档：高/中/低三档（客户分层用）
SELECT order_id,
       customer_id,
       total_amount,
       CASE
           WHEN total_amount >= 3000 THEN 'HIGH'      -- 高价值
           WHEN total_amount >= 2000 THEN 'MEDIUM'    -- 中价值
           WHEN total_amount >= 1000 THEN 'LOW'       -- 低价值
           ELSE 'OTHER'                                -- 其他
       END AS amount_level
FROM orders;
```

> ⚠️   巨坑预警  ：CASE WHEN   按顺序匹配，命中第一个就返回  ，后面的不执行！和 Java 里的 switch case 一样，没有 break 但有"命中即停"。
>
> ```sql
> -- ❌ 错误写法：条件顺序反了，3000以上的也会命中 >=1000，全变成 LOW
> CASE
>     WHEN total_amount >= 1000 THEN 'LOW'
>     WHEN total_amount >= 3000 THEN 'HIGH'  -- 永远走不到这里
> END
> ```
>
> 📌   原则  ：条件从大到小写，或者确保条件之间互斥。

#### ▫️ CASE WHEN + 聚合函数 = 行转列（🔥面试高频）

> 💡   经典场景  ：想做一张报表，每行是一个区域，每列是一个订单状态的数量——这就是"行转列"，用 CASE WHEN + 聚合函数实现。

💼   工作场景  ：运营想看各区域的订单状态分布——每个区域一行，PAID/SHIPPED/CANCELLED 各一列。

```sql
-- 💼 行转列：按区域统计各状态订单数
SELECT region_id,
       SUM(CASE WHEN status = 'PAID'      THEN 1 ELSE 0 END) AS paid_cnt,
       SUM(CASE WHEN status = 'SHIPPED'   THEN 1 ELSE 0 END) AS shipped_cnt,
       SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_cnt,
       SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) AS paid_amount
FROM orders
GROUP BY region_id;
```

> 📌   理解方式  ：CASE WHEN 每行生成一个 0 或 1（或金额），然后用 SUM 加起来——等于 1 的行就是满足条件的行，加起来就是满足条件的行数。这是 SQL 里最经典的技巧，，，面试手写 SQL 大概率会考，，。

#### ▫️ DECODE 函数（Oracle 特有）

DECODE 是 CASE WHEN 的简化版，只能做做做等值判断做做——相当于只有 `=` 的 CASE WHEN。

```sql
-- 💼 区域编号转中文：报表展示用
SELECT customer_name,
       region_id,
       DECODE(region_id,
           1, '华东区',
           2, '华南区',
           3, '华北区',
           '其他区'           -- 默认值（可选）
       ) AS region_name
FROM customers;
```

> 💡   记忆口诀  ：CASE WHEN 是"万金油"（什么条件都能写），DECODE 是"专线车"（只能等值判断）。CASE WHEN 是 SQL 标准，所有数据库都支持；DECODE 只有 Oracle 有。

> 🔥   面试高频  ：CASE WHEN 是做数据清洗和分类统计的必备技能。记住：CASE WHEN 是是是表达式是是（返回一个值），不是语句；匹配到第一个满足条件就返回，后面的不执行。

### 🔢 2.4 进阶：ROWNUM 与 ROWID

> ⚠️   学习提示  ：这两个都是 Oracle 的的的伪列的的（不是真实存在的列，但查询时可以用）。ROWNUM 工作中经常用（分页），ROWID 知道概念就行。

> 💡   什么是伪列？   就像快递单上的"第X件/共Y件"——不是你寄的东西，但贴在包裹上能帮你数数。ROWNUM 和 ROWID 也是这样，不是表里的字段，但 Oracle 能给你显示出来。

#### ▫️ ROWNUM 行号

ROWNUM

&#x20;是 Oracle 给查询结果自动编的「行号」，从 1 开始。注意：是是是查询结果是是的行号，不是表的行号。

💼   工作场景：

* 快速看数据  ：先看前 5 条，摸清表结构再写复杂 SQL
* TOP-N  ：取订单金额最高的前 10 笔
* 分页查询  ：从 Oracle 拉数据到 Hive，分批拉（每次 10000 条）

```sql
-- 💼 取前5条：快速看一眼数据长什么样
SELECT * FROM orders WHERE ROWNUM <= 5;

-- 💼 TOP-N：订单金额最高的前10笔（大额订单排查）
SELECT *
FROM (
    SELECT * FROM orders ORDER BY total_amount DESC
)
WHERE ROWNUM <= 10;
```

> ⚠️   为什么 TOP-N 要套子查询？   因为 ORDER BY 在 ROWNUM 之后执行！直接写 `WHERE ROWNUM <= 10 ORDER BY total_amount DESC` 是先随便取 10 行再排序，不是你要的"前 10 名"。
>
> 正确姿势：：：先排序，再编号，最后筛选：：——所以要套两层。

##### 分页查询：ROWNUM 不能用 `>` 的坑

```sql
-- 💼 分页：第 11-20 条（分批拉取数据的标准写法）
SELECT *
FROM (
    SELECT ROWNUM AS rn, o.*
    FROM (
        SELECT * FROM orders ORDER BY order_date DESC  -- 最内层：先排序
    ) o
    WHERE ROWNUM <= 20   -- 中层：取前20条
)
WHERE rn >= 11;          -- 最外层：从第11条开始
```

> ⚠️   巨坑预警  ：ROWNUM 不能直接用 `>` 判断！`WHERE ROWNUM > 5` 永远查不到数据。
>
> 🤔   为什么？   因为 ROWNUM 是"边查边编号"——
>
> 1. 第一行进来，ROWNUM=1，判断 `1 > 5`？不满足，丢掉
> 2. 第二行进来，ROWNUM=1（因为上一行被丢了，它又变成第一行了），判断 `1 > 5`？不满足，丢掉
> 3. 第三行进来，ROWNUM 还是 1…… 永远循环
>
> 所以 ROWNUM 只能用 `<=`，要用 `>` 必须先把 ROWNUM 变成真实的列（套一层子查询）。

#### ▫️ ROWID 物理地址

ROWID

&#x20;是每行数据在磁盘上的的的物理地址的的，全局唯一。它不是行号，是"住址"——Oracle 通过 ROWID 直接定位到磁盘上的具体位置，速度极快。

```sql
-- 查看ROWID长什么样
SELECT order_id, customer_id, ROWID FROM orders WHERE ROWNUM <= 3;

-- 💼 删除重复数据：保留ROWID最小的那条（去重的经典写法）
DELETE FROM orders
WHERE ROWID NOT IN (
    SELECT MIN(ROWID) FROM orders GROUP BY order_id
);
```

> 📌   理解  ：同一张表中，order\_id 重复的行，ROWID 一定不同（因为存在不同的磁盘位置）。所以用 `MIN(ROWID)` 保留最早插入的那条，其他删掉。

#### ▫️ ROWNUM vs ROWID 对比

| 维度       | ROWNUM      | ROWID         |
| :------- | :---------- | :------------ |
| 是什么      | 查询结果的行号     | 数据的物理地址       |
| 是否固定     | ❌ 每次查询可能不一样 | ✅ 固定不变（除非行迁移） |
| 从几开始     | 从 1 开始      | 无编号概念，是一串字符   |
| 能否用 >    | ❌ 不能直接用     | ✅ 可以比较大小      |
| 主要用途     | 分页、TOP-N    | 去重、快速定位       |
| 所有数据库都有吗 | ❌ Oracle 特有 | ❌ Oracle 特有   |

> 📌   重点掌握  ：ROWNUM 做分页是工作中最常用的，必须会写。ROWID 理解概念即可，面试可能会问两者区别。

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第二章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 集合运算  → UNION ALL/UNION/INTERSECT/MINUS│
│ 📌 子查询    → 标量/列/表 子查询              │
│ 📌 IN/EXISTS → 小表用IN，大表用EXISTS         │
│ 📌 行转列    → CASE WHEN + 聚合函数           │
│ 📌 伪列      → ROWNUM(行号) / ROWID(物理地址) │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：UNION去重排序慢，UNION ALL快          │
│ ⚠️ 易错：ROWNUM不能直接用>，分页要套子查询    │
│ ⚠️ 易错：CASE WHEN按顺序匹配，条件别写反了    │
│ ⚠️ 易错：关联/标量子查询逐行执行，性能坑      │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. UNION vs UNION ALL  ：UNION 去重+排序（慢），UNION ALL 不去重（快），能不用 UNION 就不用
2. IN vs EXISTS  ：子查询结果集小用 IN，大用 EXISTS；大数据量推荐用 JOIN
3. CASE WHEN 行转列  ：`SUM(CASE WHEN 条件 THEN 1 ELSE 0 END)` 是经典写法
4. ROWNUM 特性  ：从1开始，不能直接用 `>`，分页/TOP-N 要嵌套子查询
5. ROWNUM vs ROWID  ：行号 vs 物理地址，一个动态一个固定

#### 🎯 动手练习

> 练习1  ：创建两张表orders\_2025和orders\_2026，用UNION ALL查询两年的所有订单
>
> 练习2  ：用IN子查询查询"下过单的客户"对应的订单信息
>
> 练习3  ：用CASE WHEN将订单金额分为三档：>=3000为HIGH，>=2000为MEDIUM，其他为LOW
>
> 练习4  ：用ROWNUM实现分页查询，查询第6-10条订单

#### 🤖 AI 加餐：让 AI 当"纠错器"，而不是"答题器"

场景：验证 AI 写的 SQL 靠不靠谱

——先让 DeepSeek 写一条子查询，你人工挑错：

```text
基于电商表 orders(order_id, customer_id, total_amount, status, region_id)，
写一条SQL：查询订单金额高于全店平均金额的订单，输出订单号、客户ID、金额、与平均金额的差值。
写完后请再检查一遍：SELECT 里出现的非聚合列是否都在 GROUP BY 里？子查询有没有性能陷阱？
```

⚠️ 验证要点

：拿到 AI 的 SQL 后做三件事——① 自己先读一遍逻辑通不通；② 贴进 Oracle 跑；③ 故意把 SQL 改错一处（比如去掉 WHERE），看报错是不是你预想的那种。改错是最好的学习。

#### 🔗 下一章预告

第三章：单行函数

* 学完字符函数，你会处理字符串（拼接、截取、替换）
* 学完正则表达式，你会做数据校验和脱敏
* 学完日期函数，你会灵活处理时间计算
* 学完转换函数，你会进行类型转换
* 面试高频  ：正则表达式脱敏、NULL值处理、日期计算

***

## ⚡ 三、单行函数

> 💡   一句话理解  ：Oracle函数就像Excel里的公式——字符函数处理文字，数值函数处理数字，日期函数处理时间。
>
> 🚀   本章要解决的问题  ：数据从来不是"干净整齐"的——字符串要截取、日期要格式化、空值要处理。函数就是数据的"美容师"和"整形师"。

### 🔤 3.1 字符函数

> 💡   一句话理解  ：字符函数就是处理文字的——拼接、截取、替换、找位置。和 Excel 里的文本公式是一个意思。

> 📌   重要程度标注  ：⭐⭐⭐ 必背（每天都用） / ⭐⭐ 常用 / ⭐ 了解即可

***

#### ▫️ ⭐⭐⭐ 拼接与长度（最常用）

| 函数             | 作用                   | 类比 Excel |
| :------------- | :------------------- | :------- |
| `\|\|`         | 拼接两个字符串              | `&`      |
| `CONCAT(a, b)` | 拼接两个字符串（和 `\|\|` 一样） | CONCAT   |
| `LENGTH(s)`    | 字符串长度                | LEN      |

```sql
-- 💼 拼接：客户号 + 姓名做显示字段
SELECT customer_id || '-' || customer_name AS customer_display
FROM customers;
-- 结果：C001-张三

-- 💼 长度校验：手机号必须11位，过滤脏数据
SELECT * FROM customers WHERE LENGTH(phone) != 11;
```

> 💡   小知识  ：`\|\|` 可以拼接任意多个，`CONCAT` 只能接两个（但可以嵌套）。工作中一般用 `\|\|`，写起来方便。

***

#### ▫️ ⭐⭐⭐ 截取与查找（第二常用）

| 函数                           | 作用   | 说明                   |
| :--------------------------- | :--- | :------------------- |
| `SUBSTR(s, start, len)`      | 截取子串 | start 从 1 开始；负数从右往左数 |
| `INSTR(s, target, start, n)` | 查找位置 | 找第 n 次出现的位置，找不到返回 0  |

```sql
-- 💼 SUBSTR：截取身份证前6位（地区码）做归属地分析
SELECT SUBSTR('110101199001011234', 1, 6) FROM dual;  -- 110101

-- 💼 负数从右数：截取后4位（手机号尾号）
SELECT SUBSTR('13812345678', -4) FROM dual;  -- 5678

-- 💼 INSTR：查找"@"在邮箱中的位置
SELECT INSTR('zhangsan@163.com', '@') FROM dual;  -- 9

-- 💼 INSTR找第2次出现的位置：找订单号中第2个数字的位置
SELECT INSTR('ORD123ABC456', '1', 1, 1) FROM dual;  -- 第1次出现的位置
```

> ⚠️   易错点  ：Oracle 的 SUBSTR 从   1   开始，不是从 0 开始！很多从 Java/Python 转过来的同学容易写错。
>
> ```sql
> -- 取第一个字符：从第1位开始，取1个
> SELECT SUBSTR('abc', 1, 1) FROM dual;  -- a
> ```

***

#### ▫️ ⭐⭐ 大小写转换与补位

| 函数                      | 作用          |
| :---------------------- | :---------- |
| `UPPER(s)` / `LOWER(s)` | 转大写 / 转小写   |
| `INITCAP(s)`            | 首字母大写（每个单词） |
| `LPAD(s, len, char)`    | 左边补字符到指定长度  |
| `RPAD(s, len, char)`    | 右边补字符到指定长度  |

```sql
-- 💼 统一大小写：用户输入的邮箱乱七八糟，统一转小写再匹配
SELECT * FROM customers WHERE LOWER(email) = 'zhangsan@163.com';

-- 💼 LPAD补零：订单号不足6位左边补0
SELECT LPAD('123', 6, '0') FROM dual;  -- 000123
```

***

#### ▫️ ⭐⭐ 去空格与替换

| 函数                       | 作用         |
| :----------------------- | :--------- |
| `TRIM(s)`                | 去掉首尾空格     |
| `LTRIM(s, chars)`        | 去掉左边指定字符   |
| `RTRIM(s, chars)`        | 去掉右边指定字符   |
| `REPLACE(s, old, new)`   | 替换所有匹配的字符串 |
| `TRANSLATE(s, from, to)` | 按字符一一对应替换  |

```sql
-- 💼 TRIM：数据清洗——用户输入的姓名前后可能有空格
SELECT TRIM('  张三  ') FROM dual;  -- '张三'

-- 💼 REPLACE：把手机号中间的"-"去掉
SELECT REPLACE('138-1234-5678', '-', '') FROM dual;  -- 13812345678
```

> 📌   TRANSLATE vs REPLACE 的区别  ：
>
> * `REPLACE` 是是是整体替换是是：把 "abc" 替换成 "x"
> * `TRANSLATE` 是是是逐字符替换是是：a→x, b→y, c→z，一个字符对一个字符
>
> 工作中 REPLACE 用得多，TRANSLATE 了解即可。

***

#### 📌 字符函数优先级总结

1. 每天都用  ：`\|\|` 拼接、`SUBSTR` 截取、`LENGTH` 长度、`INSTR` 查找
2. 经常用  ：`TRIM` 去空格、`UPPER/LOWER` 大小写、`REPLACE` 替换、`LPAD` 补零
3. 了解即可  ：`INITCAP`、`TRANSLATE`、`LTRIM/RTRIM`（带字符集的）

### 🔍 3.2 正则表达式函数（🔥面试高频）

> 💡   一句话理解  ：正则=用"模式"匹配文本。做数据清洗时，手机号/邮箱验证、敏感信息脱敏，正则是一行代码搞定的事情。
>
> 🚀   为什么学？   工作中的数据从来不是"干干净净"的——手机号格式不对、邮箱缺@、身份证暴露了。用正则做数据校验和脱敏是大数据开发的必备技能。

#### 📋 常用元字符（速查）

| 元字符             | 说明            | 示例               |
| --------------- | ------------- | ---------------- |
| `.`             | 任意单个字符        | `a.c` → `abc`    |
| `*` / `+`       | 0个或多个 / 1个或多个 | `ab*` → `a`、`ab` |
| `^` / `$`       | 开头 / 结尾       | `^1` → 以1开头      |
| `\d` / `\D`     | 数字 / 非数字      | `\d{11}` → 11位数字 |
| `[]` / `[^]`    | 字符集 / 否定      | `[3-9]` → 3到9之间  |
| `{n}` / `{n,m}` | 恰好n次 / n到m次   | `\d{3,4}`        |
| `\|`            | 或             | `a\|b` → a或b     |

##### 🧮 三大核心函数 + 实战场景

① REGEXP\_LIKE —— 数据校验

```sql
-- 创建示例表
CREATE TABLE customer_info (
    id NUMBER, name VARCHAR2(50), phone VARCHAR2(20), email VARCHAR2(50)
);
INSERT INTO customer_info VALUES (1, '张三', '13812345678', 'zhangsan@163.com');
INSERT INTO customer_info VALUES (2, '李四', '1381234567', 'wangwuqq.com');  -- 手机号少1位，邮箱缺@

-- 验证手机号：11位，1开头，第2位3-9
SELECT * FROM customer_info
WHERE REGEXP_LIKE(phone, '^1[3-9]\d{9}$');

-- 验证邮箱：必须有@和域名
SELECT * FROM customer_info
WHERE REGEXP_LIKE(email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
```

② REGEXP\_SUBSTR —— 数据提取

```sql
-- 提取邮箱域名（@后面的部分）
SELECT email,
    REGEXP_SUBSTR(email, '@(.+)$', 1, 1, NULL, 1) AS domain
FROM customer_info;

-- 提取字符串中所有数字
SELECT '订单号A123金额456元' AS str,
    REGEXP_SUBSTR('订单号A123金额456元', '\d+', 1, 1) AS order_id,  -- 123
    REGEXP_SUBSTR('订单号A123金额456元', '\d+', 1, 2) AS amount;     -- 456
```

③ REGEXP\_REPLACE —— 数据脱敏（🔥面试高频）

```sql
-- 手机号脱敏：13812345678 → 138****5678
SELECT phone,
    REGEXP_REPLACE(phone, '(\d{3})\d{4}(\d{4})', '\1****\2') AS phone_masked
FROM customer_info;

-- 邮箱脱敏：zhangsan@163.com → zha***@163.com
SELECT email,
    REGEXP_REPLACE(email, '(.{3}).*@', '\1***@') AS email_masked
FROM customer_info;
```

> 🔥   面试高频  ：手机号/身份证脱敏是数据安全面试题标配。掌握 `REGEXP_REPLACE` 的捕获组引用（`\1`、`\2`）即可。
>
> ⚠️   易错点  ：`.*` 匹配0个或多个，`.+` 匹配1个或多个。`REGEXP_LIKE('', '.*')` 为真，`REGEXP_LIKE('', '.+')` 为假。面试经常问这个区别。

> 🤔   思考题  ：用正则实现以下需求——一个字符串 "订单号A123B456"，请分别提取出第1个连续数字和第2个连续数字。（提示：REGEXP\_SUBSTR 的 occurrence 参数）

***

### 🔢 3.3 数值函数

💼   工作场景：

* `ROUND`：金额保留两位小数——报表展示必须四舍五入
* `TRUNC`：直接截断小数位——合同金额按分计算时用
* `MOD`：判断奇偶、均匀分配数据到多个分区
* `CEIL/FLOOR`：向上/向下取整——分页时算总页数 `CEIL(总条数/每页条数)`

```sql
SELECT
    MOD(5, 3)       AS mod_result,         -- Mod: 2
    TRUNC(5/3)      AS trunc_result,       -- Trunc: 1
    TRUNC(5/3, 2)   AS trunc_2_decimal,    -- Trunc: 1.66
    ROUND(5/3)      AS round_result,       -- Round: 2
    ROUND(5/3, 2)   AS round_2decimals,    -- Round: 1.67
    POWER(5, 3)     AS power_result,       -- 125
    SQRT(3)         AS sqrt_result,        -- 1.73
    ABS(-5)         AS abs_result,         -- 5
    CEIL(5/3)       AS ceil_result,        -- 2
    FLOOR(5/3)      AS floor_result        -- 1
FROM DUAL;
```

***

### 📅 3.4 日期函数

> 💡   一句话理解  ：Oracle日期可以直接加减天数，加减月份用函数，算间隔用 MONTHS\_BETWEEN。

💼   工作场景：

* `SYSDATE`：取当前时间做跑批业务日期
* `ADD_MONTHS`：算上个月/下个月的同期——同比环比报表
* `LAST_DAY`：取月底——电商月末结算日
* `TRUNC(SYSDATE, 'MM')`：取当月1号——计算本月至今的累计值
* `MONTHS_BETWEEN`：算两个日期差几个月——会员年卡剩余月数

```sql
SELECT
    SYSDATE                         AS current_date,        -- Current time
    SYSDATE + 1                     AS tomorrow,           -- Date + 1 day
    ADD_MONTHS(SYSDATE, 2)          AS add_2_months,      -- Add months
    MONTHS_BETWEEN(SYSDATE, DATE'2024-1-1') AS month_diff,     -- Months between
    NEXT_DAY(SYSDATE, 3)            AS next_wednesday,     -- Next weekday
    LAST_DAY(SYSDATE)               AS end_of_month,       -- Last day of month
    TRUNC(SYSDATE, 'YYYY')          AS start_of_year,       -- Start of year
    TRUNC(SYSDATE, 'MM')           AS start_of_month,     -- Start of month
    TRUNC(SYSDATE)                  AS today             -- Today (truncated)
FROM DUAL;
```

> 💡   记忆口诀  ：SYSDATE是"当前时间"，ADD\_MONTHS是"加减月份"，TRUNC是"截断日期"

#### ▫️ 实战应用

```sql
-- 💼 查每月1号下的订单（月初活动订单）
SELECT * FROM orders WHERE TO_CHAR(order_date, 'dd') = '01';

-- 💼 查本月的所有订单（用TRUNC截断到月份，比BETWEEN好写）
SELECT * FROM orders WHERE TRUNC(order_date, 'mm') = TRUNC(SYSDATE, 'mm');

-- 💼 计算上个月最后一天、下个月第一天
SELECT
    TO_CHAR(LAST_DAY(ADD_MONTHS(SYSDATE, -1)), 'yyyy-mm-dd') AS last_day_of_last_month,
    TO_CHAR(TRUNC(ADD_MONTHS(SYSDATE, 1), 'mm'), 'yyyy-mm-dd') AS first_day_of_next_month
FROM DUAL;
```

> ⚠️   注意  ：Oracle 日期直接加减的是是是天数是是，不是小时。
>
> * `SYSDATE + 1` 是明天（加1天）
> * 加 1 小时：`SYSDATE + 1/24`
> * 加 1 分钟：`SYSDATE + 1/1440`

***

### 🔄 3.5 转换函数

> 💡   一句话理解  ：Oracle三剑客——TO\_CHAR转字符串、TO\_DATE转日期、TO\_NUMBER转数字。

💼   工作场景：

* `TO_CHAR(SYSDATE, 'yyyy-mm-dd')`：日期转字符串做分区名——`dt=2026-05-22`
* `TO_DATE('2026-05-22', 'yyyy-mm-dd')`：字符串转日期做条件过滤——查某一天的数据
* `TO_NUMBER`：把从文件里读到的字符串金额转成数字做计算

```sql
SELECT
    TO_DATE('2025-11-12 13:14:15', 'yyyy-mm-dd hh24:mi:ss') AS to_date,
    TO_NUMBER('123') + 100                AS to_number,
    TO_CHAR(123) || 'Hello'               AS to_char,
    TO_CHAR(SYSDATE, 'yyyy')               AS year,
    TO_CHAR(SYSDATE, 'mm')                 AS month,
    TO_CHAR(SYSDATE, 'dd')                 AS day,
    TO_CHAR(SYSDATE, 'q')                  AS quarter,
    TO_CHAR(SYSDATE, 'day')                AS weekday
FROM DUAL;

-- 计算上个月最后一天、下个月第一天
SELECT
    TO_CHAR(LAST_DAY(ADD_MONTHS(SYSDATE, -1)), 'yyyy-mm-dd') AS last_day_of_last_month,
    TO_CHAR(TRUNC(LAST_DAY(ADD_MONTHS(SYSDATE, 1)), 'mm'), 'yyyy-mm-dd') AS first_day_of_next_month
FROM DUAL;
```

> 💡   记忆口诀  ：TO\_CHAR转字符、TO\_DATE转日期、TO\_NUMBER转数字

***

### ❓ 3.6 空值函数

> 💡   一句话理解  ：`NULL + 数字 = NULL`，用 NVL 把 NULL 变成默认值（比如0），运算就正常了。

💼   工作场景：

* `NVL(discount, 0)`：算实际支付金额时，折扣字段为 NULL 就当成0——不然 `金额+NULL=NULL`，整行数据废了
* `NVL2`：判断字段是否为空，空走一条路非空走另一条——比如有空值标记需人工审核
* `COALESCE`：多字段依次取第一个非空值——合同有多个联系方式，哪个有值用哪个

> 🤔   思考题  ：NVL(a, b) 和 COALESCE(a, b, c, d) 有什么区别？如果 a 是 NULL，b 也是 NULL，NVL 和 COALESCE 各返回什么？（答案：NVL只支持两个参数，COALESCE支持多个参数返回第一个非空值）

```sql
-- NVL: If NULL, return default value
SELECT customer_name,
       total_amount,
       NVL(discount_amount, 0) AS discount
FROM orders;

-- 💼 NVL2：有折扣就算折后价，没折扣就用原价
SELECT customer_name,
       total_amount,
       NVL2(discount_amount, total_amount - discount_amount, total_amount) AS pay_amount
FROM orders;
```

> 💡   记忆口诀  ：NVL就是"空值替换"，NVL2就是"非空走这边、空值走那边"

> 🔥   面试高频  ：NVL、NVL2、COALESCE 三者的区别？COALESCE 支持多个参数，返回第一个非空值，比 NVL 更灵活。
>
> ⚠️   易错点（最常犯）  ：`NULL + 数字 = NULL`。如果 discount\_amount 是 NULL，`total_amount + discount_amount` 的结果是 NULL！必须用 `NVL(discount_amount, 0)`。

> 🤔   思考题  ：如何用正则表达式从字符串"订单号A123金额456元"中分别提取出123和456？（提示：使用REGEXP\_SUBSTR的occurrence参数）

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第三章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 字符函数  → CONCAT/SUBSTR/LENGTH/TRIM      │
│ 📌 正则函数  → REGEXP_LIKE/SUBSTR/REPLACE     │
│ 📌 数值函数  → ROUND/TRUNC/MOD/CEIL/FLOOR     │
│ 📌 日期函数  → SYSDATE/ADD_MONTHS/MONTHS_BETWEEN │
│ 📌 转换函数  → TO_CHAR/TO_DATE/TO_NUMBER      │
│ 📌 空值函数  → NVL/NVL2/COALESCE              │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：NULL参与运算结果仍为NULL               │
│ ⚠️ 易错：SUBSTR索引从1开始                     │
│ ⚠️ 易错：REGEXP_LIKE中.*匹配0个或多个          │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 正则表达式  ：REGEXP\_REPLACE实现手机号脱敏（捕获组\1\2引用）
2. NULL处理  ：`NULL + 数字 = NULL`，必须用NVL处理
3. 日期计算  ：`SYSDATE + 1`是加一天，`ADD_MONTHS`加月份
4. 转换函数  ：TO\_CHAR转字符串、TO\_DATE转日期、TO\_NUMBER转数字

#### 🎯 动手练习

> 练习1  ：用SUBSTR提取客户身份证号的前6位（地区码）
>
> 练习2  ：用REGEXP\_REPLACE将手机号13812345678脱敏为138\*\*\*\*5678
>
> 练习3  ：用ADD\_MONTHS和LAST\_DAY计算上个月最后一天
>
> 练习4  ：用NVL处理空值，计算实际支付金额（total\_amount + NVL(discount\_amount, 0)）

#### 🤖 AI 加餐：AI 辅助写正则（最强应用场景）

正则是"AI 提效最明显"的知识点——需求描述清楚，DeepSeek 能直接给你能跑的正则。

```text
请帮我写 Oracle 的 REGEXP_REPLACE：
把手机号 13812345678 脱敏成 138****5678；
把身份证号 110101199001011234 脱敏成 110101********1234（保留前6位和后4位）。
写完请逐段解释正则每个部分的作用，并说明捕获组 \1 \2 是怎么用的。
```

⚠️ 验证要点

：AI 给的正则则则必须自己造 3 条测试数据则则（1 条正常、1 条异常、1 条边界）贴进 Oracle 验证。正则是最容易"看着对、跑着错"的东西——AI 尤其容易忽略中文字符宽度问题。

#### 🔗 下一章预告

第四章：分析函数（窗口函数）

* 学完聚合窗口函数，你会计算累计值、移动平均
* 学完排名函数，你会实现ROW\_NUMBER、RANK、DENSE\_RANK
* 学完偏移函数，你会计算同比环比
  -（🔥面试必考）连续登录问题
* 面试高频  ：窗口函数边界、排名函数区别、连续登录问题

***

## 📈 四、分析函数（窗口函数）

> 💡   一句话理解  ：普通聚合把多行压成一行（比如 GROUP BY），窗口函数保持多行，但每行都能看到聚合结果——相当于"带窗户的聚合"。
>
> 🚀   本章要解决的问题  ：GROUP BY 把多行压成一行，但工作中经常需要"每行保留的同时看到聚合结果"——比如每笔订单的金额和它所在区域的平均金额、销量排名、上个月的销售额。窗口函数就是干这个的。
>
> 🔥   面试高频  ：窗口函数是大数据开发面试的必考点！Hive SQL 中窗口函数用法几乎一样。不会窗口函数，面试大数据就是"送人头"。

### 🔢 4.1 聚合窗口函数

```sql
-- Calculate aggregation by department
SELECT
    e.*,
    SUM(total_amount) OVER(PARTITION BY region_id) AS sum_by_region,
    AVG(total_amount) OVER(PARTITION BY region_id) AS avg_by_region,
    MAX(total_amount) OVER(PARTITION BY region_id) AS max_by_region,
    MIN(total_amount) OVER(PARTITION BY region_id) AS min_by_region,
    COUNT(*) OVER(PARTITION BY region_id) AS count_by_region
FROM orders e;

-- Cumulative calculation
SELECT
    e.*,
    SUM(total_amount) OVER(ORDER BY order_id) AS running_total,
    SUM(total_amount) OVER(PARTITION BY region_id ORDER BY order_id) AS running_total_by_region
FROM orders e;

-- 窗口边界（ROWS / RANGE）：控制聚合范围，面试常问
-- 默认：RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
-- 即：从分区第一行到当前行（含相同排序值的行）
SELECT
    e.*,
    -- 默认边界：累计求和（从第一行到当前行）
    -- 场景：店铺账户余额流水表，每行显示到当前时间点的累计余额
    SUM(total_amount) OVER(ORDER BY order_id) AS default_frame,
    -- ROWS 边界：从第1行到当前行（精确按行，不管排序值是否相同）
    SUM(total_amount) OVER(ORDER BY order_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_frame,
    -- 前3行 + 当前行 + 后1行 = 共5行滚动窗口（移动平均常用）
    -- 场景：近5笔订单金额移动平均、观察GMV短期趋势
    SUM(total_amount) OVER(ORDER BY order_id ROWS BETWEEN 3 PRECEDING AND 1 FOLLOWING) AS moving_5rows,
    -- 当前行 + 后2行
    -- 场景：查当前订单及未来2笔订单的金额合计（预估短期回款）
    SUM(total_amount) OVER(ORDER BY order_id ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING) AS next_3rows,
    -- 全部分区行（等价于不加 ORDER BY）
    -- 场景：每行显示当月总业绩，和当前行自己的业绩对比看占比
    SUM(total_amount) OVER(ORDER BY order_id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS whole_partition
FROM orders e;

-- 查询订单金额高于所在区域平均金额的订单数
WITH a AS (
    SELECT e.*, AVG(total_amount) OVER(PARTITION BY region_id) AS avg
    FROM orders e
)
SELECT region_id, COUNT(1) FROM a WHERE total_amount > avg GROUP BY region_id;
```

> 🔥   面试高频  ：窗口函数的默认边界是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`——也就是从分区第一行累加到当前行。面试会问「`ROWS` 和 `RANGE` 的区别？」——ROWS 精确按行数，RANGE 按排序值（相同值算同一行）。Hive SQL 里也一样用。
>
> 💼   工作场景速查：
>
> * `ROWS BETWEEN 3 PRECEDING AND CURRENT ROW` → 近3日GMV移动平均（观察销售趋势）
> * `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` → 年初至今累计（YTD 报表，最常用）
> * `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` → 剩余未结算金额（待结算订单）
> * `ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING` → 当前行+前后各一行（平滑数据波动）
>
> 📌   必记  ：不加 `ORDER BY` 时窗口是整个分区（等价于 `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`）。加了 `ORDER BY` 不指定边界时，默认是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`。这是新人最容易搞混的。
>
> 💻   动手练  ：用 orders 表，计算每个订单金额的「最近3笔（含当前）移动平均金额」，按订单日期排序。

***

### 🏆 4.2 排名函数（🔥面试高频）

> 💡   一句话理解  ：ROW\_NUMBER=绝对公平（不并列），RANK=比赛排名（并列跳号），DENSE\_RANK=紧密排名（并列不跳号）。

💼   工作场景：

* ROW\_NUMBER  ：取每个分类下的前N条——比如每个区域订单金额最大的前10笔订单
* RANK  ：并列排名——业绩相同的人排名相同，下一个人跳号（像比赛领奖台）
* DENSE\_RANK  ：并列但不跳号——取每个区域订单金额前3名，有并列也不漏单

| 函数          | 说明 | 特点                |
| ----------- | -- | ----------------- |
| ROW\_NUMBER | 行号 | 连续不重复：1,2,3,4,5,6 |
| RANK        | 排名 | 跳跃重复：1,2,2,2,5,6  |
| DENSE\_RANK | 排名 | 连续重复：1,2,2,3,3,4  |

```sql
-- 全表排名
SELECT
    e.*,
    ROW_NUMBER() OVER(ORDER BY total_amount DESC) AS rn,
    RANK() OVER(ORDER BY total_amount DESC) AS rk,
    DENSE_RANK() OVER(ORDER BY total_amount DESC) AS drk
FROM orders e;

-- 按区域排名
SELECT
    e.*,
    RANK() OVER(PARTITION BY region_id ORDER BY total_amount DESC) AS rank_by_region
FROM orders e;

-- 查询每个区域订单金额第2名
WITH a AS (
    SELECT e.*, DENSE_RANK() OVER(PARTITION BY region_id ORDER BY total_amount DESC) AS rk
    FROM orders e
)
SELECT * FROM a WHERE rk = 2;

-- 查询每个区域金额最高的订单
WITH a AS (
    SELECT e.*, DENSE_RANK() OVER(PARTITION BY region_id ORDER BY total_amount) AS rk
    FROM orders e
)
SELECT * FROM a WHERE rk = 1;
```

> 💡   记忆口诀  ：ROW\_NUMBER=绝对公平（不并列），RANK=比赛排名（并列跳号），DENSE\_RANK=紧密排名（并列不跳号）

> 💻   动手练（经典面试题）  ：用 orders 表，找出"每个地区订单金额排名前3的订单"。提示：用 RANK() + PARTITION BY region\_id + ORDER BY total\_amount DESC，然后嵌套查询取 rk <= 3。

> 💬   课堂讨论  ：如果公司年会抽奖，一等奖1人、二等奖2人、三等奖3人——遇到并列成绩时，用 ROW\_NUMBER、RANK、DENSE\_RANK 哪个更适合？为什么？

#### 📦 4.2 补充：NTILE 分桶（Hive/Spark 同样支持，面试加分）

> 💡   一句话理解  ：NTILE(n) 把排序后的数据据据尽量平均切成 n 桶据据，每行标记自己落在第几桶。

💼   工作场景  ：运营要做客户分层——按消费金额把客户切成 4 档（高价值/中高/中低/沉睡），每档档档人数档档尽量一样多。

```sql
-- 把客户按订单金额降序分成 4 档，1 = 消费最高的 25% 人群
SELECT customer_name,
       total_amount,
       NTILE(4) OVER(ORDER BY total_amount DESC) AS value_group
FROM orders;

-- 取前 25% 高价值客户
SELECT customer_name, total_amount
FROM (
    SELECT customer_name, total_amount,
           NTILE(4) OVER(ORDER BY total_amount DESC) AS g
    FROM orders
)
WHERE g = 
```

> ⚠️   易错点  ：NTILE 是"按人数均分"，不是"按金额均分"——想要金额各占 25%，得用累计占比 `CUME_DIST()`。
>
> 🔥   面试高频  ：NTILE 与 RANK 的区别——RANK 按值排名（可能并列），NTILE 强制均分成 n 组（不并列）。Hive/Spark SQL 同样支持，分层运营场景天天用。

### ⬅️ 4.3 偏移函数  

> 💡   一句话理解  ：LAG 查上一行，LEAD 查下一行。不用自连接，一行搞定。

💼   工作场景：

* LAG  ：算环比——今天比昨天增长了多少，不需要自连接，LAG 直接取上一行
* LEAD  ：预测——当前订单完成后，下一个订单预计什么时候
* LAG(..., 12)  ：同比——拿这个月和去年同月比

```sql
-- 上下偏移
SELECT
    e.*,
    LAG(total_amount, 1) OVER(ORDER BY order_date) AS prev_amount,
    LEAD(total_amount, 1) OVER(ORDER BY order_date) AS next_amount
FROM orders e;

-- 偏移2行
SELECT
    e.*,
    LAG(total_amount, 2) OVER(ORDER BY order_date) AS prev_2_amount
FROM orders e;

-- 同环比计算（重要）
-- 同比增长率 = (本期 - 同期) / 同期 * 100%
-- 环比增长率 = (本期 - 上期) / 上期 * 100%
SELECT
    order_date   AS d1,
    total_amount AS price,
    ROUND((total_amount - LAG(total_amount, 12) OVER(ORDER BY order_date)) / LAG(total_amount, 12) OVER(ORDER BY order_date) * 100, 2) || '%' AS yoy,
    ROUND((total_amount - LAG(total_amount, 1) OVER(ORDER BY order_date)) / LAG(total_amount, 1) OVER(ORDER BY order_date) * 100, 2) || '%' AS mom
FROM orders;
```

> 💡   记忆口诀  ：LAG是"落后"（看上一行），LEAD是"领先"（看下一行）

> 🤔   思考题  ：不用 LAG/LEAD，你能用自连接实现"查每个订单和上一个订单的金额差"吗？哪种方式效率更高？

***

### 🎯 4.4 连续登录问题（🔥面试必考）

> 💡   一句话理解  ：核心思路————同一个人按日期排名，日期减排名的差值相同，就是连续的——。这是 SQL 面试的"天花板级"题目，但思路比语法值钱多了。

> 🤔   为什么会想到这个思路？   想象一下：
>
> * 你连续 3 天打卡：1号、2号、3号 → 排名是 1、2、3 → 日期-排名 = 0、0、0（都一样！）
> * 中间断了一天：1号、2号、4号 → 排名是 1、2、3 → 日期-排名 = 0、0、1（不一样！）
>
> 连续的日期，减上连续的排名，差值一定相同——就这么简单。

#### ▫️ 五步解题法

需求

：求每个用户的最大连续登录天数。

```sql
-- 建表：用户登录记录表
CREATE TABLE login_log (
    user_id     VARCHAR2(20),
    login_time  DATE
);

-- 插入测试数据（用户U001：1-3号连续，5-6号连续，中间4号断了）
INSERT INTO login_log VALUES ('U001', DATE'2026-05-01');
INSERT INTO login_log VALUES ('U001', DATE'2026-05-02');
INSERT INTO login_log VALUES ('U001', DATE'2026-05-03');
INSERT INTO login_log VALUES ('U001', DATE'2026-05-05');
INSERT INTO login_log VALUES ('U001', DATE'2026-05-06');
```

步骤拆解

：

```sql
WITH 
-- 步骤1：去重——同一天多次登录只算1次（按天粒度）
step1 AS (
    SELECT user_id, TRUNC(login_time) AS login_date
    FROM login_log
    GROUP BY user_id, TRUNC(login_time)
),
-- 步骤2：排名——每个用户按登录日期排序，给个行号
step2 AS (
    SELECT user_id,
           login_date,
           ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY login_date) AS rn
    FROM step1
),
-- 步骤3：算差值——日期减排名，连续的天差值相同
step3 AS (
    SELECT user_id,
           login_date,
           rn,
           login_date - rn AS diff  -- 关键：连续的日期，减上连续的排名，差值一样
    FROM step2
),
-- 步骤4：分组统计——按(用户, 差值)分组，每组有多少行就是连续多少天
step4 AS (
    SELECT user_id,
           diff,
           COUNT(*) AS consecutive_days
    FROM step3
    GROUP BY user_id, diff
)
-- 步骤5：取最大值——每个用户的最大连续天数
SELECT user_id, MAX(consecutive_days) AS max_consecutive_days
FROM step4
GROUP BY user_id;
```

#### ▫️ 中间结果长什么样？

拿 U001 的数据一步步看：

| step1 login\_date | step2 rn | step3 diff = date - rn | 说明           |
| :---------------- | :------- | :--------------------- | :----------- |
| 05-01             | 1        | 04-30                  | 第1段连续开始      |
| 05-02             | 2        | 04-30                  | 差值一样，连续      |
| 05-03             | 3        | 04-30                  | 差值一样，连续      |
| 05-05             | 4        | 05-01                  | 断了！差值变了，新的一段 |
| 05-06             | 5        | 05-01                  | 差值一样，连续      |

最后按 diff 分组：diff=04-30 有 3 行（连续3天），diff=05-01 有 2 行（连续2天）。U001 的最大连续天数是 3。

> 📌   记住这个套路  ：去重 → 排名 → 算差值 → 分组统计 → 取最大。这是"连续N天"类问题的通用解法，换汤不换药——连续下单、连续打卡、连续签到，全是一个思路。

#### ▫️ 常见变式题

1. 连续登录 3 天以上的用户有多少个？   → 在 step4 后加 `WHERE consecutive_days >= 3`，再 COUNT DISTINCT user\_id
2. 最长连续下单天数   → 把 login 表换成 orders 表，思路完全一样
3. 连续登录天数排名   → 加个 RANK() OVER(ORDER BY max\_consecutive\_days DESC)

> 🔥   面试高频  ：连续登录问题是大厂 SQL 面试的"守门员"题——不会这道，直接凉凉。但只要理解了"日期减排名"的核心思路，所有变式题都能迎刃而解。

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第四章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 聚合窗口  → SUM/AVG/MAX/MIN/COUNT OVER()   │
│ 📌 排名函数  → ROW_NUMBER/RANK/DENSE_RANK     │
│ 📌 偏移函数  → LAG/LEAD                       │
│ 📌 窗口边界  → ROWS BETWEEN ... AND ...       │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：不加ORDER BY窗口是整个分区             │
│ ⚠️ 易错：ROWS按行数，RANGE按排序值              │
│ ⚠️ 易错：默认边界是UNBOUNDED PRECEDING到当前行  │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 排名函数区别  ：ROW\_NUMBER连续不重复，RANK跳跃重复，DENSE\_RANK连续重复
2. 窗口边界  ：默认`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`
3. ROWS vs RANGE  ：ROWS精确按行数，RANGE按排序值（相同值算同一行）
4. 连续登录思路  ：去重→排名→计算差值→分组统计

#### 🎯 动手练习

> 练习1  ：用窗口函数计算每个订单的累计销售额（按订单日期排序）
>
> 练习2  ：用RANK函数找出每个地区订单金额排名前3的订单
>
> 练习3  ：用LAG函数计算环比增长率（本期-上期）/上期
>
> 练习4  ：用窗口函数计算最近3笔订单的移动平均金额

#### 🤖 AI 加餐：让 AI 把"连续登录"讲到你真懂

连续登录是面试必考，，，思路比语法值钱，，。让 DeepSeek 当讲解员：

```text
请用电商场景给我讲"连续登录天数"问题的思路（用户表 login_log(user_id, login_time)）。
要求：1. 先讲人话思路，不要代码；2. 再分步给 SQL，每一步解释中间结果长什么样（用假数据演示）；
3. 最后出 2 道变式题（比如：连续登录3天以上的用户数、最长连续下单天数）考我。
```

⚠️ 验证要点

：让 AI 用假数据演示每步中间结果，你拿这组假数据在 Oracle 里真跑一遍，对照中间结果——这是理解窗口函数最快的方法。

#### 🔗 下一章预告

第五章：多表关联

* 学完连接类型，你会掌握INNER JOIN、LEFT JOIN、FULL JOIN
* 学完自连接，你会处理同一张表内的关联
* 学完行列互转，你会用PIVOT/UNPIVOT
* 学完CTE，你会用公共表表达式优化复杂查询
* 面试高频  ：LEFT JOIN vs INNER JOIN、笛卡尔积、CTE

***

## 🔗 五、多表关联

> 💡   一句话理解  ：JOIN就是"找对象"——INNER JOIN是"双向奔赴"（必须匹配才显示），LEFT JOIN是"一厢情愿"（左表全留，右表有就显示没有就NULL），FULL JOIN是"都别落下"。
>
> 🚀   本章要解决的问题  ：实际数据不会全在一张表里——orders表有订单信息，customers表有客户信息，departments表有大区信息。想查"每个客户的订单及所属大区"就得把表串起来。JOIN就是"串表的胶水"。

### 🔌 5.1 连接类型（🔥面试高频）

💼   工作场景：

* INNER JOIN  ：查订单的同时关联出客户名和经办人——订单表和客户表、员工表三张串起来
* LEFT JOIN  ：查所有客户，有的客户还没下过单也要列出来——左表全保留
* FULL JOIN  ：对账——A表有B表没有、B表有A表没有的都要看
* 不等值连接  ：金额区间匹配等级——比如交易额落在哪个佣金区间

```sql
-- 内连接：只返回匹配的数据
SELECT o.order_id, o.order_date, c.customer_name, e.employee_name AS employee
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN employees e ON o.employee_id = e.employee_id;

-- 左外连接：主表数据全部显示
SELECT c.customer_id, c.customer_name, o.order_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id;

-- 右外连接：以右表为准
SELECT c.customer_id, c.customer_name, o.order_id
FROM orders o
RIGHT JOIN customers c ON o.customer_id = c.customer_id;

-- 全外连接：两表都全显
SELECT a.id, a.name, b.id, b.name
FROM a FULL JOIN b ON a.id = b.id;

-- 不等值连接：订单金额落在哪个佣金结算阶梯（阶梯表见附录A）
SELECT e.customer_name, e.total_amount, s.level_id
FROM orders e
JOIN commission_levels s ON e.total_amount BETWEEN s.min_amount AND s.max_amount;
```

> 💡   记忆口诀  ：LEFT JOIN是"左表全留"，RIGHT JOIN是"右表全留"，INNER JOIN是"必须匹配"

> ⚠️   生产事故高发1：笛卡尔积
>
> 多表关联忘记写 ON 条件 → 行数直接相乘！1000 行订单 × 500 个客户 = 50 万行。
>
> 📌   好习惯  ：写 JOIN 先写 ON，再写 SELECT。别写完 SELECT 才想起关联条件——忘了就是线上事故。

> ⚠️   生产事故高发2：LEFT JOIN 被 WHERE 变成 INNER JOIN
>
> 这是新手最容易踩的隐形坑——你写的是 LEFT JOIN，但加了 WHERE 条件后，结果和 INNER JOIN 一样了！
>
> ```sql
> -- ❌ 你以为是 LEFT JOIN（所有客户都显示），实际变成了 INNER JOIN
> SELECT c.customer_id, c.customer_name, o.order_id
> FROM customers c
> LEFT JOIN orders o ON o.customer_id = c.customer_id
> WHERE o.status = 'PAID';  -- 对右表加条件！
> ```
>
> 🤔   为什么？   LEFT JOIN 后，没下单的客户 o.status 是 NULL。`WHERE NULL = 'PAID'` 不成立，这些行就被过滤掉了——相当于只留下了匹配的行，和 INNER JOIN 一样。
>
> ✅   正确写法  ：把条件放到 ON 里（关联时就过滤，不是关联后过滤）：
>
> ```sql
> SELECT c.customer_id, c.customer_name, o.order_id
> FROM customers c
> LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'PAID';
> ```
>
> 这样没下单的客户还是会显示，只是 order\_id 是 NULL。

> ⚠️   生产事故高发3：JOIN 后行数膨胀
>
> 一对多关系会导致行数变多——1 个客户对应 10 笔订单，JOIN 后客户那行会复制 10 份。
>
> 🤔   经典坑  ：你想统计"所有客户的总人数"，写了 `SELECT COUNT(*) FROM customers LEFT JOIN orders ON ...` ——结果数出来的是订单数，不是客户数！
>
> ✅   正确做法  ：
>
> * 数客户数：`COUNT(DISTINCT customers.customer_id)`
> * 或者：先聚合再 JOIN（先把订单按客户汇总成1行，再和客户表关联）

> 🤔   思考题  ：LEFT JOIN 和 RIGHT JOIN 能不能互相转换？（答案：可以，把表调换位置就行。所以工作中一般只用 LEFT JOIN，不用 RIGHT JOIN——统一风格更好读。）

> 💬   课堂讨论  ：三种 JOIN 中你觉得哪个最常用？什么情况下必须用 FULL JOIN？

***

### 🔄 5.2 自连接

> 💡   一句话理解  ：同一张表跟自己关联，就是"照镜子"。比如查员工和他的上级，需要把员工表当成两张表来用。

💼   工作场景：   同一张表里上下级关系、同一客户不同产品的对比——比如查"买了A产品也买了B产品的客户"

```sql
-- Query: 同一订单里，买手机的数量比买电脑多的订单（关联自己）
SELECT a.*, b.quantity AS computer_qty
FROM order_items a, order_items b
WHERE a.order_id = b.order_id
    AND a.category_id = 13
    AND b.category_id = 12
    AND a.quantity > b.quantity;

-- CTE写法（更清晰）
WITH
    phone AS (SELECT * FROM order_items WHERE category_id = 13),
    computer AS (SELECT * FROM order_items WHERE category_id = 12)
SELECT a.* FROM phone a, computer b
WHERE a.order_id = b.order_id AND a.quantity > b.quantity;
```

### 🔄 5.3 行列互转

> 💡   一句话理解  ：行转列用 PIVOT（横着看），列转行用 UNPIVOT（竖着看）。面试常问实现方式。

💼   工作场景：

* 行转列  ：按月份统计的销售数据（1月|2月|3月... 每列是一个月）——报表展示必须横着看
* 列转行  ：多列指标转成行——ETL 时把宽表转窄表方便下游处理

#### 📊 行转列（PIVOT）

```sql
-- CASE WHEN: Row to Column (pivot by category)
SELECT customer_id,
    MAX(CASE WHEN category_id = 11 THEN quantity END) AS mobile_qty,
    MAX(CASE WHEN category_id = 12 THEN quantity END) AS computer_qty,
    MAX(CASE WHEN category_id = 13 THEN quantity END) AS women_qty,
    MAX(CASE WHEN category_id = 14 THEN quantity END) AS men_qty
FROM order_items
GROUP BY customer_id;

-- PIVOT function (Oracle unique)
SELECT * FROM order_items
PIVOT (MAX(quantity) FOR category_id IN (11 AS mobile, 12 AS computer, 13 AS women, 14 AS men));
```

#### 📋 列转行（UNPIVOT）

先建一张行转列后的"宽表"来演示（建表脚本见附录A）：

```sql
CREATE TABLE category_sales (
    customer_id   NUMBER,
    mobile        NUMBER,   -- 手机购买量
    computer      NUMBER,   -- 电脑购买量
    women         NUMBER,   -- 女装购买量
    men           NUMBER    -- 男装购买量
);
```

```sql
-- UNION ALL方式（各数据库通用）
SELECT customer_id, 'mobile' AS category, mobile AS quantity FROM category_sales
UNION ALL
SELECT customer_id, 'computer' AS category, computer AS quantity FROM category_sales;

-- UNPIVOT function（注意：别名用双引号，不能用单引号）
SELECT customer_id, category, quantity
FROM category_sales
UNPIVOT (quantity FOR category IN (mobile AS "mobile", computer AS "computer", women AS "women", men AS "men"));
```

***

### 📝 5.4 CTE公共表表达式（进阶）

> 💡   一句话理解  ：CTE（Common Table Expression）= 给子查询起个名字，就像给变量命名，代码更清晰。学完多表关联后再看 CTE，就是"把复杂查询拆成有名字的步骤"。

💼   工作场景：   复杂报表拆步骤——先算各大区汇总→再关联明细→最后过滤。CTE 分步写，每一步都能单独跑着测，比嵌套10层子查询好 debug 一百倍。

```sql
-- 基础CTE：先计算各大区平均金额，再关联查询
WITH departments_avg AS (
    SELECT region_id, AVG(total_amount) AS avg_total_amount
    FROM orders GROUP BY region_id
)
SELECT e.customer_name, e.total_amount, d.avg_total_amount
FROM orders e
JOIN departments_avg d ON e.region_id = d.region_id
WHERE e.total_amount > d.avg_total_amount;

-- 多CTE：多个临时结果集
WITH
    departments_sum AS (
        SELECT region_id, SUM(total_amount) AS total FROM orders GROUP BY region_id
    ),
    departments_avg AS (
        SELECT region_id, AVG(total_amount) AS avg FROM orders GROUP BY region_id
    )
SELECT * FROM departments_sum
JOIN departments_avg ON departments_sum.region_id = departments_avg.region_id;
```

> 📌   重点掌握  ：CTE 比嵌套子查询更清晰，面试写复杂 SQL 时用 CTE 来分步写，面试官会觉得你代码组织能力好。

> 🤔   思考题  ：LEFT JOIN的结果行数可能比左表多还是少？为什么？什么情况下会变多？

#### 🌳 5.5 层级查询：CONNECT BY（Oracle 特有，了解即可）

> 💡   一句话理解  ：表里自己关联自己（如员工表里"谁的上级是谁"），CONNECT BY 能把整棵树一层层捋出来。

💼   工作场景  ：组织架构树、商品品类树（家电 → 手机 → 折叠屏）——数据里存的是"父子关系"，要一次性查整条链路。

```sql
-- 示例假设 employees 表有 manager_id 列（品类树用 parent_id 同理）
-- 从根节点（老板，没有上级）往下，捋出整棵组织树
SELECT employee_name, manager_id, LEVEL AS depth
FROM employees
START WITH manager_id IS NULL              -- 树的根：老板没有上级
CONNECT BY PRIOR employee_id = manager_id; -- 往下找：上一行的下属

-- 反过来：从某个员工往上捋出他的汇报链
SELECT employee_name, LEVEL
FROM employees
START WITH employee_name = '李雷'
CONNECT BY employee_id = PRIOR manager_id; -- 往上找：上一行的上级
```

> 📌   必记  ：`PRIOR` 写在等号哪一边决定遍历方向——`PRIOR 儿子 = 父亲` 向下查，`儿子 = PRIOR 父亲` 向上查。`LEVEL` 是伪列，表示当前节点在第几层。
>
> 🔗   三库对照  ：Oracle 用 `CONNECT BY`；MySQL 8.0+ 用 `WITH RECURSIVE`；；；Hive 不支持递归查询；；——数仓里遇到层级树，通常提前用脚本逐层展开成宽表，Hive 只查展开后的结果。大数据岗了解到这个程度即可。

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第五章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 连接类型  → INNER/LEFT/RIGHT/FULL JOIN     │
│ 📌 自连接    → 同一张表关联自己                │
│ 📌 行列转换  → PIVOT/UNPIVOT                 │
│ 📌 CTE       → WITH子句公共表表达式             │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：忘记ON条件→笛卡尔积                    │
│ ⚠️ 易错：LEFT JOIN的WHERE条件会变成INNER JOIN  │
│ ⚠️ 易错：一对多JOIN会导致行数膨胀              │
│ ⚠️ 易错：JOIN后COUNT(*)不是左表的行数          │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. JOIN区别  ：INNER JOIN只返回匹配行，LEFT JOIN左表全保留
2. 笛卡尔积  ：忘记ON条件导致行数相乘，生产事故高发
3. CTE优势  ：比嵌套子查询清晰，可分步调试
4. 行列转换  ：PIVOT行转列，UNPIVOT列转行

#### 🎯 动手练习

> 练习1  ：用INNER JOIN查询订单及其对应的客户信息
>
> 练习2  ：用LEFT JOIN查询所有客户（包括没下过单的）
>
> 练习3  ：用CASE WHEN实现行转列，统计每个客户在不同品类的购买数量
>
> 练习4  ：用CTE重写多层嵌套子查询，使代码更清晰

#### 🤖 AI 加餐：让 AI 造练习数据和检查笛卡尔积

场景1：造数据

——练 JOIN 最缺的是数据，让 DeepSeek 生成：

```text
请生成 Oracle 建表+插入语句：customers(customer_id, customer_name, region_id) 5行、
orders(order_id, customer_id, total_amount, status) 10行。
要求：有下过单的客户、也必须有从没下过单的客户（用来练 LEFT JOIN）；
字段类型合理，customer_id 是主键，orders.customer_id 是外键。
```

场景2：检查关联查询

：

```text
帮我检查这条多表关联SQL有没有问题：重点看 ① 有没有漏写 ON 条件导致笛卡尔积；
② LEFT JOIN 之后在 WHERE 里对右表字段做过滤是否会把 LEFT JOIN 退化成 INNER JOIN。
SQL：<粘贴>
```

⚠️ 验证要点

：「LEFT JOIN 后 WHERE 右表字段 = xxx 会退化成 INNER JOIN」是新人最隐蔽的坑，让 AI 出一道这种题，你自己在 Oracle 里跑出两种结果对比。

#### 🔗 下一章预告

第六章：DDL与DML

* 学完数据类型，你会选择合适的字段类型
* 学完表操作，你会创建、修改、删除表
* 学完约束，你会保证数据质量（主键、外键、唯一、非空、检查）
* 学完DML，你会进行增删改操作
* 学完事务控制，你会理解ACID特性
* 面试高频  ：DELETE vs TRUNCATE、事务ACID、约束类型

***

## 🛠️ 六、 DDL与DML

> 💡   一句话理解  ：DDL是"盖房子"（CREATE/ALTER/DROP），DML是"搬家具"（INSERT/UPDATE/DELETE）。盖好房子才能搬家具。
>
> 🚀   本章要解决的问题  ：前面都在"查"数据，现在要学"建"表和"改"数据。工作中作为大数据开发，建临时表、清洗数据、修改数据是日常操作。

### 📋 6.1 数据类型

> 💡   一句话理解  ：Oracle数据类型就几类——数字NUMBER、字符串VARCHAR2、大文本CLOB、日期DATE、二进制BLOB。

| 类型             | 说明       |
| -------------- | -------- |
| NUMBER(10)     | 整数       |
| NUMBER(10,2)   | 小数       |
| VARCHAR2(4000) | 可变字符串    |
| CHAR(10)       | 固定长度     |
| CLOB           | 大文本（4GB） |
| DATE           | 日期时间     |
| TIMESTAMP      | 时间戳      |
| BLOB           | 二进制（4GB） |

***

### 🏗️ 6.2 表操作

> 💡   一句话理解  ：DDL三板斧——CREATE建表、ALTER改结构、DROP删表。

💼   工作场景：

* CREATE  ：跑批前建临时表——先建表再往里灌数据
* ALTER ADD  ：发现表缺了一列，加一下（生产环境要走审批）
* DROP  ：清测试数据（别在生产库上干这事）

```sql
-- 创建表（本章统一用员工演示表 emp_demo 练习 DDL/DML）
CREATE TABLE emp_demo (
    employee_no   NUMBER(5),
    employee_name VARCHAR2(30),
    job_title     VARCHAR2(30),
    birthday      DATE,
    tel           VARCHAR2(11)
);

-- 修改表结构
ALTER TABLE emp_demo ADD entry_date DATE;                       -- 添加列
ALTER TABLE emp_demo MODIFY employee_name VARCHAR2(40);         -- 修改列
ALTER TABLE emp_demo DROP COLUMN tel;                           -- 删除列
ALTER TABLE emp_demo RENAME COLUMN job_title TO position_name;  -- 重命名（演示用英文名）

-- 删除表
DROP TABLE emp_demo;
```

> ⚠️   易错点  ：中文列名必须加双引号 `RENAME COLUMN job_title TO "岗位"`，不加双引号直接报错 ORA-00904。实际生产中推荐列名全用英文，避免编码坑。手机号用 `VARCHAR2(11)` 而不是 NUMBER——号码可能以 0 开头、不参与运算，字符串才是对的选择。

### 🔒 6.3 约束

> 💡   一句话理解  ：约束就是"规矩"——PRIMARY KEY唯一标识（像身份证号）、FOREIGN KEY关联其他表（像户口本上的家庭关系）、NOT NULL不能为空（像注册时的必填项）、CHECK检查取值范围（像年龄不能为负数）。
>
> 📌   必记  ：约束是数据质量的"守门员"。面试常问五种约束：PRIMARY KEY、FOREIGN KEY、UNIQUE、NOT NULL、CHECK。

```sql
-- 创建带约束的表（先 DROP TABLE emp_demo 清掉 6.2 的练习表）
CREATE TABLE emp_demo (
    employee_no   NUMBER(5) PRIMARY KEY,                     -- 主键
    employee_name VARCHAR2(30) NOT NULL,                     -- 非空
    job_title     VARCHAR2(30) NOT NULL,
    sex           VARCHAR2(1) CHECK(sex IN ('0','1','2')),   -- 检查约束
    tel           VARCHAR2(11) UNIQUE,                       -- 唯一
    region_id     NUMBER(3),
    CONSTRAINT fk_emp_region FOREIGN KEY (region_id) REFERENCES departments(region_id)  -- 外键
);

-- 约束操作（语法演示；表已有主键时再 ADD 同名约束会报 ORA-02260，两种方式二选一）
ALTER TABLE emp_demo ADD CONSTRAINT pk_emp_demo PRIMARY KEY (employee_no);
ALTER TABLE emp_demo DROP CONSTRAINT pk_emp_demo;
ALTER TABLE emp_demo DISABLE CONSTRAINT pk_emp_demo;   -- 禁用
ALTER TABLE emp_demo ENABLE CONSTRAINT pk_emp_demo;    -- 启用
```

### ✏️ 6.4 DML操作

> 💡   一句话理解  ：INSERT=进货，UPDATE=改价，DELETE=清仓，TRUNCATE=清场（快但不回头）。

💼   工作场景：

* INSERT  ：把清洗好的数据写入目标表
* UPDATE  ：批量更新状态——比如把今天已处理的订单标记为"DONE"
* DELETE  ：删掉某批错误数据重新跑
* TRUNCATE  ：清空临时表——比 DELETE 快一万倍，但不可回滚

```sql
-- INSERT插入（值必须与列一一对应，emp_demo 共6列）
INSERT INTO emp_demo VALUES (1, '王小明', '运营专员', '1', '13812345678', 10);
INSERT INTO emp_demo (employee_no, employee_name, job_title) VALUES (2, '李小红', '客服');

-- UPDATE更新
UPDATE emp_demo SET sex = '2', birthday = DATE'2011-1-1' WHERE employee_no = 1;
UPDATE emp_demo SET sex = '2';  -- 整表更新（危险！没有WHERE会改全表）

-- DELETE删除
DELETE FROM emp_demo WHERE employee_no = 12;
DELETE FROM emp_demo;  -- 删除整表数据

-- TRUNCATE清空（DDL，快且不能回滚）
TRUNCATE TABLE emp_demo;

-- DELETE vs TRUNCATE
-- DELETE：慢、支持条件、可回滚、DML
-- TRUNCATE：快、不能条件、不能回滚、DDL
```

> 🔥   面试高频  ：DELETE vs TRUNCATE 的区别是面试必考题。一句话总结——DELETE 是"标记删除"（逐行删、可回滚），TRUNCATE 是"物理删除"（清整表、不可回滚、快）。

### 🔄 6.5 事务控制（🔥面试高频）

> 💡   一句话理解  ：事务 = "要么全做，要么全不做"的打包操作。就像支付宝转账——扣你钱+加他钱，两条SQL要么都成功，要么都回滚，不能出现"钱扣了但对方没收到"。
>
> 🔥   面试高频  ：事务的 ACID 四大特性是数据库面试必考题——
>
> * A（原子性）  ：事务里的操作要么全成功，要么全回滚，不可分割
> * C（一致性）  ：事务前后数据状态保持一致（转账前后总金额不变）
> * I（隔离性）  ：多个事务并发执行时相互隔离，互不干扰
> * D（持久性）  ：事务一旦提交，数据永久保存

> 💬   课堂讨论  ：电商退款业务中，如果"扣减商家余额"成功但"退款到客户账户"失败，没有事务会怎样？ACID的哪个特性解决了这个问题？

```sql
-- TCL事务控制
COMMIT;    -- 提交
ROLLBACK;  -- 回滚

-- 事务示例
INSERT INTO orders VALUES (1, 'test');
COMMIT;    -- 提交后不能回滚
DELETE FROM orders;
ROLLBACK; -- 可以回滚
TRUNCATE TABLE orders;
    ROLLBACK;  -- 无法回滚
```

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第六章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 数据类型  → NUMBER/VARCHAR2/DATE/CLOB/BLOB │
│ 📌 表操作    → CREATE/ALTER/DROP              │
│ 📌 约束      → PRIMARY KEY/FOREIGN KEY/UNIQUE │
│ 📌 DML操作   → INSERT/UPDATE/DELETE/TRUNCATE  │
│ 📌 事务控制  → COMMIT/ROLLBACK                │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：TRUNCATE是DDL，不能回滚               │
│ ⚠️ 易错：DELETE是DML，可以回滚                 │
│ ⚠️ 易错：外键约束要关联字段类型一致             │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. DELETE vs TRUNCATE  ：DELETE是DML（慢、可回滚），TRUNCATE是DDL（快、不可回滚）
2. 事务ACID  ：原子性、一致性、隔离性、持久性
3. 约束类型  ：PRIMARY KEY、FOREIGN KEY、UNIQUE、NOT NULL、CHECK
4. 数据类型  ：NUMBER整数/小数，VARCHAR2可变字符串，DATE日期时间

#### 🎯 动手练习

> 练习1  ：创建订单表，包含主键、非空、检查约束
>
> 练习2  ：用INSERT插入数据，用UPDATE更新状态，用DELETE删除数据
>
> 练习3  ：对比DELETE和TRUNCATE的性能差异
>
> 练习4  ：写一个事务，包含多条INSERT，测试COMMIT和ROLLBACK

#### 🤖 AI 加餐：让 AI 审查你的建表语句

建表是"AI 审查"价值最大的场景——约束、类型、命名都是 AI 擅长挑毛病的：

```text
这是我写的 Oracle 建表语句（电商客户表）：
<粘贴你的 CREATE TABLE>

请从 4 个角度审查：① 字段类型选得对不对（金额/手机号/时间）；
② 该加哪些约束（主键/非空/检查/唯一）；③ 命名是否规范统一；
④ 有没有为后续大数据量考虑（比如要不要预留分区字段）。
只给审查意见和修改后的版本，并解释每处改动的原因。
```

⚠️ 验证要点

：把 AI 改好的建表语句贴进 Oracle 真跑一遍，再故意插入一条违反约束的数据（比如手机号重复），看约束是不是真的拦住了。

#### 🔗 下一章预告

第七章：PL/SQL编程

* 学完基础结构，你会写DECLARE-BEGIN-EXCEPTION-END块
* 学完游标，你会逐行处理数据
* 学完存储过程，你会封装业务逻辑
* 学完函数，你会返回计算结果
* 面试高频  ：%TYPE vs %ROWTYPE、存储过程vs函数、游标类型

***

## 📦 七、 PL/SQL编程

> 🎯   本章定位（选学指引）  ：互联网大数据开发岗对 PL/SQL 的要求是"""看得懂、会改"""（公司老系统的存储过程）；"从零会写"是政企/银行数仓岗的要求。互联网方向学员重点掌握 7.1 基础结构和 7.2 游标，7.3/7.4/7.5 了解即可；投政企岗的学员全部吃透。
>
> 💡   一句话理解  ：SQL是"说明书"（一行一行查），PL/SQL是"程序"（有变量、有逻辑判断、有循环）。SQL只能查数据，PL/SQL能干"活"——判断、循环、异常处理全都有。
>
> 🚀   本章要解决的问题  ：纯SQL做不了复杂逻辑——不能写if-else、不能循环、不能处理异常。PL/SQL就是给SQL加上了"编程能力"。面试大数据开发岗，PL/SQL是加分项。

### 📝 7.1 基础结构

💼   工作场景：   电商存储过程的开头模板——声明变量、写逻辑、处理异常，所有存储过程都是这个结构。

```sql
DECLARE
    v_name VARCHAR2(50) := 'World';
    v_count NUMBER := 0;
    v_total_amount orders.total_amount%TYPE;
    v_row orders%ROWTYPE;
BEGIN
    DBMS_OUTPUT.PUT_LINE('Hello ' || v_name);
    v_count := 10;

    SELECT customer_name INTO v_name FROM orders WHERE order_id = 1001;

    IF v_count > 5 THEN
        DBMS_OUTPUT.PUT_LINE('大于5');
    ELSE
        DBMS_OUTPUT.PUT_LINE('小于等于5');
    END IF;

    FOR i IN 1..10 LOOP
        DBMS_OUTPUT.PUT_LINE(i);
    END LOOP;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('未找到数据');
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('错误: ' || SQLERRM);
END;
/
```

> 💡   记忆口诀  ：DECLARE声明、BEGIN执行、EXCEPTION异常处理
>
> 🔥   面试高频  ：%TYPE 和 %ROWTYPE 的区别？%TYPE 引用某个列的类型，%ROWTYPE 引用整行的类型（类似结构体）。面试偶尔会问。

***

### 🔍 7.2 游标

> 💡   一句话理解  ：游标就是"指针"，指向查询结果，逐行移动。FOR循环是自动挡（省心），显式游标是手动挡（灵活）。

💼   工作场景：   电商结算跑批——遍历当日所有订单，逐笔按会员等级计算积分。不能一条 UPDATE 搞定（因为每笔规则不一样），必须逐行处理。

> 游标（CURSOR）  ：指向查询结果集的指针，逐行处理数据

#### 🔁 隐式游标（FOR循环）

```sql
DECLARE
    CURSOR c_orders IS SELECT * FROM orders;
BEGIN
    FOR i IN c_orders LOOP
        IF i.total_amount >= 3000 THEN
            DBMS_OUTPUT.PUT_LINE(i.customer_name || ' 高收入');
        ELSIF i.total_amount >= 2000 THEN
            DBMS_OUTPUT.PUT_LINE(i.customer_name || ' 中等收入');
        ELSE
            DBMS_OUTPUT.PUT_LINE(i.customer_name || ' 低收入');
        END IF;
    END LOOP;
END;
/
```

> 🤔   思考题  ：隐式游标（FOR循环）和显式游标（OPEN/FETCH/CLOSE）的区别是什么？什么时候必须用显式游标？（答案：FOR循环自动管理，简单省事；需要手动控制获取行数、批量处理时用显式游标）

#### ⚙️ 显式游标（手动控制）

```sql
DECLARE
    CURSOR c_orders IS SELECT * FROM orders;
    i orders%ROWTYPE;
BEGIN
    OPEN c_orders;
    LOOP
        FETCH c_orders INTO i;
        EXIT WHEN c_orders%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(i.customer_name || ' ' || i.total_amount);
    END LOOP;
    CLOSE c_orders;
END;
/
```

#### 🔗 嵌套游标

```sql
DECLARE
    CURSOR c_orders IS SELECT * FROM orders;
    CURSOR c_commission IS SELECT * FROM commission_levels;
BEGIN
    FOR i IN c_orders LOOP
        FOR j IN c_commission LOOP
            IF i.total_amount >= j.min_amount AND i.total_amount <= j.max_amount THEN
                DBMS_OUTPUT.PUT_LINE(i.customer_name || '|' || i.total_amount || '|' || j.level_id);
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END;
/
```

***

### 📦 7.3 存储过程

> 💡   一句话理解  ：存储过程 = "预编译的SQL程序"——写一次，无数次调用，支持参数传入。

```sql
-- 创建存储过程：修改订单金额（按区域仓发货限额校验）
CREATE OR REPLACE PROCEDURE sp_update_order_amount(
    p_order_id      orders.order_id%TYPE,      -- IN参数
    p_total_amount  orders.total_amount%TYPE
) AUTHID CURRENT_USER IS
    v_count   NUMBER(3);
    v_location departments.location%TYPE;
BEGIN
    SELECT COUNT(1) INTO v_count FROM orders WHERE order_id = p_order_id;

    IF v_count = 1 THEN
        SELECT location INTO v_location
        FROM orders e JOIN departments d ON e.region_id = d.region_id
        WHERE order_id = p_order_id;

        IF v_location = '北京' AND p_total_amount > 5000 THEN
            DBMS_OUTPUT.PUT_LINE('北京仓订单金额不能超过5000');
        ELSIF v_location = '上海' AND p_total_amount > 4000 THEN
            DBMS_OUTPUT.PUT_LINE('上海仓订单金额不能超过4000');
        ELSIF v_location = '广州' AND p_total_amount > 6000 THEN
            DBMS_OUTPUT.PUT_LINE('广州仓订单金额不能超过6000');
        ELSE
            UPDATE orders SET total_amount = p_total_amount WHERE order_id = p_order_id;
            COMMIT;
            DBMS_OUTPUT.PUT_LINE('修改成功');
        END IF;
    ELSE
        DBMS_OUTPUT.PUT_LINE('查无此单');
    END IF;
END;
/

-- 调用（订单1003发往上海仓，金额4500超限，会被拦下）
BEGIN
    sp_update_order_amount(1003, 4500);
END;
/

-- 参数类型
-- IN：传入值（默认）
-- OUT：返回值
-- IN OUT：传入并返回值
```

> 💬   课堂讨论  ：存储过程和函数的本质区别是什么？如果一个业务逻辑不需要返回值，但需要做复杂的增删改操作，应该用存储过程还是函数？为什么？

### ⚡ 7.4 函数

> 💡   一句话理解  ：存储过程=执行动作（增删改），函数=返回值（计算）。函数可以放在SQL里调用，存储过程不行。
>
> 🔥   面试高频  ：函数和存储过程的区别——
>
> * 函数必须有 RETURN（返回值），存储过程通过 OUT 参数返回
> * 函数可以在 SELECT 中直接调用，存储过程必须用 CALL 或 BEGIN...END
> * 函数一般用于计算和转换，存储过程用于业务逻辑

```sql
-- 创建函数
CREATE OR REPLACE FUNCTION f_get_departments_name(p_region_id NUMBER)
RETURN VARCHAR2 IS
    v_name VARCHAR2(50);
BEGIN
    SELECT region_name INTO v_name FROM departments WHERE region_id = p_region_id;
    RETURN v_name;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN '不存在';
END;
/

-- 调用
SELECT f_get_departments_name(10) FROM DUAL;
SELECT order_id, customer_name, f_get_departments_name(region_id) FROM orders;
```

***

### 💼 7.5 电商每日结算跑批实战

> 场景：   电商每日结算跑批——遍历当日已支付订单，按订单金额 1% 给客户发放积分，更新客户积分余额，并记录处理日志。纯 SQL 做不到这种"逐行判断+更新+记录"，必须用存储过程。

```sql
-- 创建客户积分余额表
CREATE TABLE customer_points (
    customer_id NUMBER,
    points      NUMBER(12,2),
    update_time DATE
);

-- 创建日志表（记录每笔处理结果）
CREATE TABLE batch_run_log (
    task_name    VARCHAR2(100),
    customer_id  NUMBER,
    deal_date    DATE,
    status       VARCHAR2(10),   -- SUCCESS / FAIL
    error_msg    VARCHAR2(500)
);

-- 每日积分结算存储过程
CREATE OR REPLACE PROCEDURE sp_daily_points_settle(
    p_biz_date DATE              -- 业务日期：跑哪天的数据
) IS
    v_count NUMBER := 0;
BEGIN
    -- 遍历当日所有已支付的客户（同一天多笔订单先合并）
    FOR rec IN (
        SELECT customer_id, SUM(total_amount) AS total_amount
        FROM orders
        WHERE TRUNC(order_date) = TRUNC(p_biz_date)
          AND status = 'PAID'
        GROUP BY customer_id
    ) LOOP
        BEGIN
            -- 内部块：每个客户单独处理，出错只跳过当前客户，不影响整体
            UPDATE customer_points
            SET points = points + rec.total_amount * 0.01,   -- 积分 = 订单金额 × 1%
                update_time = SYSDATE
            WHERE customer_id = rec.customer_id;

            INSERT INTO batch_run_log(task_name, customer_id, deal_date, status)
            VALUES ('sp_daily_points_settle', rec.customer_id, p_biz_date, 'SUCCESS');

            v_count := v_count + 1;

            -- 每处理1000笔提交一次，避免事务太大
            IF MOD(v_count, 1000) = 0 THEN
                COMMIT;
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                -- 出错记录日志，不中断整体跑数
                INSERT INTO batch_run_log(task_name, customer_id, deal_date, status, error_msg)
                VALUES ('sp_daily_points_settle', rec.customer_id, p_biz_date, 'FAIL', SQLERRM);
        END;
    END LOOP;

    COMMIT;  -- 提交剩余未提交的
    DBMS_OUTPUT.PUT_LINE('每日结算完成，共处理 ' || v_count || ' 个客户');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        DBMS_OUTPUT.PUT_LINE('跑数异常：' || SQLERRM);
END;
/

-- 调用
BEGIN
    sp_daily_points_settle(DATE '2026-05-10');
END;
/
```

> 📌   要点总结：
>
> * 外层游标遍历，内层 `BEGIN...EXCEPTION...END` 逐客户处理——一个客户失败不影响整体
> * 每 1000 笔 `COMMIT` 一次，防止事务过大回滚段爆了
> * 出错不中断，日志记录失败原因，跑完统一查 `batch_run_log` 看哪些客户挂了
> * 这是电商批量跑数的标准模式：：：逐行处理 + 内部异常捕获 + 分批提交 + 落日志：：

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第七章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 基础结构  → DECLARE-BEGIN-EXCEPTION-END    │
│ 📌 游标      → 隐式(FOR循环)/显式(OPEN/FETCH) │
│ 📌 存储过程  → PROCEDURE（IN/OUT/IN OUT）    │
│ 📌 函数      → FUNCTION（必须有RETURN）        │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：%TYPE引用列类型，%ROWTYPE引用整行      │
│ ⚠️ 易错：FOR循环自动管理，显式游标手动控制        │
│ ⚠️ 易错：函数可以在SQL中调用，存储过程不行        │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. %TYPE vs %ROWTYPE  ：%TYPE引用列类型，%ROWTYPE引用整行类型
2. 存储过程vs函数  ：函数必须有RETURN，可在SQL中调用；存储过程通过OUT参数返回
3. 游标类型  ：隐式游标（FOR循环）自动管理，显式游标（OPEN/FETCH/CLOSE）手动控制
4. 批量跑数模式  ：逐行处理+内部异常捕获+分批提交+落日志

#### 🎯 动手练习

> 练习1  ：写一个PL/SQL块，声明变量、输出信息、处理异常
>
> 练习2  ：用FOR循环游标遍历订单表，按金额分类输出
>
> 练习3  ：创建存储过程，根据订单号更新订单金额
>
> 练习4  ：创建函数，根据大区ID返回大区名称

#### 🤖 AI 加餐：让 AI 逐行"人肉执行"存储过程

存储过程是零基础最怕的内容——一屏代码几十行。让 DeepSeek 当"单步调试器"：

```text
下面是一段 Oracle PL/SQL 存储过程（电商每日积分结算）：
<粘贴代码>

请：1. 用一张流程图式的文字描述执行流程；2. 挑一个客户举例，一步步演示变量值的变化；
3. 指出 3 个初学者最容易看错的细节（比如 %TYPE 是什么、为什么内部块要单独 EXCEPTION、
为什么每1000笔COMMIT一次）。
```

⚠️ 验证要点

：让 AI 改造这段代码出一个"变式题"（比如把积分比例改成按会员等级区分），你先自己写，再让 AI 批改。看懂 ≠ 会写，必须动手。

#### 🔗（下一章预告）

第八章：异常处理

* 学完异常处理，你会捕获NO\_DATA\_FOUND、TOO\_MANY\_ROWS等异常
* 学完日志记录，你会创建日志表记录错误信息
* 面试高频  ：预定义异常、自定义异常、异常处理顺序

***

## 🚨 八、异常处理

> 💡   一句话理解  ：Oracle用 EXCEPTION 捕获异常。NO\_DATA\_FOUND（没查到）、TOO\_MANY\_ROWS（查到多行）是常见的，OTHERS 兜底。就像写 Java/Python 的 try-catch，PL/SQL 也有异常处理机制。
>
> 🚀   本章要解决的问题  ：程序总会出错——查不到数据、查到太多数据、类型不匹配。没有异常处理的程序就像没有安全气囊的车，一出错就"崩溃"。

### ❌ 8.1 异常处理

```sql
BEGIN
    DBMS_OUTPUT.PUT_LINE('开始');
    -- SELECT 1 + 'a' FROM DUAL;  -- 这里会出错
    DBMS_OUTPUT.PUT_LINE('结束');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('错误代码: ' || SQLCODE);
        DBMS_OUTPUT.PUT_LINE('错误信息: ' || SQLERRM);
END;
/

-- 常用预定义异常
-- NO_DATA_FOUND：未找到数据
-- TOO_MANY_ROWS：返回多行
-- OTHERS：其他异常
```

> 🤔   思考题  ：如果在 PL/SQL 中 `SELECT INTO` 查不到数据，会触发什么异常？查到了多行又会触发什么？捕获异常时，OTHERS 应该放在最前面还是最后面？（答案：OTHERS 放最后——它捕获所有异常，其他分支永远不会执行到）

### 📝 8.2 日志记录

> 💡   一句话理解  ：创建日志表，记录开始/结束/错误信息，有据可查。

💼   工作场景：   电商跑批必须有日志——哪一天跑的、跑了多久、哪些订单结算成功、哪些失败。没有日志，出事了找不到原因。

```sql
-- 创建日志表
CREATE TABLE record_sp_log (
    taskname VARCHAR2(100),
    sp_name VARCHAR2(100),
    error_d1 DATE,
    error_type VARCHAR2(100),
    error_msg VARCHAR2(300)
);

-- 记录日志的过程
CREATE OR REPLACE PROCEDURE sp_insert_record(
    p_taskname IN VARCHAR2,
    p_sp_name IN VARCHAR2,
    p_error_type IN VARCHAR2,
    p_error_msg IN VARCHAR2
) IS
BEGIN
    INSERT INTO record_sp_log VALUES (p_taskname, p_sp_name, SYSDATE, p_error_type, p_error_msg);
    COMMIT;
END;
/

-- 异常记录示例
CREATE OR REPLACE PROCEDURE sp_test_exception IS
    v_customer_name VARCHAR2(50);
    v_taskname VARCHAR2(100) := '演示异常记录';
    v_sp_name VARCHAR2(100) := 'sp_test_exception';
BEGIN
    SELECT customer_name INTO v_customer_name FROM orders WHERE region_id = 20;
    SELECT 1 + 'a' INTO v_customer_name FROM DUAL;
EXCEPTION
    WHEN OTHERS THEN
        sp_insert_record(v_taskname, v_sp_name, 'ERROR', SQLERRM);
END;
/
```

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第八章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 异常处理  → EXCEPTION WHEN ... THEN         │
│ 📌 预定义异常→ NO_DATA_FOUND/TOO_MANY_ROWS    │
│ 📌 兜底异常  → OTHERS                          │
│ 📌 日志记录  → 创建日志表+INSERT记录            │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：OTHERS必须放在最后                    │
│ ⚠️ 易错：SQLCODE返回错误代码，SQLERRM返回错误信息 │
│ ⚠️ 易错：SELECT INTO查不到数据触发NO_DATA_FOUND │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 常见异常  ：NO\_DATA\_FOUND（未找到数据）、TOO\_MANY\_ROWS（返回多行）、OTHERS（其他异常）
2. 异常处理顺序  ：具体异常在前，OTHERS兜底在后
3. 异常信息  ：SQLCODE返回错误代码，SQLERRM返回错误信息
4. 日志重要性  ：电商跑批必须有日志，记录开始/结束/错误信息

#### 🎯 动手练习

> 练习1  ：写一个PL/SQL块，捕获NO\_DATA\_FOUND异常
>
> 练习2  ：创建日志表，记录存储过程的执行情况
>
> 练习3  ：写一个存储过程，用异常处理捕获所有错误并记录日志
>
> 练习4  ：测试SELECT INTO语句，分别触发NO\_DATA\_FOUND和TOO\_MANY\_ROWS异常

#### 🤖 AI 加餐：让 AI 当"异常出题人"

```text
我在学 Oracle PL/SQL 异常处理。请出 3 道情景题，每题给一段有异常隐患的存储过程片段，
让我判断：会触发什么异常、异常发生在哪一行、该怎么修。
出完题先不给答案，我答完你批改。
```

⚠️ 验证要点

：AI 出的代码片段别只看——贴进 Oracle 真跑，先制造异常（比如插一条会撞主键的数据），亲眼看到 ORA- 报错被 EXCEPTION 接住，才算学会。

#### 🔗 下一章预告

第九章：数据库对象

* 学完序列，你会自动生成订单号、流水号
* 学完视图，你会简化复杂查询
* 学完物化视图，你会加速大表查询
* 学完MERGE，你会实现"有则改之无则加勉"
* 面试高频  ：序列、视图vs物化视图、MERGE

***

## 🗄️ 九、数据库对象

> 💡   一句话理解  ：序列=自动发号机（每次拿一个新号码），视图=快捷方式（不存数据，查视图=执行SQL），物化视图=快照（存真实数据，查得快但占空间）。
>
> 🚀   本章要解决的问题  ：除了表和查询，Oracle还有很多"辅助工具"——自动生成编号用序列，简化复杂查询用视图，加速大表查询用物化视图，合并数据用MERGE。这些是面试中的高频考点。

### 🔢 9.1 序列（🔥面试高频）

> 💡   一句话理解  ：序列就是"自动发号机"，每次 NEXTVAL 出一个新号，递增不重复。

💼   工作场景：   订单号/流水号/账户号——不能重复、必须递增。Oracle 没有 MySQL 的 AUTO\_INCREMENT，用序列实现。

```sql
-- 创建序列
CREATE SEQUENCE my_seq
    START WITH 2
    INCREMENT BY 2
    NOMAXVALUE
    CACHE 10;  -- 预生成10个

-- 使用序列
SELECT my_seq.NEXTVAL FROM DUAL;  -- 下一个值
SELECT my_seq.CURRVAL FROM DUAL;  -- 当前值

-- 插入数据
INSERT INTO orders(order_id, customer_name) VALUES (my_seq.NEXTVAL, 'test');
```

### 👁️ 9.2 视图（🔥面试高频）

> 💡   一句话理解  ：视图不存数据，只存SQL。查视图=执行SQL，就像Windows桌面上的"快捷方式"——双击快捷方式打开程序，但快捷方式本身不占多少空间。

💼   工作场景：   把常用的复杂关联查询做成视图——比如"订单明细宽表"，每次查直接 `SELECT * FROM v_order_detail` 不用每次写5个 JOIN。

```sql
-- 创建视图
CREATE OR REPLACE VIEW view_orders AS
SELECT
    RPAD(SUBSTR(customer_name, 1, 3), LENGTH(customer_name), '*') AS customer_name,
    e.order_date, e.total_amount, e.discount_amount, d.region_name, d.location
FROM orders e JOIN departments d ON e.region_id = d.region_id
WITH READ ONLY;  -- 只读

-- 使用视图
SELECT * FROM view_orders;
```

> 💬   课堂讨论  ：视图和物化视图的核心区别是什么？如果有一张亿万级别的订单表，需要频繁统计每日销售额，应该用视图还是物化视图？为什么？

### 📊 9.3 物化视图

> 💡   一句话理解  ：物化视图真实存储查询结果 = "快照"。查得快但占空间，可定时刷新。

> 物化视图  ：真实存储查询结果，提高查询性能

```sql
-- 创建物化视图
CREATE MATERIALIZED VIEW mv_departments_total_amount
    BUILD IMMEDIATE      -- 立即创建
    REFRESH COMPLETE     -- 全量刷新
    START WITH SYSDATE   -- 立即开始
    NEXT SYSDATE + 1/24  -- 每小时刷新
AS
SELECT d.region_id, d.region_name, COUNT(e.order_id) AS cnt, AVG(e.total_amount) AS avg_total_amount
FROM departments d LEFT JOIN orders e ON d.region_id = e.region_id
GROUP BY d.region_id, d.region_name;

-- 手动刷新
BEGIN
    DBMS_MVIEW.REFRESH('mv_departments_total_amount');
END;
/
```

### 🔀 9.4 MERGE合并

> 💡   一句话理解  ：MERGE = "有则改之无则加勉"——数据存在就UPDATE，不存在就INSERT。

> MERGE  ：匹配更新，不匹配插入

> 🔥   面试高频  ：MERGE 是面试手写SQL的高频题。场景：每日增量数据同步——有新数据就更新，没有就插入。一行MERGE搞定，不用写IF-ELSE。

```sql
MERGE INTO 目标表 a
USING 源表 b
ON (a.id = b.id)
WHEN MATCHED THEN
    UPDATE SET a.name = b.name, a.age = b.age
WHEN NOT MATCHED THEN
    INSERT (a.id, a.name, a.age) VALUES (b.id, b.name, b.age);
```

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第九章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 序列      → NEXTVAL/CURRVAL自动发号          │
│ 📌 视图      → 不存数据，只存SQL                 │
│ 📌 物化视图  → 存真实数据，可定时刷新             │
│ 📌 MERGE     → 有则更新，无则插入               │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：视图不存数据，查询视图=执行SQL           │
│ ⚠️ 易错：物化视图占空间，需要刷新               │
│ ⚠️ 易错：MERGE要匹配ON条件                     │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 序列  ：NEXTVAL获取下一个值，CURRVAL获取当前值
2. 视图vs物化视图  ：视图不存数据，物化视图存真实数据
3. MERGE  ：匹配更新，不匹配插入，适合增量数据同步
4. 物化视图刷新  ：BUILD IMMEDIATE立即创建，REFRESH COMPLETE全量刷新

#### 🎯 动手练习

> 练习1  ：创建序列，用NEXTVAL生成订单号
>
> 练习2  ：创建视图，简化订单和客户的关联查询
>
> 练习3  ：创建物化视图，统计各大区的订单数量和平均金额
>
> 练习4  ：用MERGE实现增量数据同步（源表→目标表）

#### 🤖 AI 加餐：让 AI 做"技术选型辩论赛"

```text
我是零基础大数据学员。请扮演两个DBA辩论：
电商订单表5亿行，需要频繁统计"每日销售额"，用普通视图还是物化视图？
正方A支持视图，反方B支持物化视图，各给3条理由，最后用零基础能懂的话给结论。
```

⚠️ 验证要点

：把 AI 的结论拿到课堂讨论上讲——能用自己的话给别人讲明白，才算真的懂。也可以反过来：你先说结论，再让 AI 挑你论述里的漏洞。

***

## 🚀 十、索引与优化（🔥面试高频）

> 💡   一句话理解  ：索引 = 书的目录。不加索引 = 逐行翻书（全表扫描 = TABLE ACCESS FULL，慢！），加了索引 = 查目录翻页（快！）。但索引不是越多越好——就像书的目录太多反而找不到内容，每个索引都有维护成本。
>
> 🚀   本章要解决的问题  ：SQL写好了，但跑得慢怎么办？索引是性能优化的第一把钥匙。面试大数据开发岗，索引失效6种场景是必考题，执行计划和HINT是大厂加试题。

### 📇 10.1 索引类型

💼   工作场景：   SQL 跑得慢了，DBA 让你建索引——你得知道 B树索引是默认的（够用），复合索引按顺序（最左前缀），位图索引给低基数列（性别/状态）。

#### 🌲 B 树索引原理（为什么加了索引就变快？）

> 💡   一句话理解  ：索引 = 书的目录。不看目录找内容 = 从第一页翻到最后一页（全表扫描）；看目录找内容 = 直接翻到对应页码（索引查找）。

B 树（Balance Tree，平衡多路查找树）

&#x20;是 Oracle 默认索引的底层结构，特点是是是树总是平衡的是是——不管查哪个值，经过的层数都一样。

```
        [ 100 ]                 ← 根节点（第一层）
       /       \
   [ 50 ]      [ 200 ]          ← 分支节点（第二层）
   /    \      /     \
[10]-[40] [60]-[90] [150]-[199] [250]-[300]   ← 叶子节点（第三层，存真实ROWID）
```

找一个值要几步？

比如找 `id = 65`：

1. 根节点 100 → 65 < 100，走左分支
2. 分支节点 50 → 65 > 50，走右分支
3. 叶子节点 \[60]-\[90] → 找到 65，拿到 ROWID → 回表取整行数据

> 📌   关键认识  ：
>
> 1. B 树查询速度 = 树的高度  （一般 2~~4 层，几百万数据也只要 2~~3 次 IO）
> 2. 全表扫描要读几百万行，索引查找只要读几行——差几百倍
> 3. 索引不是越多越好  ：每次 INSERT/UPDATE/DELETE 都要维护索引，索引多了写操作变慢
> 4. 索引占空间  ：索引也是要存在磁盘上的，一张表建 10 个索引，索引占用空间可能比表本身还大

> 🔥   面试题  ：为什么索引能加速查询？——"索引是 B 树结构，查询复杂度从 O(n) 降到 O(log n)，全表扫几百万行，索引查找只要几行。"

#### 🔗 复合索引与最左前缀原则

复合索引

= 建在多个列上的索引，比如 `(region_id, total_amount)`。

```sql
CREATE INDEX idx_orders_region_amount ON orders(region_id, total_amount);
```

> 🔥   面试必问  ：什么是最左前缀原则？——复合索引中，只有查询条件包含了了了最左边的列了了，索引才会生效。就像查字典——你知道第一个字才能按偏旁部首找，只知道第二个字没法查。

| 查询条件                                           | 索引是否生效 | 原因                 |
| :--------------------------------------------- | :----- | :----------------- |
| `WHERE region_id = 10`                         | ✅ 生效   | 用到了最左列 region\_id  |
| `WHERE region_id = 10 AND total_amount > 1000` | ✅ 生效   | 两列都用到了，最理想         |
| `WHERE total_amount > 1000`                    | ❌ 失效   | 没用到最左列 region\_id  |
| `WHERE total_amount > 1000 AND region_id = 10` | ✅ 生效   | 优化器会自动调整顺序，不用担心写反了 |

> 📌   建索引的经验法则  ：
>
> * 把把把等值查询把把的列放在最左边（如 `status = 'PAID'`）
> * 把把把范围查询把把的列放在右边（如 `total_amount > 1000`）
> * 基数高（值多）的列放前面，能更快过滤数据

```sql
-- B树索引（默认）
CREATE INDEX idx_orders_region_id ON orders(region_id);

-- 唯一索引
CREATE UNIQUE INDEX idx_orders_customer_name ON orders(customer_name);

-- 复合索引（注意列顺序：等值列在前，范围列在后）
CREATE INDEX idx_orders_region_amount ON orders(region_id, total_amount);

-- 位图索引（低基数列：取值只有少数几种，如订单状态）
CREATE BITMAP INDEX idx_orders_status ON orders(status);

-- 函数索引
CREATE INDEX idx_orders_upper ON orders(UPPER(customer_name));
CREATE INDEX idx_orders_substr ON orders(SUBSTR(customer_name, 1, 1));
```

> 🤔   思考题  ：给 `status` 列（只有 PAID/SHIPPED/CANCELLED 三种值）建索引，应该用 B树索引还是位图索引？为什么？Oracle中位图索引适用于什么场景？
>
> 🤔   思考题2  ：复合索引 `(a, b, c)`，查询条件 `WHERE b = 2 AND c = 3`，索引会生效吗？为什么？

### ⚠️ 10.2 索引失效场景（🔥面试高频）

> 💡   一句话理解  ：索引很"娇气"——参与运算、隐式转换、左模糊、函数处理……一不小心就失效了。这 6 种场景覆盖了 90% 的慢 SQL 原因。

💼   工作场景：   SQL 写对了但是跑得很慢，第一反应就是检查索引有没有失效。

| 失效场景            | ❌ 错误写法                                                | ✅ 正确写法 / 解决方案                           |
| :-------------- | :---------------------------------------------------- | :-------------------------------------- |
| ① 索引列参与运算       | `WHERE order_id - 1 = 1001`                           | 把运算移到右边：`WHERE order_id = 1002`         |
| ② 隐式类型转换        | `WHERE order_id = '1001'`（number vs varchar2）         | 类型保持一致：`WHERE order_id = 1001`          |
| ③ LIKE 左模糊      | `WHERE customer_name LIKE '%张'`                       | 尽量用右模糊：`LIKE '张%'`；或建函数索引               |
| ④ 函数处理索引列       | `WHERE SUBSTR(name,1,1) = '张'`                        | 建函数索引：`INDEX ... ON (SUBSTR(name,1,1))` |
| ⑤ NOT / != / <> | `WHERE region_id != 10`                               | 用 UNION ALL 替代；或优化器判断走索引代价高自动选全表扫       |
| ⑥ OR 连接非索引列     | `WHERE status = 'PAID' OR remark = 'VIP'`（remark 没索引） | 拆分两条 SQL 用 UNION ALL；或给 remark 也加索引     |

```sql
-- ① 索引列参与运算 → 失效（order_id上有索引也用不上）
SELECT * FROM orders WHERE order_id - 1 = 1001;  -- ❌
SELECT * FROM orders WHERE order_id = 1002;       -- ✅

-- ② 隐式转换 → 失效（order_id是NUMBER，值写成字符串）
SELECT * FROM orders WHERE order_id = '1001';     -- ❌ 发生隐式转换
SELECT * FROM orders WHERE order_id = 1001;       -- ✅ 类型一致

-- ③ LIKE以%开头（左模糊）→ 失效
SELECT * FROM orders WHERE customer_name LIKE '%张';  -- ❌ 左模糊用不到索引
SELECT * FROM orders WHERE customer_name LIKE '张%';  -- ✅ 右模糊可以用

-- ④ 函数处理索引列 → 失效
SELECT * FROM orders WHERE SUBSTR(customer_name, 1, 1) = '张';  -- ❌
-- ✅ 解决方案：建函数索引
CREATE INDEX idx_orders_name_substr ON orders(SUBSTR(customer_name, 1, 1));

-- ⑤ NOT / != / <> → 优化器可能选择全表扫描
SELECT * FROM orders WHERE region_id != 10;

-- ⑥ OR 连接的列中有一个没索引 → 整个SQL用不上索引
SELECT * FROM orders WHERE status = 'PAID' OR remark = 'VIP';  -- remark没索引
```

> 🔥   面试必背：索引失效 6 种场景  ——运算、转换、左模糊、函数、NOT、OR。
>
> 💡   记忆口诀  ：：：运转左函 N O R：：（运、转、左、函、NOT、OR）——运气做函，没有或者？

> 📌   注意  ：`IS NULL` / `IS NOT NULL` 对索引的影响——
>
> * `IS NULL` ：B树索引不存 NULL 值，所以 `IS NULL` 用不到索引（除非建索引时加了 NOT NULL 约束或用位图索引）
> * `IS NOT NULL`：如果返回的数据量很大，优化器也会选择全表扫描（还不如直接扫全表快）

***

### 📊 10.3 表分区

> 💡   一句话理解  ：分区 = "分表不分区"——逻辑上一张表，物理上多张表。按时间分区最常用。分区后查询快、管理方便。

💼   工作场景：   订单表每天新增几百万行，一年几十亿。不分区的话查某一天的数据也要扫全表。按日期分区后，查某天的数据只扫一个分区，快几百倍。

> 🔥   面试高频  ：分区表是大数据开发面试高频题。为啥要分区？——数据量上亿后，全表扫描太慢，按日期分区后只查一个分区的数据。
>
> 🤔   思考题  ：一张订单表有5亿行数据，按 `order_date` 做了范围分区（每月一个分区）。查某个月的订单汇总，SQL该怎么写才能利用分区剪枝？如果不加 `order_date` 条件呢？

#### 📋 范围分区

```sql
CREATE TABLE ods_user_base_partition (
    id NUMBER(38),
    user_id VARCHAR2(32),
    user_type VARCHAR2(32),
    active_time TIMESTAMP
) PARTITION BY RANGE (active_time) (
    PARTITION part2025 VALUES LESS THAN (TO_DATE('2026-1-1', 'yyyy-mm-dd')),
    PARTITION part2026 VALUES LESS THAN (TO_DATE('2027-1-1', 'yyyy-mm-dd')),
    PARTITION part2027 VALUES LESS THAN (TO_DATE('2028-1-1', 'yyyy-mm-dd'))
);

-- 插入数据（演示：跨2025/2026两个分区的数据）
INSERT INTO ods_user_base_partition VALUES (1, 'U1001', '0', TIMESTAMP '2025-06-01 10:00:00');
INSERT INTO ods_user_base_partition VALUES (2, 'U1002', '1', TIMESTAMP '2026-03-15 12:30:00');
COMMIT;

-- 查询指定分区（分区剪枝：只扫 part2026，不碰其他分区）
SELECT * FROM ods_user_base_partition PARTITION (part2026);
```

#### 📝 列表分区

```sql
CREATE TABLE ods_user_list_part (
    id NUMBER(38),
    user_id VARCHAR2(32),
    user_type VARCHAR2(32)
) PARTITION BY LIST (user_type) (
    PARTITION part0 VALUES ('0'),
    PARTITION part1 VALUES ('1'),
    PARTITION part2 VALUES ('2')
);
```

#### #️⃣ 哈希分区

```sql
CREATE TABLE ods_user_hash_part (
    id NUMBER(38),
    user_id VARCHAR2(32)
) PARTITION BY HASH (id) PARTITIONS 5;
```

***

### 📋 10.4 执行计划

> 💡   一句话理解  ：EXPLAIN PLAN 告诉你 Oracle 怎么执行 SQL。看到 TABLE ACCESS FULL 就是全表扫描（慢），看到 INDEX RANGE SCAN 就是走索引（快）。调优第一步就是看执行计划。

💼   工作场景：   SQL 跑得慢，别瞎猜。`EXPLAIN PLAN FOR` 看执行计划，一眼看出是全表扫描还是走索引，定位问题再对症下药。

> 📌   必记  ：执行计划阅读口诀——"从右往左、从里到外"看执行顺序。

```sql
-- 查看执行计划
EXPLAIN PLAN FOR
SELECT e.customer_name, d.region_name
FROM orders e, departments d
WHERE e.region_id = d.region_id AND e.total_amount > 1000;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- 执行计划符号含义
-- TABLE ACCESS FULL：全表扫描（慢）
-- INDEX RANGE SCAN：索引范围扫描（正常）
-- NESTED LOOP：嵌套循环（小表驱动大表）
-- HASH JOIN：哈希连接（大表关联）
-- SORT MERGE：排序合并（等值关联）
```

### ⚡ 10.5 HINT优化

> 💡   一句话理解  ：HINT = "提示"，强迫 Oracle 按你的方式执行。一般不用，Oracle 自带的优化器已经很聪明了。

```sql
-- 强制索引
SELECT /*+ INDEX(orders idx_orders_region_id) */ * FROM orders WHERE region_id = 10;

-- 强制HASH JOIN
SELECT /*+ USE_HASH(e d) */ * FROM orders e, departments d WHERE e.region_id = d.region_id;

-- 强制NESTED LOOP
SELECT /*+ ORDERED USE_NL(d) */ * FROM orders e, departments d WHERE e.region_id = d.region_id;

-- 并行执行
SELECT /*+ PARALLEL(orders, 4) */ * FROM orders;
```

***

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第十章 知识速查卡                  │
├───────────────────────────────────────────────┤
│ 📌 索引类型  → B树/位图/函数/复合索引           │
│ 📌 索引失效  → 运算/转换/NOT%/函数/隐式/全表   │
│ 📌 表分区    → 范围/列表/哈希分区               │
│ 📌 执行计划  → EXPLAIN PLAN分析SQL执行路径     │
│ 📌 HINT      → 强制优化器执行方式               │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：索引列参与运算会导致失效                │
│ ⚠️ 易错：LIKE以%开头导致全表扫描                │
│ ⚠️ 易错：执行计划从右往左、从里到外读            │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 索引失效6种场景  ：运算、隐式转换、LIKE以%开头、NOT/!=、函数处理、OR条件
2. 分区类型  ：范围分区（按时间）、列表分区（按枚举值）、哈希分区（均匀分布）
3. 执行计划符号  ：TABLE ACCESS FULL（全表扫描）、INDEX RANGE SCAN（索引扫描）
4. HINT  ：INDEX强制索引、USE\_HASH强制哈希连接、PARALLEL并行执行

#### 🎯 动手练习

> 练习1  ：为orders表的region\_id和total\_amount创建复合索引
>
> 练习2  ：创建按日期范围分区的订单表
>
> 练习3  ：用EXPLAIN PLAN分析SQL执行计划，判断是否走索引
>
> 练习4  ：用HINT强制SQL使用特定索引

#### 🤖 AI 加餐：让 AI 教你看执行计划（高阶用法）

执行计划是新手看天书、老手看地图的地方。让 DeepSeek 当翻译：

```text
我用 EXPLAIN PLAN 看了下面这条SQL的执行计划，输出如下：
<粘贴执行计划输出>

请：1. 按从右往左、从里到外的顺序告诉我执行流程；
2. 指出哪一步是性能瓶颈（TABLE ACCESS FULL 还是别的）；
3. 给出 2 条具体的优化建议，并解释为什么。
```

⚠️ 验证要点

：AI 建议加索引后，你建上索引、重新看执行计划——亲眼确认 TABLE ACCESS FULL 变成 INDEX RANGE SCAN 才算完成闭环。"AI 说好"不算好，执行计划说了才算。

#### 🔗 下一章预告

第十一章：Oracle优化技巧

* 学完SQL优化原则，你会掌握7大优化口诀
* 学完WHERE子句优化，你会避免索引失效
* 学完SELECT子句优化，你会减少数据访问
* 学完JOIN优化，你会提高关联查询效率
* 学完批量操作优化，你会提升DML性能
* 面试高频  ：优化原则、批量操作、分页查询优化

***

## 🧠 十一、 Oracle优化技巧

> 💡   一句话理解  ：优化就一个核心原则——减少不必要的数据访问。少查、少算、少关联。
>
> 🚀   本章要解决的问题  ：面试造火箭，工作拧螺丝——但"拧螺丝"也得拧得又快又好。优化技巧就是让SQL跑得更快、资源消耗更少。本章涵盖7大优化口诀、JOIN优化、批量操作等实战场景。
>
> 💬   课堂讨论  ：你们在工作中遇到过哪些"慢SQL"场景？最慢的SQL跑了多久？如果一张表有1亿行数据，SELECT \* 会发生什么？

### 📊 11.1 SQL优化原则

#### 🎯 核心原则

| 原则      | 说明          |
| ------- | ----------- |
| 减少访问数据量 | 只查需要的列和行    |
| 避免全表扫描  | 善用索引、分区     |
| 减少网络传输  | 避免在应用中做复杂计算 |
| 减少数据库负载 | 批量操作代替循环单条  |

#### ⚡ 七大优化口诀

```
1. SELECT只查需要的字段，禁用*
2. WHERE条件要有索引列，忌函数运算
3. 避免NOT、!=、<>导致索引失效
4. LIKE查询前缀匹配，后缀%会导致全表扫描
5. 多表关联字段类型要一致，避免隐式转换
6. 批量INSERT代替循环单条INSERT
7. 临时表/CTE代替多层嵌套子查询
```

***

### 🔍 11.2 WHERE子句优化

> 💡   一句话理解  ：索引列要"裸奔"，不能"化妆"——不能加函数、不能参与运算、不能隐式转换。

#### ✅ 正确写法

```sql
-- ✅ 利用索引列
SELECT * FROM orders WHERE region_id = 10;
SELECT * FROM orders WHERE order_id = 1001;

-- ✅ 使用绑定变量
SELECT * FROM orders WHERE order_id = :v_order_id;

-- ✅ LIKE前缀匹配
SELECT * FROM orders WHERE customer_name LIKE '张%';

-- ✅ 范围查询走索引
SELECT * FROM orders WHERE total_amount BETWEEN 1000 AND 3000;
```

#### ❌ 错误写法

```sql
-- ❌ 索引列参与运算
SELECT * FROM orders WHERE order_id - 1 = 1001;
SELECT * FROM orders WHERE total_amount + 100 > 3000;

-- ❌ 隐式转换导致索引失效（order_id 是 NUMBER，值却写成字符串）
SELECT * FROM orders WHERE order_id = '1001';
-- ✅ 类型写对就不会触发隐式转换
SELECT * FROM orders WHERE order_id = 1001;

-- ❌ NOT导致索引失效
SELECT * FROM orders WHERE NOT region_id = 10;
SELECT * FROM orders WHERE region_id != 10;
SELECT * FROM orders WHERE region_id <> 10;

-- ❌ LIKE后缀%导致全表扫描
SELECT * FROM orders WHERE customer_name LIKE '%张伟';
SELECT * FROM orders WHERE customer_name LIKE '%SM%';

-- ❌ OR条件导致索引失效
SELECT * FROM orders WHERE order_id = 1001 OR customer_name = '张伟';
-- 优化：用UNION ALL
SELECT * FROM orders WHERE order_id = 1001
UNION ALL
SELECT * FROM orders WHERE customer_name = '张伟' AND order_id != 1001;
```

***

### 📝 11.3 SELECT子句优化

> 💡   一句话理解  ：SELECT \* 三宗罪——浪费带宽、不走索引、可能读到不该看的列。永远只查你需要的字段。

💼   工作场景：   不只面试考，跑批脚本里 `SELECT *` 和 `SELECT 需要的列` 性能差几倍——因为你不需要的列也在占用IO和网络。

#### ✅ 正确写法

```sql
-- ✅ 只查需要的字段
SELECT order_id, customer_name, total_amount FROM orders;

-- ✅ 使用DECODE/CASE减少多次表访问
-- 错误：多次访问同一表
SELECT
    (SELECT region_name FROM departments WHERE region_id = e.region_id) AS region_name1,
    (SELECT location FROM departments WHERE region_id = e.region_id) AS region_name2
FROM orders e;

-- 正确：一次关联
SELECT e.order_id, d.region_name, d.location
FROM orders e
JOIN departments d ON e.region_id = d.region_id;
```

***

### 🔗 11.4 JOIN优化

> 💡   一句话理解  ：小表驱动大表。关联字段类型要一致，避免隐式转换。

💼   工作场景：   两张大表 JOIN，关联字段类型不一致（VARCHAR2 vs NUMBER）→ 隐式转换 → 索引失效 → 跑半小时。设计表结构时就约定好关联字段类型一致，少踩坑。

#### ✅ 优化原则

```sql
-- ✅ 小表驱动大表（Oracle自动优化，但建议明确）
SELECT /*+ LEADING(e d) */ *
FROM orders e, departments d
WHERE e.region_id = d.region_id;

-- ✅ 关联字段类型一致
SELECT * FROM orders e, departments d
WHERE e.region_id = CAST(d.region_id AS NUMBER);

-- ✅ 大表JOIN小表走Hash Join
SELECT /*+ USE_HASH(e d) */ *
FROM big_table e
JOIN small_table d ON e.id = d.id;
```

***

### 📦 11.5 批量操作优化

> 💡   一句话理解  ：批量 INSERT 比循环单条快100倍。MERGE 是更新+插入的组合拳。

💼   工作场景：   电商批量跑数——用 `INSERT INTO ... SELECT` 批量写入，不要写游标逐条 INSERT。100万行数据，批量10秒，逐条10分钟。

#### ✅ INSERT优化

```sql
-- ✅ 批量INSERT（快10-100倍）
INSERT INTO orders_backup
SELECT * FROM orders WHERE region_id = 10;

-- ❌ 循环单条INSERT（极慢）
BEGIN
    FOR i IN (SELECT * FROM orders WHERE region_id = 10) LOOP
        INSERT INTO orders_backup VALUES i;
    END LOOP;
END;
/

-- ✅ INSERT+APPEND提示（直接写入磁盘，绕过缓冲池）
INSERT /*+ APPEND */ INTO orders_backup
SELECT * FROM orders WHERE region_id = 10;
COMMIT;
```

#### ✅ UPDATE优化

```sql
-- ✅ 批量UPDATE
UPDATE orders SET total_amount = total_amount * 1.1 WHERE region_id = 10;

-- ❌ 循环单条UPDATE（极慢）
BEGIN
    FOR i IN (SELECT order_id FROM orders WHERE region_id = 10) LOOP
        UPDATE orders SET total_amount = total_amount * 1.1 WHERE order_id = i.order_id;
    END LOOP;
    COMMIT;
END;
/

-- ✅ 使用MERGE（合并操作）
MERGE INTO orders_backup b
USING orders e
ON (b.order_id = e.order_id)
WHEN MATCHED THEN
    UPDATE SET b.total_amount = e.total_amount * 1.1
WHEN NOT MATCHED THEN
    INSERT VALUES (e.order_id, e.customer_name, e.total_amount);
```

***

### 🏗️ 11.6 排序优化

> 💡   一句话理解  ：排序优化=能避免就避免。DISTINCT、UNION 都会触发排序，数据量大时很慢。

#### ✅ 减少排序

```sql
-- ✅ 避免不必要的DISTINCT
-- 查主表字段：order_id 是主键、行天然唯一，本来就不需要 DISTINCT
SELECT order_id, customer_name FROM orders;

-- 需要DISTINCT的场景：JOIN 一对多会把主表行撑重复
-- 比如直接查订单+明细，一个订单有几条明细就重复几行
-- 优化：先对子表聚合成一对一，再JOIN，既避免重复又不丢信息
SELECT o.order_id, o.customer_name, t.item_cnt
FROM orders o
JOIN (SELECT order_id, COUNT(*) AS item_cnt FROM order_items GROUP BY order_id) t
  ON o.order_id = t.order_id;
```

#### ❌ 避免排序

```sql
-- ❌ UNION会排序去重
SELECT region_id FROM orders WHERE region_id = 10
UNION
SELECT region_id FROM orders WHERE total_amount > 2000;

-- ✅ UNION ALL不去重，无排序
SELECT region_id FROM orders WHERE region_id = 10
UNION ALL
SELECT region_id FROM orders WHERE total_amount > 2000;
```

> ⚠️   易错点  ：在索引列上用函数会导致普通索引失效。确实必须用函数时，改建建建函数索引建建：

```sql
-- ❌ 普通索引遇到 UPPER() 失效
SELECT * FROM orders WHERE UPPER(customer_name) = 'ZHANGWEI';
--（演示：customer_name 存的是拼音大写场景；中文场景同理用 LOWER/UPPER 统一大小写）
-- ✅ 改建函数索引后，同样写法能走索引
CREATE INDEX idx_orders_upper ON orders(UPPER(customer_name));
```

***

### ⏱️ 11.7 优化案例实战

> 💡   一句话理解  ：下面三个案例覆盖了工作中最常见的高频优化场景。

#### 🚀 案例1：分页查询优化

```sql
-- ❌ 错误分页（ROWNUM 在 ORDER BY 之前就已赋值，排序后行号是乱的）
SELECT * FROM (
    SELECT ROWNUM rn, e.* FROM orders e ORDER BY total_amount DESC
) WHERE rn BETWEEN 1001 AND 1010;

-- ✅ 优化分页（先在子查询里排好序，再套 ROWNUM 取区间）
SELECT * FROM (
    SELECT t.*, ROWNUM rn FROM (
        SELECT * FROM orders ORDER BY total_amount DESC
    ) t
) WHERE rn BETWEEN 1001 AND 1010;
```

#### 🚀 案例2：统计查询优化

```sql
-- ❌ 低效：多次聚合
SELECT
    (SELECT COUNT(*) FROM orders) AS total_cnt,
    (SELECT COUNT(*) FROM orders WHERE region_id = 10) AS departments10_cnt,
    (SELECT COUNT(*) FROM orders WHERE total_amount > 2000) AS high_total_amount_cnt
FROM DUAL;

-- ✅ 优化：一次聚合+CASE
SELECT
    COUNT(*) AS total_cnt,
    SUM(CASE WHEN region_id = 10 THEN 1 ELSE 0 END) AS departments10_cnt,
    SUM(CASE WHEN total_amount > 2000 THEN 1 ELSE 0 END) AS high_total_amount_cnt
FROM orders;
```

#### 🚀 案例3：复杂报表优化

```sql
-- ❌ 低效：多层嵌套子查询
SELECT * FROM (
    SELECT * FROM (
        SELECT e.*, d.region_name
        FROM orders e, departments d
        WHERE e.region_id = d.region_id
    ) t1
    WHERE total_amount > (SELECT AVG(total_amount) FROM orders)
) t2
WHERE region_id = 10;

-- ✅ 优化：CTE+JOIN
WITH orders_departments AS (
    SELECT e.*, d.region_name FROM orders e JOIN departments d ON e.region_id = d.region_id
),
orders_avg AS (
    SELECT AVG(total_amount) AS avg_total_amount FROM orders
)
SELECT e.*
FROM orders_departments e
JOIN orders_avg a ON 1=1
WHERE e.total_amount > a.avg_total_amount AND e.region_id = 10;
```

***

### 📋 11.8 企业优化清单

```
┌────────────────────────────────────────────────────────────────┐
│                    Oracle SQL优化检查清单                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ✅ 查询语句                                                    │
│  ├── SELECT只查需要的字段，禁用*                                │
│  ├── WHERE条件字段有索引                                        │
│  ├── 避免NOT/!=/<> 导致索引失效                                 │
│  └── LIKE使用前缀匹配 '%abc'会导致全表扫描                      │
│                                                                │
│  ✅ 关联查询                                                    │
│  ├── 多表关联字段类型一致                                       │
│  ├── 大表JOIN小表用Hash Join                                   │
│  └── 避免笛卡尔积                                               │
│                                                                │
│  ✅ 排序聚合                                                    │
│  ├── DISTINCT可避免就用GROUP BY                                 │
│  ├── UNION ALL代替UNION（不需要去重时）                         │
│  └── 避免在索引列上使用函数                                      │
│                                                                │
│  ✅ 批量操作                                                    │
│  ├── INSERT用批量不要循环单条                                   │
│  ├── 大量更新用MERGE                                            │
│  └── COMMIT分段提交                                             │
│                                                                │
│  ✅ 表设计                                                      │
│  ├── 字段类型要合理                                             │
│  ├── 主键索引要建立                                             │
│  └── 分区表按时间/地区划分                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 📝 本章小结

#### ✅ 知识速查卡

```
┌───────────────────────────────────────────────┐
│              第十一章 知识速查卡                 │
├───────────────────────────────────────────────┤
│ 📌 优化原则  → 减少数据访问/避免全表扫描        │
│ 📌 WHERE优化 → 索引列裸奔，避免函数运算          │
│ 📌 SELECT优化→ 禁用*，只查需要的字段            │
│ 📌 JOIN优化  → 小表驱动大表，类型一致            │
│ 📌 批量操作  → 批量INSERT代替循环单条           │
│ 📌 排序优化  → 避免不必要排序，用UNION ALL     │
├───────────────────────────────────────────────┤
│ ⚠️ 易错：SELECT *浪费带宽和IO                  │
│ ⚠️ 易错：索引列参与运算导致失效                 │
│ ⚠️ 易错：UNION会排序去重，UNION ALL不会        │
└───────────────────────────────────────────────┘
```

#### 🔥 面试必背

1. 7大优化口诀  ：SELECT只查需要的字段、WHERE条件有索引列、避免NOT/!=、LIKE前缀匹配、关联字段类型一致、批量INSERT、临时表/CTE代替嵌套
2. WHERE优化  ：索引列不能参与运算、不能有函数、不能隐式转换
3. 批量操作  ：批量INSERT比循环单条快100倍，MERGE适合增量同步
4. 分页优化  ：先查索引再关联，避免先查全表再取ROWNUM

#### 🎯 动手练习

> 练习1  ：优化一个SELECT \*查询，改为只查需要的字段
>
> 练习2  ：优化一个索引列参与运算的WHERE条件
>
> 练习3  ：用批量INSERT代替循环单条INSERT
>
> 练习4  ：用UNION ALL代替UNION（不需要去重时）

#### 🔗 下一章预告

第十二章：Oracle面试高频问题

* 掌握Oracle和MySQL的区别
* 掌握索引失效场景
* 掌握ROW\_NUMBER、RANK、DENSE\_RANK区别
* 掌握连续登录问题解决思路
* 掌握临时表和永久表的区别
* 掌握PL/SQL和SQL的区别
* 面试必背  ：6道高频面试题标准答案

***

## 🎓 十二、 Oracle面试高频问题

> 💡   本章要解决的问题  ：学完前面的内容，这些技能在面试中怎么用？本章把面试官最常问的6道高频题配上标准答案，面试前背一遍，心里有底。
>
> 🚀   求职建议  ：大数据开发面试中，SQL考核占30%-40%。不会SQL = 面试直接挂。

😤   面试官说  ："Oracle和MySQL区别？讲讲索引失效场景？"

🐶   我说  ："（标准答案）"

### 🗄️ Q1：Oracle和MySQL区别？

```
✅ 回答：
1. 定位
   - Oracle：企业级数据库，稳定安全，价格昂贵
   - MySQL：互联网数据库，开源免费，轻量级

2. 事务
   - Oracle：默认不自动提交（需COMMIT）
   - MySQL：默认自动提交

3. 分页
   - Oracle：ROWNUM（伪列）
   - MySQL：LIMIT

4. 字符串
   - Oracle：VARCHAR2（专用）
   - MySQL：VARCHAR

5. 递归
   - Oracle：START WITH CONNECT BY PRIOR
   - MySQL：8.0+ 支持 WITH RECURSIVE 递归CTE（旧版本需用自JOIN模拟）

一句话：Oracle适合大型传统企业，MySQL适合互联网公司（注意：MySQL 8.0以后很多差异已被抹平，别把老黄历当答案）
```

### 📇 Q2：索引失效场景有哪些？

```
✅ 回答：
1. 索引列参与运算
   SELECT * FROM orders WHERE order_id - 1 = 1001;  -- order_id索引失效

2. 隐式转换
   SELECT * FROM orders WHERE order_id = '1001';  -- order_id是NUMBER，写成字符串
   -- Oracle把索引列隐式转成数字再比较，索引失效

3. LIKE以%开头
   SELECT * FROM orders WHERE customer_name LIKE '%张';  -- 索引失效

4. NOT / != / <>
   SELECT * FROM orders WHERE region_id != 10;  -- 索引失效

5. 函数处理索引列
   SELECT * FROM orders WHERE UPPER(customer_name) = '张伟';  -- 普通索引失效

6. OR条件
   SELECT * FROM orders WHERE order_id = 1001 OR customer_name = '张伟';  -- 部分失效
   优化：用UNION ALL代替
```

### 🔹 Q3：ROW\_NUMBER、RANK、DENSE\_RANK区别？

```
✅ 回答：
- ROW_NUMBER：连续不重复（1,2,3,4,5,6）
- RANK：跳跃重复（1,2,2,2,5,6）
- DENSE_RANK：连续重复（1,2,2,2,3,4）

示例：成绩相同都是95分
- ROW_NUMBER：1(95分A), 2(95分B), 3(90分C)  -- A和B排名不同
- RANK：1(95分A), 1(95分B), 3(90分C)  -- A和B并列，跳到第3
- DENSE_RANK：1(95分A), 1(95分B), 2(90分C)  -- A和B并列，下一个是第2
```

### ❓ Q4：如何解决连续登录问题？

```
✅ 回答：
步骤：
1. 去重：同一天多次登录只算一次
2. 排名：用ROW_NUMBER给登录日期编号
3. 计算差值：登录日期 - 排名号
4. 分组统计：相同差值的为一组，COUNT就是连续天数

核心SQL：
WITH a AS (
    SELECT id, TO_DATE(TO_CHAR(logintime, 'yyyy-mm-dd'), 'yyyy-mm-dd') dt
    FROM login
    GROUP BY id, TO_DATE(TO_CHAR(logintime, 'yyyy-mm-dd'), 'yyyy-mm-dd')
),
b AS (
    SELECT id, dt, ROW_NUMBER() OVER(PARTITION BY id ORDER BY dt) rn FROM a
),
c AS (
    SELECT id, dt - rn AS grp FROM b
)
SELECT id, MAX(ct) AS max_days
FROM (SELECT id, grp, COUNT(*) AS ct FROM c GROUP BY id, grp)
GROUP BY id

注意两个易错点：
- GROUP BY 里不能写别名 dt，要写完整表达式（Oracle 的 GROUP BY 不认别名）
- 连续天数要先按 id+grp 分组 COUNT，再对 id 取 MAX，两层聚合不能合在一起写
```

### 🗄️ Q5：Oracle的临时表和永久表的区别？

```
✅ 回答：
永久表：
- 数据持久存储
- 提交COMMIT后数据保留
- 默认存在用户的默认表空间

临时表：
- 存储临时数据
- 事务级：COMMIT后数据清空
- 会话级：退出会话后数据清空
- 使用TEMP表空间

创建：
CREATE GLOBAL TEMPORARY TABLE torders_table (
    id NUMBER, name VARCHAR2(20)
) ON COMMIT DELETE ROWS;  -- 事务级
```

### 🔹 Q6：PL/SQL和SQL有什么区别？

```
✅ 回答：
SQL：
- 结构化查询语言
- 数据定义和操作
- 面向集合操作

PL/SQL：
- 过程化编程语言
- 包含变量、控制语句、异常处理
- 可编写业务逻辑
- 支持游标、存储过程、函数

一句话：SQL是"做什么"，PL/SQL是"怎么做"
```

#### 🤖 AI 加餐：让 DeepSeek 当模拟面试官（结课前必做一次）

```text
你是一名严格的大数据开发岗位面试官。请针对"Oracle/SQL基础"对我进行模拟面试：
1. 一次只问一个问题，等我回答后再问下一个；
2. 从易到难共10题：SQL执行顺序 → NULL处理 → 窗口函数 → 连续登录 → 索引失效 → SQL优化；
3. 我每答一题，你先给分（1-5分），再指出答案里不严谨的地方，最后给一个更好的答法；
4. 全部结束后输出一份"薄弱点清单"。
```

⚠️ 验证要点

：AI 给的"标准答案"也要过一遍脑子——拿不准的点回课件对应章节核对。面试官是人，答案讲出人味、带上业务场景（电商订单、GMV、结算），比背模板更打动人。这份薄弱点清单，就是你面试前的复习重点。

***

## 📝 课程总结

```
┌────────────────────────────────────────────────────────────────┐
│                      今天学到了什么？                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ✅ SQL基础 - 查询/分组/排序/条件/SQL执行顺序                    │
│  ✅ 集合运算与子查询 - UNION/INTERSECT/MINUS/嵌套               │
│  ✅ 函数体系 - 字符/数值/日期/转换/空值/分析函数                │
│  ✅ 多表关联 - INNER/LEFT/RIGHT/FULL JOIN/自连接/行列转换       │
│  ✅ DDL与DML - 建表/改结构/增删改/事务ACID                      │
│  ✅ PL/SQL编程 - 游标/存储过程/函数/异常处理                    │
│  ✅ 数据库对象 - 序列/视图/物化视图/MERGE                       │
│  ✅ 索引优化 - 类型/6大失效场景/执行计划/HINT                   │
│  ✅ SQL优化技巧 - 7大优化口诀/批处理/排序优化                   │
│  ✅ 面试题精讲 - 6道高频标准答案                                 │
│  ✅ AI辅助学习 - DeepSeek陪练/纠错/模拟面试（每章AI加餐）         │
│                                                                │
│  💰 薪资影响：                                                 │
│  Oracle精通 = 数据库工程师 = 20K+                               │
│  Oracle了解 = 18K                                              │
│                                                                │
│  记住：Oracle是大数据开发的数据库基础！                          │
└────────────────────────────────────────────────────────────────┘
```

> 🐶   记住  ：Oracle学得好，数据处理没烦恼！💪

***

Oracle课程完！SQL写得好，数据库没烦恼！

&#x20;🎤

***

## 📎 附录A：全课程统一建表+造数脚本（电商业务）

> 使用方法  ：开课时在 SQL 窗口口口整段执行一次口口，之后全课件所有示例都能直接跑。
> 表关系：`departments(区域) ← customers(客户) ← orders(订单) ← order_items(订单明细)`，另有 4 张练习专用表。

```sql
-- 1. 区域/大区表（含仓库所在城市）
CREATE TABLE departments (
    region_id   NUMBER(3) PRIMARY KEY,
    region_name VARCHAR2(30),
    location    VARCHAR2(30)        -- 仓库所在城市
);

-- 2. 客户表
CREATE TABLE customers (
    customer_id   NUMBER PRIMARY KEY,
    customer_name VARCHAR2(50),
    region_id     NUMBER(3) REFERENCES departments(region_id)
);

-- 3. 员工表（跟单客服）
CREATE TABLE employees (
    employee_id   NUMBER PRIMARY KEY,
    employee_name VARCHAR2(50)
);

-- 4. 订单表（核心业务表，customer_name为冗余字段——数仓中间表常见做法，方便练习函数）
CREATE TABLE orders (
    order_id        NUMBER PRIMARY KEY,
    customer_id     NUMBER REFERENCES customers(customer_id),
    employee_id     NUMBER REFERENCES employees(employee_id),
    region_id       NUMBER(3),       -- 发货区域仓
    total_amount    NUMBER(10,2),    -- 订单总金额
    discount_amount NUMBER(10,2),    -- 优惠金额（允许NULL）
    status          VARCHAR2(20),    -- PAID已支付/SHIPPED已发货/CANCELLED已取消
    order_date      DATE,
    payment_time    DATE,            -- 允许NULL（未支付）
    customer_name   VARCHAR2(50)
);

-- 5. 订单明细表（category_id：11手机 12电脑 13女装 14男装）
CREATE TABLE order_items (
    item_id     NUMBER PRIMARY KEY,
    order_id    NUMBER REFERENCES orders(order_id),
    category_id NUMBER,
    quantity    NUMBER
);

-- 6. 佣金结算阶梯表（不等值连接练习）
CREATE TABLE commission_levels (
    level_id   NUMBER PRIMARY KEY,
    level_name VARCHAR2(30),
    min_amount NUMBER(10,2),
    max_amount NUMBER(10,2)
);

-- 7. 品类购买量宽表（行列转换练习）
CREATE TABLE category_sales (
    customer_id NUMBER,
    mobile      NUMBER,   -- 手机
    computer    NUMBER,   -- 电脑
    women       NUMBER,   -- 女装
    men         NUMBER    -- 男装
);

-- 8. 登录日志表（连续登录练习）
CREATE TABLE login (
    id        VARCHAR2(10),
    logintime DATE
);

-- ==================== 演示数据 ====================
INSERT INTO departments VALUES (10, '华北区', '北京');
INSERT INTO departments VALUES (20, '华东区', '上海');
INSERT INTO departments VALUES (30, '华南区', '广州');
INSERT INTO departments VALUES (40, '西南区', '成都');

INSERT INTO employees VALUES (1, '李雷');
INSERT INTO employees VALUES (2, '韩梅梅');

INSERT INTO customers VALUES (1, '张伟', 10);
INSERT INTO customers VALUES (2, '王芳', 20);
INSERT INTO customers VALUES (3, '李娜', 30);
INSERT INTO customers VALUES (4, '刘强', 40);   -- 从没下过单（练LEFT JOIN用）
INSERT INTO customers VALUES (5, '陈静', 10);   -- 从没下过单（练LEFT JOIN用）

INSERT INTO orders VALUES (1001, 1, 1, 10, 3580.00, 100.00, 'PAID',      DATE'2026-05-01', DATE'2026-05-01', '张伟');
INSERT INTO orders VALUES (1002, 1, 2, 10, 899.00,  NULL,    'PAID',      DATE'2026-05-02', DATE'2026-05-02', '张伟');
INSERT INTO orders VALUES (1003, 2, 1, 20, 12500.00, 500.00, 'SHIPPED',   DATE'2026-05-03', DATE'2026-05-03', '王芳');
INSERT INTO orders VALUES (1004, 3, 2, 30, 1999.00,  NULL,    'PAID',      DATE'2026-05-05', DATE'2026-05-05', '李娜');
INSERT INTO orders VALUES (1005, 3, 1, 30, 3299.00,  150.00, 'CANCELLED', DATE'2026-05-06', NULL,             '李娜');
INSERT INTO orders VALUES (1006, 2, 2, 20, 456.00,   NULL,    'PAID',      DATE'2026-05-08', DATE'2026-05-08', '王芳');
INSERT INTO orders VALUES (1007, 1, 1, 10, 6800.00,  300.00, 'PAID',      DATE'2026-05-10', DATE'2026-05-10', '张伟');
INSERT INTO orders VALUES (1008, 3, 2, 30, 1234.00,  NULL,    'PAID',      DATE'2026-05-12', DATE'2026-05-12', '李娜');
INSERT INTO orders VALUES (1009, 2, 1, 20, 78.00,    NULL,    'CANCELLED', DATE'2026-05-15', NULL,             '王芳');

INSERT INTO order_items VALUES (1, 1001, 11, 1);
INSERT INTO order_items VALUES (2, 1001, 12, 2);
INSERT INTO order_items VALUES (3, 1002, 13, 3);
INSERT INTO order_items VALUES (4, 1003, 11, 5);
INSERT INTO order_items VALUES (5, 1004, 12, 1);
INSERT INTO order_items VALUES (6, 1005, 14, 2);
INSERT INTO order_items VALUES (7, 1006, 13, 1);
INSERT INTO order_items VALUES (8, 1007, 11, 2);
INSERT INTO order_items VALUES (9, 1007, 12, 1);
INSERT INTO order_items VALUES (10, 1008, 14, 4);

INSERT INTO commission_levels VALUES (1, '小额订单', 0, 1000);
INSERT INTO commission_levels VALUES (2, '中额订单', 1000, 5000);
INSERT INTO commission_levels VALUES (3, '大额订单', 5000, 99999999);

INSERT INTO category_sales VALUES (1, 3, 3, 3, 0);
INSERT INTO category_sales VALUES (2, 5, 1, 1, 2);
INSERT INTO category_sales VALUES (3, 0, 1, 4, 6);

-- 登录数据：U01 连续登录3天（5.1~5.3）后隔2天再登录；U02 隔天登录
INSERT INTO login VALUES ('U01', DATE'2026-05-01');
INSERT INTO login VALUES ('U01', DATE'2026-05-02');
INSERT INTO login VALUES ('U01', DATE'2026-05-03');
INSERT INTO login VALUES ('U01', DATE'2026-05-06');
INSERT INTO login VALUES ('U02', DATE'2026-05-01');
INSERT INTO login VALUES ('U02', DATE'2026-05-03');

COMMIT;
```

> 💡   设计说明  （为什么造数有讲究）：
>
> * `刘强/陈静` 没有订单 → LEFT JOIN 练习能看到 NULL
> * `1005/1009` 有 `payment_time IS NULL` → 练"查未支付订单"
> * `U01` 连续登录 3 天 → 连续登录题的答案可人工验算
> * 数据故意小（每表不到10行）→ 每条 SQL 的结果都能用眼睛数出来，适合验证

## 📎 附录B：Oracle / MySQL / Hive 语法对照速查

> 学生以后 90% 的活儿在 Hive/MySQL 上干，但公司老系统常见 Oracle。这张表帮你"一套概念，三处通用"，后面 Hive 课还会反复遇到。

| 功能     | Oracle                      | MySQL                        | Hive                           |
| ------ | --------------------------- | ---------------------------- | ------------------------------ |
| 分页/取前N | `ROWNUM` 伪列                 | `LIMIT n`                    | `LIMIT n`                      |
| 无表查询   | 必须带 `FROM dual`             | 直接 `SELECT 1+1`              | 直接 `SELECT 1+1`                |
| 空值转默认  | `NVL(a, 0)`                 | `IFNULL(a, 0)`               | `NVL(a, 0)` / `COALESCE`       |
| 字符串拼接  | `\|\|` 或 `CONCAT`           | `CONCAT`（不支持`\|\|`）          | `\|\|` 或 `CONCAT`              |
| 日期转字符串 | `TO_CHAR(d, 'yyyy-mm-dd')`  | `DATE_FORMAT(d, '%Y-%m-%d')` | `date_format(d, 'yyyy-MM-dd')` |
| 差集     | `MINUS`                     | 8.0前无（用LEFT JOIN模拟）          | `EXCEPT`（3.0+）/ LEFT JOIN      |
| 自动编号   | `SEQUENCE` 序列               | `AUTO_INCREMENT`             | 无（靠唯一ID）                       |
| 递归查询   | `START WITH ... CONNECT BY` | 8.0+ `WITH RECURSIVE`        | 不支持（用多CTE分层）                   |
| 索引     | B树/位图/函数索引                  | B树/哈希                        | 无索引概念  （靠分区/分桶）                |
| 事务     | 完整ACID，默认不自动提交              | 默认自动提交                       | 不支持行级事务（ACID弱）                 |

> 🔥   面试衔接  ：被问"Oracle 和 Hive 的区别"——答"Oracle 是 OLTP 关系库、完整事务和索引；Hive 是 OLAP 数仓、数据存 HDFS、无索引、延迟高但能扛 PB 级"。这句话后面 Hive 课会展开。

#### ⚠️ Oracle → Hive 迁移六大踩坑（切到 Hive 课之前先记住）

| # | 踩坑点           | Oracle 习惯                                                               | Hive 现实                                                            |
| - | ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 | GROUP BY 严格模式 | `SELECT region_id, COUNT(*) ... GROUP BY region_id` 之外的非聚合列，Oracle 严格校验 | 同样严格————SELECT 里非聚合列必须全部出现在 GROUP BY 里——，Oracle 养成的"侥幸写法"会直接报错     |
| 2 | 类型系统          | NUMBER 通吃，`'5'` 和 5 隐式比较能跑                                              | 类型不自动转，字符串比数字要么显式 `CAST`，要么结果错                                     |
| 3 | 日期处理          | `DATE` 直接加减天数、`TO_CHAR` 万能                                              | `date`/`timestamp` 是字符串语义，函数换成 `datediff`/`date_add`/`date_format` |
| 4 | UPDATE/DELETE | 随便改                                                                     | 默认认认不支持认认行级改删（仅 ACID 表支持）——数仓改数靠 `INSERT OVERWRITE` 重写分区           |
| 5 | 索引与主键         | 靠索引提速                                                                   | 没有索引  ，靠分区裁剪/分桶/MapJoin 提速                                         |
| 6 | 半结构化数据        | 拆列存                                                                     | 原生支持 `MAP/ARRAY/STRUCT` + `explode` 炸开——ETL 常用                     |

## 📎 附录C：电商 SQL 综合练习（10 题，用附录A 的表）

> 用法  ：先自己写，写不出来把题目+你的 SQL 发给 DeepSeek（只给提示不给答案），最后对照参考答案。全部基于附录A 的造数数据，每题结果都能用眼睛验算。

Q1（基础聚合）

：统计每个大区的订单总数和订单总金额，输出大区名。

```sql
-- 参考答案
SELECT d.region_name, COUNT(*) AS order_cnt, SUM(o.total_amount) AS total_amount
FROM orders o JOIN departments d ON o.region_id = d.region_id
GROUP BY d.region_name;
-- 预期：华北区3笔、华东区3笔、华南区3笔，西南区0笔（不在结果里）
```

Q2（多表+NULL）

：找出从来没有下过单的客户。

```sql
-- 参考答案（两种写法都要会）
SELECT c.customer_name FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_id IS NULL;                        -- LEFT JOIN 写法：刘强、陈静

SELECT customer_name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
```

Q3（CASE WHEN）

：把订单按金额分档（≥5000 高价值、1000-4999 普通、<1000 小额），统计各档单量。

```sql
SELECT CASE WHEN total_amount >= 5000 THEN '高价值'
            WHEN total_amount >= 1000 THEN '普通'
            ELSE '小额' END AS order_level,
       COUNT(*) AS cnt
FROM orders GROUP BY CASE WHEN total_amount >= 5000 THEN '高价值'
                          WHEN total_amount >= 1000 THEN '普通'
                          ELSE '小额' END;
-- 预期：高价值2单（1003/1007）、普通4单、小额3单
```

Q4（窗口 TopN）

：查出每个大区订单金额最高的前 2 单。

```sql
SELECT * FROM (
    SELECT o.order_id, d.region_name, o.total_amount,
           ROW_NUMBER() OVER(PARTITION BY o.region_id ORDER BY o.total_amount DESC) AS rn
    FROM orders o JOIN departments d ON o.region_id = d.region_id
) t WHERE rn <= 2;
```

Q5（窗口累计）

：按订单日期计算累计 GMV（每天一行，含之前所有天）。

```sql
SELECT order_date, SUM(total_amount) AS day_gmv,
       SUM(SUM(total_amount)) OVER(ORDER BY order_date) AS running_gmv
FROM orders
WHERE status = 'PAID'
GROUP BY order_date ORDER BY order_date;
```

Q6（偏移函数）

：计算每天 GMV 及其环比增长率。

```sql
SELECT order_date, day_gmv,
       ROUND((day_gmv - LAG(day_gmv, 1) OVER(ORDER BY order_date))
             / LAG(day_gmv, 1) OVER(ORDER BY order_date) * 100, 2) AS mom_pct
FROM (
    SELECT order_date, SUM(total_amount) AS day_gmv
    FROM orders WHERE status = 'PAID' GROUP BY order_date
) t;
```

Q7（日期函数）

：不查日历，用 SQL 算出"上个月的最后一天"和"下个月的第一天"。

```sql
SELECT TO_CHAR(LAST_DAY(ADD_MONTHS(SYSDATE, -1)), 'yyyy-mm-dd') AS last_day_of_prev_month,
       TO_CHAR(TRUNC(ADD_MONTHS(SYSDATE, 1), 'mm'), 'yyyy-mm-dd')  AS first_day_of_next_month
FROM DUAL;
```

Q8（连续登录）

：找出登录日志表里每个用户的最长连续登录天数。

```sql
WITH a AS (SELECT id, logintime FROM login GROUP BY id, logintime),
b AS (SELECT id, logintime,
             ROW_NUMBER() OVER(PARTITION BY id ORDER BY logintime) AS rn
      FROM a),
c AS (SELECT id, logintime - rn AS grp FROM b)
SELECT id, MAX(ct) AS max_days
FROM (SELECT id, grp, COUNT(*) AS ct FROM c GROUP BY id, grp)
GROUP BY id;
-- 预期：U01=3天，U02=1天
```

Q9（行列互转）

：把宽表 `category_sales` 还原成明细（客户ID、品类、数量）。

```sql
SELECT customer_id, '手机' AS category, mobile   AS qty FROM category_sales
UNION ALL
SELECT customer_id, '电脑', computer FROM category_sales
UNION ALL
SELECT customer_id, '女装', women    FROM category_sales
UNION ALL
SELECT customer_id, '男装', men      FROM category_sales;
-- 也可以用 UNPIVOT 写法（见第5章）
```

Q10（SQL 优化）

：下面这条 SQL 每行都去查一次 departments 表，请改写优化并说明原因。

```sql
-- ❌ 原SQL：标量子查询对每行执行一次（性能杀手）
SELECT o.order_id,
       (SELECT region_name FROM departments d WHERE d.region_id = o.region_id) AS region_name
FROM orders o;

-- ✅ 优化：改成 JOIN，一次关联全表搞定
SELECT o.order_id, d.region_name
FROM orders o JOIN departments d ON o.region_id = d.region_id;
-- 原因：标量子查询 orders 有几行就执行几次；JOIN 一次哈希/嵌套循环完成，十万行级别差距是数量级的
```
