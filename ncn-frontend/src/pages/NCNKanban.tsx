import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, Statistic, Typography, Table, Tag } from 'antd';
import {
  BarChartOutlined,
  PieChartOutlined,
  TeamOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { Bar, Pie, Line } from '@ant-design/charts';
import { api } from '../utils/request';

const { Title } = Typography;

interface NCNStats {
  total: number;
  open: number;
  closed: number;
  reject: number;
}

interface MonthlyData {
  month: string;
  count: number;
  avgDefectRate: number;
}

interface StatusData {
  status: string;
  count: number;
}

interface DeptData {
  dept: string;
  count: number;
}

interface IssueTypeData {
  issueType: string;
  count: number;
}

interface WeeklyData {
  week: string;
  count: number;
}

interface INCNEntry {
  ROWID: number;
  SerialNo: string;
  SBU: string;
  Customer: string;
  Status: string;
  Finder_Date: string;
  Defect_Description: string;
}

export default function NCNKanban() {
  const [sbuOptions, setSbuOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedSBU, setSelectedSBU] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<NCNStats>({ total: 0, open: 0, closed: 0, reject: 0 });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [deptData, setDeptData] = useState<DeptData[]>([]);
  const [issueTypeData, setIssueTypeData] = useState<IssueTypeData[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [recentNCN, setRecentNCN] = useState<INCNEntry[]>([]);

  // 加载 SBU 选项
  useEffect(() => {
    loadSBUOptions();
  }, []);

  // 加载数据
  useEffect(() => {
    loadKanbanData();
  }, [selectedSBU]);

  const loadSBUOptions = async () => {
    try {
      // 从 /entry/sbu/options 获取 SBU 选项
      const response = await api.get('/entry/sbu/options');
      if (response.data.success && response.data.data) {
        const sbus = Array.isArray(response.data.data) ? response.data.data : [];
        const options = sbus.map((sbu: string) => ({
          value: sbu,
          label: sbu
        }));
        setSbuOptions(options);
      }
    } catch (error) {
      console.error('Failed to load SBU options:', error);
    }
  };

  const loadKanbanData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedSBU) {
        params.sbu = selectedSBU;
      }

      // 获取所有 NCN 数据
      console.log('Request params:', params);
      const response = await api.get('/ncn', { params });
      console.log('Full response:', JSON.stringify(response.data, null, 2).substring(0, 1000));
      const data = response.data.data?.entries || [];
      console.log('NCN data loaded:', data.length, 'records');

      // 计算统计数据
      const total = data.length;
      const open = data.filter((n: any) => n.Status === 'On-going').length;
      const closed = data.filter((n: any) => n.Status === 'Closed').length;
      const reject = data.filter((n: any) => n.Status === 'Reject').length;
      setStats({ total, open, closed, reject });

      // 按月份统计
      const monthlyMap = new Map<string, { count: number; defectRates: number[] }>();
      data.forEach((n: any) => {
        if (n.Finder_Date) {
          const month = n.Finder_Date.substring(0, 7); // YYYY-MM
          const existing = monthlyMap.get(month) || { count: 0, defectRates: [] };
          existing.count++;
          if (n.Defect_Rate) {
            const rate = parseFloat(n.Defect_Rate.replace('%', '')) || 0;
            existing.defectRates.push(rate);
          }
          monthlyMap.set(month, existing);
        }
      });
      const monthly: MonthlyData[] = [];
      monthlyMap.forEach((value, month) => {
        const avgRate = value.defectRates.length > 0
          ? value.defectRates.reduce((a, b) => a + b, 0) / value.defectRates.length
          : 0;
        monthly.push({ month, count: value.count, avgDefectRate: parseFloat(avgRate.toFixed(2)) });
      });
      monthly.sort((a, b) => a.month.localeCompare(b.month));
      setMonthlyData(monthly.slice(-12)); // 最近12个月

      // 按状态分布
      const statusMap = new Map<string, number>();
      data.forEach((n: any) => {
        const statusValue = n.Status || 'Unknown';
        statusMap.set(statusValue, (statusMap.get(statusValue) || 0) + 1);
      });
      const statusList: StatusData[] = [];
      statusMap.forEach((count, statusValue) => {
        statusList.push({ status: statusValue, count });
      });
      setStatusData(statusList);

      // 按责任部门统计
      const deptMap = new Map<string, number>();
      data.forEach((n: any) => {
        if (n.OwnerDept) {
          deptMap.set(n.OwnerDept, (deptMap.get(n.OwnerDept) || 0) + 1);
        }
      });
      const deptList: DeptData[] = [];
      deptMap.forEach((count, deptValue) => {
        deptList.push({ dept: deptValue, count });
      });
      deptList.sort((a, b) => b.count - a.count);
      setDeptData(deptList.slice(0, 10)); // Top 10

      // 按问题类型统计
      const issueMap = new Map<string, number>();
      data.forEach((n: any) => {
        if (n.Issue_Type) {
          issueMap.set(n.Issue_Type, (issueMap.get(n.Issue_Type) || 0) + 1);
        }
      });
      const issueType: IssueTypeData[] = [];
      issueMap.forEach((count, issueTypeName) => {
        issueType.push({ issueType: issueTypeName, count });
      });
      issueType.sort((a, b) => b.count - a.count);
      setIssueTypeData(issueType.slice(0, 5)); // Top 5

      // 按周统计
      const weeklyMap = new Map<string, number>();
      data.forEach((n: any) => {
        if (n.Week) {
          weeklyMap.set(n.Week, (weeklyMap.get(n.Week) || 0) + 1);
        }
      });
      const weekly: WeeklyData[] = [];
      weeklyMap.forEach((count, week) => {
        weekly.push({ week, count });
      });
      weekly.sort((a, b) => a.week.localeCompare(b.week));
      setWeeklyData(weekly.slice(-8)); // 最近8周

      // 本周新增 NCN
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekStartStr = weekStart.toISOString().substring(0, 10);
      const recent = data
        .filter((n: any) => n.Finder_Date && n.Finder_Date >= weekStartStr)
        .sort((a: any, b: any) => new Date(b.Finder_Date).getTime() - new Date(a.Finder_Date).getTime())
        .slice(0, 10);
      setRecentNCN(recent);

      console.log('Stats:', { total, open, closed, reject });
      console.log('MonthlyData:', monthlyData);
      console.log('StatusData:', statusData);

    } catch (error) {
      console.error('Failed to load kanban data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 图表配置
  const lineConfig = {
    data: monthlyData,
    xField: 'month',
    yField: 'count',
    label: { position: 'top' as const },
    point: { size: 5, shape: 'diamond' as const },
    color: '#1890ff',
  };

  const defectRateConfig = {
    data: monthlyData,
    xField: 'month',
    yField: 'avgDefectRate',
    label: { position: 'top' as const },
    point: { size: 5, shape: 'circle' as const },
    color: '#52c41a',
  };

  const pieConfig = {
    data: statusData,
    angleField: 'count',
    colorField: 'status',
    radius: 0.8,
    label: {
      type: 'outer' as const,
      content: '{percentage}',
    },
    legend: { position: 'right' as const },
    color: ['#1890ff', '#52c41a', '#ff4d4f', '#faad14'],
  };

  const deptConfig = {
    data: deptData,
    xField: 'count',
    yField: 'dept',
    legend: { position: 'top' as const },
    colorField: 'count',
    color: ['#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d'],
  };

  const issueConfig = {
    data: issueTypeData,
    xField: 'count',
    yField: 'issueType',
    colorField: 'issueType',
    color: ['#f5222d', '#fa541c', '#faad14', '#52c41a', '#1890ff'],
  };

  const recentColumns = [
    {
      title: 'Serial No',
      dataIndex: 'SerialNo',
      key: 'SerialNo',
      width: 140,
    },
    {
      title: 'SBU',
      dataIndex: 'SBU',
      key: 'SBU',
      width: 100,
    },
    {
      title: 'Customer',
      dataIndex: 'Customer',
      key: 'Customer',
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'Status',
      key: 'Status',
      width: 100,
      render: (status: string) => {
        const color = status === 'On-going' ? 'blue' : status === 'Closed' ? 'green' : status === 'Reject' ? 'red' : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Defect Description',
      dataIndex: 'Defect_Description',
      key: 'Defect_Description',
      ellipsis: true,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>NCN Kanban</Title>
        <Select
          placeholder="Select SBU"
          style={{ width: 200 }}
          allowClear
          value={selectedSBU}
          onChange={setSelectedSBU}
          options={sbuOptions}
        />
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Total NCN"
              value={stats.total}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="On-going"
              value={stats.open}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Closed"
              value={stats.closed}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Reject"
              value={stats.reject}
              prefix={<PieChartOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 趋势图 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Monthly NCN Count" loading={loading}>
            <Line {...lineConfig} height={250} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Monthly Avg Defect Rate (%)" loading={loading}>
            <Line {...defectRateConfig} height={250} />
          </Card>
        </Col>
      </Row>

      {/* 分布图 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card title="Status Distribution" loading={loading}>
            <Pie {...pieConfig} height={250} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Top 10 Owner Departments" loading={loading}>
            <Bar {...deptConfig} height={250} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Top 5 Issue Types" loading={loading}>
            <Bar {...issueConfig} height={250} />
          </Card>
        </Col>
      </Row>

      {/* 本周新增 */}
      <Card title="This Week's New NCN" loading={loading}>
        <Table
          columns={recentColumns}
          dataSource={recentNCN}
          rowKey="ROWID"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
