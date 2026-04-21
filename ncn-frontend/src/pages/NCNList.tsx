import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Table, Card, Form, Input, Select, Button, Space, DatePicker, Tag, Typography, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { SearchOutlined, PlusOutlined, EyeOutlined, EditOutlined, CheckCircleOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import { useRecoilValue } from 'recoil';
import { authState } from '../state/auth';
import { queryNCNs } from '../services/ncn';
import { closeNCNEntry, deleteNCNEntry } from '../services/entry';
import { Modal, message } from 'antd';
import type { INCN_Entry, INCNQueryParams } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function NCNList() {
  const [data, setData] = useState<INCN_Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const { user } = useRecoilValue(authState);

  const columns: ColumnsType<INCN_Entry> = [
    {
      title: 'Serial No',
      dataIndex: 'SerialNo',
      key: 'SerialNo',
      width: 120,
      fixed: 'left'
    },
    {
      title: 'Type',
      dataIndex: 'NCN_Type',
      key: 'NCN_Type',
      width: 80,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          'A': 'red',
          'B': 'orange',
          'C': 'blue',
          'D': 'green'
        };
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
      }
    },
    {
      title: 'WO',
      dataIndex: 'WO',
      key: 'WO',
      width: 100
    },
    {
      title: 'Part ID',
      dataIndex: 'Part_ID',
      key: 'Part_ID',
      width: 120
    },
    {
      title: 'Customer',
      dataIndex: 'Customer',
      key: 'Customer',
      width: 100
    },
    {
      title: 'SBU',
      dataIndex: 'SBU_Des',
      key: 'SBU_Des',
      width: 150
    },
    {
      title: 'Finder',
      dataIndex: 'Finder',
      key: 'Finder',
      width: 100
    },
    {
      title: 'Finder Date',
      dataIndex: 'Finder_Date',
      key: 'Finder_Date',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: 'Status',
      dataIndex: 'Status',
      key: 'Status',
      width: 100,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'Closed': 'green',
          'Tracking': 'blue',
          'Cancel': 'default',
          'Reject': 'red',
          'On-going': 'orange'
        };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      }
    },
    {
      title: 'QE',
      dataIndex: 'QualityEngineer',
      key: 'QualityEngineer',
      width: 100
    },
    {
      title: 'Action',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_: any, record: INCN_Entry) => {
        // 构建更多操作菜单
        const menuItems: MenuProps['items'] = [];
        
        if (record.Status !== 'Closed') {
          menuItems.push({
            key: 'close',
            icon: <CheckCircleOutlined />,
            label: 'Close NCN',
            danger: true,
            onClick: () => handleCloseNCN(record)
          });
        }
        
        if (user?.isAdmin) {
          menuItems.push({
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete NCN',
            danger: true,
            onClick: () => handleDeleteNCN(record)
          });
        }

        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => window.location.href = `/ncn-entry/${record.ROWID}`}
            />
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => window.location.href = `/issue-log/${record.ROWID}`}
            />
            {menuItems.length > 0 && (
              <Dropdown
                menu={{ items: menuItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<MoreOutlined />}
                />
              </Dropdown>
            )}
          </Space>
        );
      }
    }
  ];

  const handleCloseNCN = async (record: INCN_Entry) => {
    Modal.confirm({
      title: 'Close NCN',
      content: `Are you sure you want to close NCN ${record.SerialNo}?`,
      okText: 'Yes, Close',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await closeNCNEntry(record.ROWID!);
          if (response.success) {
            message.success(`NCN ${record.SerialNo} has been closed`);
            // 刷新列表
            handleSearch(form.getFieldsValue());
          } else {
            message.error(response.error || 'Failed to close NCN');
          }
        } catch (error: any) {
          message.error(error.response?.data?.error || 'Failed to close NCN');
        }
      }
    });
  };

  const handleDeleteNCN = async (record: INCN_Entry) => {
    Modal.confirm({
      title: 'Delete NCN',
      content: (
        <div>
          <p>Are you sure you want to delete NCN <strong>{record.SerialNo}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>This will also delete all associated actions. This action cannot be undone.</p>
        </div>
      ),
      okText: 'Yes, Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await deleteNCNEntry(record.ROWID!);
          if (response.success) {
            message.success(`NCN ${record.SerialNo} has been deleted`);
            // 刷新列表
            handleSearch(form.getFieldsValue());
          } else {
            message.error(response.error || 'Failed to delete NCN');
          }
        } catch (error: any) {
          message.error(error.response?.data?.error || 'Failed to delete NCN');
        }
      }
    });
  };

  const handleSearch = async (values: any) => {
    setLoading(true);
    try {
      const params: INCNQueryParams = {};
      if (values.serialNo) params.serialNo = values.serialNo;
      if (values.wo) params.customer = values.wo;
      if (values.partId) params.partId = values.partId;
      if (values.sbu) params.sbu = values.sbu;
      if (values.status) params.status = values.status;
      if (values.dateRange && values.dateRange.length === 2) {
        params.dateFrom = values.dateRange[0].format('YYYY-MM-DD');
        params.dateTo = values.dateRange[1].format('YYYY-MM-DD');
      }

      const response = await queryNCNs(params);
      if (response.success && response.data) {
        setData(response.data.entries);
        setTotal(response.data.total);
      }
    } catch (error) {
      console.error('Failed to fetch NCNs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch({});
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>NCN List</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => window.location.href = '/ncn-entry'}
        >
          New NCN
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="serialNo" label="Serial No">
            <Input placeholder="Search by serial no" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="partId" label="Part ID">
            <Input placeholder="Part ID" style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="sbu" label="SBU">
            <Select placeholder="Select SBU" style={{ width: 150 }} allowClear>
              <Select.Option value="S&N">S&N</Select.Option>
              <Select.Option value="HVLM">HVLM</Select.Option>
              <Select.Option value="Cleanroom">Cleanroom</Select.Option>
              <Select.Option value="Copper">Copper</Select.Option>
              <Select.Option value="Clean room">Clean room</Select.Option>
              <Select.Option value="Fiber">Fiber</Select.Option>
              <Select.Option value="Aero">Aero</Select.Option>
              <Select.Option value="Medical-HMLV">Medical-HMLV</Select.Option>
              <Select.Option value="SPO2">SPO2</Select.Option>
              <Select.Option value="Industrial">Industrial</Select.Option>
              <Select.Option value="COE">COE</Select.Option>
              <Select.Option value="P2-Industrial">P2-Industrial</Select.Option>
              <Select.Option value="Cor">Cor</Select.Option>
              <Select.Option value="Penang-Industrial">Penang-Industrial</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select placeholder="Select Status" style={{ width: 120 }} allowClear>
              <Select.Option value="Closed">Closed</Select.Option>
              <Select.Option value="Tracking">Tracking</Select.Option>
              <Select.Option value="Cancel">Cancel</Select.Option>
              <Select.Option value="Reject">Reject</Select.Option>
              <Select.Option value="On-going">On-going</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="dateRange" label="Date Range">
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                Search
              </Button>
              <Button onClick={() => form.resetFields()}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="ROWID"
          pagination={{
            total,
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (t) => `Total ${t} items`
          }}
          scroll={{ x: 1100 }}
          size="small"
        />
      </Card>
    </div>
  );
}
