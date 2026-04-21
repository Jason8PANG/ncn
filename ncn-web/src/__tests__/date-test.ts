/**
 * 测试脚本：验证日期格式问题
 *
 * 问题：SQL Server 报错 "Conversion failed when converting date and/or time from character string."
 * 原因：Sequelize 的 DataTypes.DATE 会尝试将 "2026-04-19" 字符串转换为 Date，
 *       然后发送给 SQL Server 时格式可能不符合要求
 */

const testDateParsing = () => {
  console.log('=== 测试日期解析 ===\n');

  const testDate = "2026-04-19";
  console.log(`原始输入: "${testDate}"`);
  console.log(`类型: ${typeof testDate}`);

  // Sequelize 内部会这样做：将字符串转为 Date 对象
  const asDate = new Date(testDate);
  console.log(`\n转为 JavaScript Date: ${asDate}`);
  console.log(`toISOString(): ${asDate.toISOString()}`);
  console.log(`toISOString().substring(0,10): ${asDate.toISOString().substring(0,10)}`);
  console.log(`toLocaleDateString(): ${asDate.toLocaleDateString()}`);

  // 问题：有些格式传给 SQL Server 会失败
  console.log('\n=== 可能的 SQL Server 问题 ===');
  console.log('SQL Server 期望格式: YYYY-MM-DD');
  console.log(`但可能收到格式: ${asDate.toISOString()}`);
  console.log(`或格式: ${asDate.toLocaleString('en-US', { hour12: false })}`);
};

const testSqlFormats = () => {
  console.log('\n=== SQL Server 日期格式测试 ===');

  const dateStr = "2026-04-19";
  const date = new Date(dateStr);

  // 各种可能的输出格式
  console.log('输入: "2026-04-19"');
  console.log('1. 直接字符串: "2026-04-19"  <- 这个是正确的');
  console.log(`2. toISOString(): "${date.toISOString()}" <- SQL Server 可能会失败`);
  console.log(`3. toLocaleString(): "${date.toLocaleString('en-US', { hour12: false })}"`);
  console.log(`4. toLocaleDateString(): "${date.toLocaleDateString()}"`);

  // 验证正则
  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  console.log(`\n验证 "${dateStr}" 是否符合 YYYY-MM-DD: ${isValid}`);
};

const demonstrateProblem = () => {
  console.log('\n=== 问题演示 ===');
  console.log('当前模型定义:');
  console.log('  ActionDuedate: { type: DataTypes.DATE, allowNull: true }');
  console.log('\n问题流程:');
  console.log('1. 前端发送: { ActionDuedate: "2026-04-19" }');
  console.log('2. Sequelize 接收到字符串 "2026-04-19"');
  console.log('3. Sequelize 尝试 new Date("2026-04-19") -> 转换为 UTC');
  console.log('4. 发送给 SQL Server 时，可能变成: "2026-04-19T00:00:00.000Z"');
  console.log('5. SQL Server 收到无法解析的格式，报错');

  console.log('\n=== 解决方案 ===');
  console.log('方案A (推荐): 将 DataTypes.DATE 改为 DataTypes.STRING(10)');
  console.log('  - 直接存储字符串 "2026-04-19"');
  console.log('  - 完全避免日期类型转换问题');
  console.log('  - 查询时用字符串比较也完全正确');
};

testDateParsing();
testSqlFormats();
demonstrateProblem();
