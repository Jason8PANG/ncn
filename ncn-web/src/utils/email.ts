import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

// 创建 transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    tls: {
      rejectUnauthorized: false
    },
    auth: config.email.user && config.email.password ? {
      user: config.email.user,
      pass: config.email.password
    } : undefined,
    connectionTimeout: 5000 // 5秒连接超时
  });
};

// 发送邮件
export const sendEmail = async (options: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  attachments?: { filename: string; path: string }[];
  from?: string;
}): Promise<boolean> => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: options.from || config.email.from,
      to: Array.isArray(options.to) ? options.to.join(';') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(';') : options.cc) : undefined,
      subject: options.subject,
      html: options.body,
      attachments: options.attachments || []
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
};

// NCN 相关邮件模板
export const sendNewNCNNotification = async (
  recipients: string[],
  ccRecipients: string[],
  serialNo: string,
  appUrl: string,
  ncnData?: {
    ncnType?: string;
    sbu?: string;
    partId?: string;
    wo?: string;
    defectDescription?: string;
    finder?: string;
    finderDept?: string;
  }
) => {
  const ncnDetailUrl = `${appUrl}/ncn-entry`;
  const mailBody = `
    <div style="font-family: Calibri; max-width: 600px;">
      <h2 style="color: #D64309;">New NCN Created</h2>
      <p>Hello,</p>
      <p>A new <strong>Non-Conformance Notice (NCN)</strong> has been created and assigned to you.</p>

      <table style="width: 100%; border-collapse: collapse; font-family: Calibri; font-size: 11pt; margin: 20px 0;">
        <tr style="background-color: #507CD1; color: white; font-weight: bold;">
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Field</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Value</th>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">NCN Number</td>
          <td style="padding: 10px; border: 1px solid #ddd; color: #D64309; font-weight: bold;">${serialNo}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">NCN Type</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.ncnType || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">SBU</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.sbu || '-'}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Part ID</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.partId || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">WO Number</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.wo || '-'}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Defect Description</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.defectDescription || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Finder</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData?.finder || '-'} (${ncnData?.finderDept || '-'})</td>
        </tr>
      </table>

      <p style="margin-top: 20px;"><strong>Please check the NCN and take necessary actions ASAP.</strong></p>

      <p style="margin-top: 20px;">
        <a href="${ncnDetailUrl}" style="background-color: #507CD1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 12pt;">
          View NCN Details →
        </a>
      </p>

      <p style="color: #666; font-size: 11px; margin-top: 30px;">
        This is an automated notification from NCN Management System.<br/>
        Please do not reply to this email.
      </p>
    </div>
  `;

  return sendEmail({
    to: recipients,
    cc: ccRecipients,
    subject: `[NCN] New NCN ${serialNo} Created - Action Required`,
    body: mailBody
  });
};

export const sendNCNRejectNotification = async (
  recipient: string,
  ccRecipients: string[],
  serialNo: string,
  appUrl: string
) => {
  const mailBody = `
    <div style="font-family: Calibri">
      <p>Hello,</p>
      <p>Please be noticed New NCN <strong>${serialNo}</strong> has been Rejected!</p>
      <p><a href="${appUrl}?SerialNo=${serialNo}">${appUrl}?SerialNo=${serialNo}</a></p>
      <p>Thanks for your time and support!</p>
    </div>
  `;

  return sendEmail({
    to: recipient,
    cc: ccRecipients,
    subject: 'NCN Rejected',
    body: mailBody
  });
};

