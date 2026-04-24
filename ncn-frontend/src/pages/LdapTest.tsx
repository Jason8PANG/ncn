import { useState } from 'react';
import { Form, Input, Button, Card, message, Alert, Space, Tag, Descriptions, Spin } from 'antd';
import { UserOutlined, LockOutlined, LinkOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import axios from 'axios';

// Use relative path for Docker, or env var for local dev
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function LdapTest() {
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testType, setTestType] = useState<'connection' | 'auth'>('connection');
  const [ldapConfig, setLdapConfig] = useState<any>(null);

  // 获取 LDAP 配置
  const fetchLdapConfig = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/auth/test-ldap`, { testType: 'config' });
      if (response.data.success) {
        setLdapConfig(response.data.config);
        message.success('LDAP 配置加载成功');
      }
    } catch (error: any) {
      message.error('获取 LDAP 配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 测试 LDAP 连接
  const testConnection = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const response = await axios.post(`${API_BASE}/auth/test-ldap`, {
        testType: 'connection'
      });
      setTestResult(response.data);
      if (response.data.success) {
        message.success('LDAP 连接测试成功');
      } else {
        message.error('LDAP 连接测试失败');
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: '网络错误',
        error: error.message
      });
      message.error('测试请求失败');
    } finally {
      setLoading(false);
    }
  };

  // 测试用户认证
  const testAuth = async (values: { username: string; password: string }) => {
    setLoading(true);
    setTestResult(null);
    try {
      const response = await axios.post(`${API_BASE}/auth/test-ldap`, {
        testType: 'auth',
        username: values.username,
        password: values.password
      });
      setTestResult(response.data);
      if (response.data.success) {
        message.success('LDAP 认证成功');
      } else {
        message.error('LDAP 认证失败');
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: '网络错误',
        error: error.message
      });
      message.error('测试请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: 40
    }}>
      <Space direction="vertical" size="large" style={{ width: 600 }}>
        {/* LDAP 配置信息 */}
        <Card
          title={<><SafetyCertificateOutlined /> LDAP 配置信息</>}
          extra={
            <Button onClick={fetchLdapConfig} loading={loading && !testResult}>
              加载配置
            </Button>
          }
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        >
          {ldapConfig ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="LDAP URL">{ldapConfig.url}</Descriptions.Item>
              <Descriptions.Item label="Base DN">{ldapConfig.baseDN}</Descriptions.Item>
              <Descriptions.Item label="Bind DN">{ldapConfig.bindDN}</Descriptions.Item>
              <Descriptions.Item label="Search Filter">{ldapConfig.searchFilter}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Alert message='点击"加载配置"查看 LDAP 配置' type="info" showIcon />
          )}
        </Card>

        {/* 连接测试 */}
        <Card
          title={<><LinkOutlined /> LDAP 连接测试</>}
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        >
          <Button
            type="primary"
            size="large"
            block
            loading={loading && testType === 'connection'}
            onClick={testConnection}
            icon={<LinkOutlined />}
          >
            测试 LDAP 服务器连接
          </Button>
        </Card>

        {/* 认证测试 */}
        <Card
          title={<><UserOutlined /> LDAP 用户认证测试</>}
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        >
          <Form
            name="ldap-test"
            onFinish={testAuth}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              label="LAN ID"
              rules={[{ required: true, message: '请输入 LAN ID' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="例如：zhangsan" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading && testType === 'auth'}
                block
                size="large"
                icon={<SafetyCertificateOutlined />}
              >
                测试用户认证
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 测试结果显示 */}
        {loading && !testResult && (
          <Card style={{ textAlign: 'center' }}>
            <Spin size="large" tip="正在测试..." />
          </Card>
        )}

        {testResult && (
          <Card
            title="测试结果"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              borderColor: testResult.success ? '#52c41a' : '#ff4d4f'
            }}
          >
            <Alert
              message={testResult.message}
              type={testResult.success ? 'success' : 'error'}
              showIcon
              style={{ marginBottom: 16 }}
            />

            {testResult.success && testResult.user && (
              <Descriptions title="用户信息" column={1} bordered size="small">
                <Descriptions.Item label="LAN ID">{testResult.user.sAMAccountName}</Descriptions.Item>
                <Descriptions.Item label="姓名">{testResult.user.displayName}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{testResult.user.mail}</Descriptions.Item>
                <Descriptions.Item label="部门">{testResult.user.department}</Descriptions.Item>
              </Descriptions>
            )}

            {testResult.config && (
              <Descriptions title="连接配置" column={1} bordered size="small" style={{ marginTop: 16 }}>
                <Descriptions.Item label="LDAP URL">{testResult.config.url}</Descriptions.Item>
                {testResult.config.baseDN && (
                  <Descriptions.Item label="Base DN">{testResult.config.baseDN}</Descriptions.Item>
                )}
                {testResult.config.bindDN && (
                  <Descriptions.Item label="Bind DN">{testResult.config.bindDN}</Descriptions.Item>
                )}
              </Descriptions>
            )}

            {testResult.error && (
              <Alert
                message="错误详情"
                description={testResult.error}
                type="error"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}

            {testResult.entriesFound !== undefined && (
              <div style={{ marginTop: 16 }}>
                <Tag color="green">找到 {testResult.entriesFound} 条 LDAP 记录</Tag>
              </div>
            )}
          </Card>
        )}
      </Space>
    </div>
  );
}
