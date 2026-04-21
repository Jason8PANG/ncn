import React, { useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Space, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  FileTextOutlined,
  SolutionOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { authState } from '../state/auth';
import { logout } from '../services/auth';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useRecoilValue(authState);
  const setAuthState = useSetRecoilState(authState);
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const menuItems: MenuProps['items'] = [
    {
      key: '/ncn-kanban',
      icon: <DashboardOutlined />,
      label: <Link to="/ncn-kanban">NCN Kanban</Link>
    },
    {
      key: '/ncn-list',
      icon: <FileTextOutlined />,
      label: <Link to="/ncn-list">NCN List</Link>
    },
    {
      key: '/ncn-entry',
      icon: <SolutionOutlined />,
      label: <Link to="/ncn-entry">NCN Entry</Link>
    },
    // LDAP 测试页面已从菜单移除，代码保留，可通过 /ldap-test 直接访问
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: async () => {
        await logout();
        setAuthState({ isAuthenticated: false, user: null, loading: false });
        navigate('/login');
      }
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 18 : 16,
          fontWeight: 'bold',
          overflow: 'hidden'
        }}>
          {collapsed ? 'NCN' : 'NCN System'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Space>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: 'trigger',
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: 'pointer' }
            })}
          </Space>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <UserOutlined />
              {user?.displayName || user?.lanId}
            </Space>
          </Dropdown>
        </Header>
        <Content style={{
          margin: '24px 16px',
          padding: 24,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          minHeight: 'calc(100vh - 128px)'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