export const sendNCNActionReminder = async (
  recipient: string,
  actionOwner: string,
  ncnNo: string,
  ncnId: number,
  wo: string,
  part: string,
  ownerAction: string,
  dueDate: string,
  appUrl: string
) => {
  const issueLogUrl = `${appUrl}/issue-log/${ncnId}`;
  const mailBody = `
    <div style="font-family: Calibri">
      <p>Dear ${actionOwner},</p>
      <p>The NCN action has been created to you, please check it ASAP!</p>
      <table style="width: 100%; border-collapse: collapse; font-family: Calibri; font-size: 10pt;">
        <tr style="background-color: #507CD1; color: white; font-weight: bold;">
          <th style="padding: 8px; border: 1px solid #ddd;">NCN</th>
          <th style="padding: 8px; border: 1px solid #ddd;">WO</th>
          <th style="padding: 8px; border: 1px solid #ddd;">Part</th>
          <th style="padding: 8px; border: 1px solid #ddd;">Action</th>
          <th style="padding: 8px; border: 1px solid #ddd;">Due date</th>
        </tr>
        <tr style="background-color: #EFF3FB; text-align: center;">
          <td style="padding: 8px; border: 1px solid #ddd;">${ncnNo}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${wo}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${part}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${ownerAction}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${dueDate}</td>
        </tr>
      </table>
      <p style="margin-top: 20px;"><strong>Click below to view Issue Log:</strong></p>
      <p><a href="${issueLogUrl}" style="font-size: 14pt; color: #507CD1;">Open Issue Log →</a></p>
      <p style="color: #666; font-size: 12px;">${issueLogUrl}</p>
      <p>Thanks for your time and support!</p>
    </div>
  `;

  return sendEmail({
    to: recipient,
    subject: 'New NCN action remind!',
    body: mailBody
  });
};

export const sendQECloseNotification = async (
  recipient: string,
  ncnNo: string,
  appUrl: string
) => {
  const mailBody = `
    <div style="font-family: Calibri">
      <p>Hello ${recipient},</p>
      <p>All action list has been closed for NCN <strong style="color: red;">${ncnNo}</strong>!</p>
      <p>Please check it as soon as possible and close it in time.</p>
      <p><a href="${appUrl}?SerialNo=${ncnNo}">${appUrl}?SerialNo=${ncnNo}</a></p>
      <p>Thanks for your time and support!</p>
    </div>
  `;

  return sendEmail({
    to: recipient,
    subject: 'NCN need to be closed!',
    body: mailBody,
    from: 'NCN@nai-group.com'
  });
};

// NCN 更新通知（发送给 Quality Engineer 和 Owner）
export const sendNCNUpdateNotification = async (
  recipients: string[],
  serialNo: string,
  appUrl: string,
  ncnData: {
    ncnType?: string;
    sbu?: string;
    partId?: string;
    wo?: string;
    defectDescription?: string;
    qualityEngineer?: string;
    owner?: string;
    ownerDept?: string;
    updatedBy?: string;
  }
) => {
  const ncnDetailUrl = `${appUrl}/ncn-entry`;
  const mailBody = `
    <div style="font-family: Calibri; max-width: 600px;">
      <h2 style="color: #D64309;">NCN Updated - Action Required</h2>
      <p>Hello,</p>
      <p>The <strong>Non-Conformance Notice (NCN)</strong> has been updated and assigned to you.</p>

      <table style="width: 100%; border-collapse: collapse; font-family: Calibri; font-size: 11pt; margin: 20px 0;">
        <tr style="background-color: #507CD1; color: white; font-weight: bold;">
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Field</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Value</th>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">NCN Number</td>
          <td style="padding: 10px; border: 1px solid #ddd; color: #D64309; font-weight: bold;">${serialNo}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">NCN Type</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.ncnType || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">SBU</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.sbu || '-'}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Part ID</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.partId || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">WO Number</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.wo || '-'}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Defect Description</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.defectDescription || '-'}</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Quality Engineer</td>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #507CD1;">${ncnData.qualityEngineer || '-'}</td>
        </tr>
        <tr style="background-color: white;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Owner (责任人)</td>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #507CD1;">${ncnData.owner || '-'} (${ncnData.ownerDept || '-'})</td>
        </tr>
        <tr style="background-color: #EFF3FB;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Updated By</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${ncnData.updatedBy || '-'}</td>
        </tr>
      </table>

      <p style="margin-top: 20px;"><strong>Please check the NCN and take necessary actions ASAP.</strong></p>

      <p style="margin-top: 20px;">
        <a href="${ncnDetailUrl}" style="background-color: #507CD1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-size: 12pt;">
          View NCN Details →
        </a>
      </p>

      <p style="color: #666; font-size: 11px; margin-top: 30px;">
        This is an automated notification from NCN Management System.<br/>
        Please do not reply to this email.
      </p>
    </div>
  `;

  return sendEmail({
    to: recipients,
    subject: `[NCN] NCN ${serialNo} Updated - Action Required`,
    body: mailBody
  });
};
