/**
 * SMTP 邮件发送测试脚本
 * 用法: npx ts-node src/scripts/test-smtp.ts
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

// 加载 .env 配置
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  host: process.env.SMTP_HOST || 'mail.smtp2go.com',
  port: parseInt(process.env.SMTP_PORT || '2525', 10),
  user: process.env.SMTP_USER || 'smtp@nai-group.com',
  password: process.env.SMTP_PASSWORD || 'R3UURg7LQ6A01UrZ',
  from: process.env.SMTP_FROM || 'ncn@nai-group.com'
};

async function testSMTP() {
  console.log('=== SMTP 邮件发送测试 ===\n');
  console.log('配置信息:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  User: ${config.user}`);
  console.log(`  From: ${config.from}`);
  console.log('');

  // 创建 transporter
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false, // SMTP2Go 使用 2525 端口，不需要 TLS
    tls: {
      rejectUnauthorized: false
    },
    auth: {
      user: config.user,
      pass: config.password
    }
  });

  // 测试连接
  console.log('1. 测试 SMTP 连接...');
  try {
    await transporter.verify();
    console.log('   ✅ 连接成功!\n');
  } catch (error: any) {
    console.log('   ❌ 连接失败:', error.message);
    process.exit(1);
  }

  // 发送测试邮件
  const testRecipients = process.argv.slice(2);
  const to = testRecipients.length > 0 ? testRecipients : ['ncn@nai-group.com'];

  console.log(`2. 发送测试邮件到: ${to.join(', ')}`);
  console.log('');

  const mailOptions = {
    from: config.from,
    to: to.join(', '),
    subject: '【NCN系统】SMTP 测试邮件',
    html: `
      <div style="font-family: Calibri, Arial, sans-serif;">
        <h2>NCN 系统邮件测试</h2>
        <p>这是一封来自 NCN 系统的测试邮件。</p>
        <p><strong>发送时间:</strong> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
        <p><strong>SMTP 服务器:</strong> ${config.host}:${config.port}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          如果你收到这封邮件，说明 SMTP 配置正常，NCN 系统的邮件功能可以正常使用。
        </p>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('   ✅ 邮件发送成功!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log('');
    console.log('=== 测试完成 ===');
    console.log('请检查收件箱（包括垃圾邮件）确认是否收到测试邮件。');
  } catch (error: any) {
    console.log('   ❌ 发送失败:', error.message);
    if (error.responseCode) {
      console.log(`   错误码: ${error.responseCode}`);
    }
    process.exit(1);
  }
}

testSMTP();
