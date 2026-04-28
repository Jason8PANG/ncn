import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Table, Card, Form, Input, Select, Button, Space, DatePicker, Tag, Typography, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { SearchOutlined, PlusOutlined, EyeOutlined, EditOutlined, CheckCircleOutlined, DeleteOutlined, MoreOutlined, UndoOutlined, DownloadOutlined } from '@ant-design/icons';
import { useRecoilValue } from 'recoil';
import { authState } from '../state/auth';
import { queryNCNs } from '../services/ncn';
import { closeNCNEntry, deleteNCNEntry, reopenNCNEntry } from '../services/entry';
import { Modal, message } from 'antd';
import type { INCN_Entry, INCNQueryParams } from '../types';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function NCNList() {
  const [data, setData] = useState<INCN_Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const { user } = useRecoilValue(authState);
  const navigate = useNavigate();

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
        } else {
          // NCN 已关闭时，显示恢复按钮（只有 QE Owner 或 Admin 可用）
          menuItems.push({
            key: 'reopen',
            icon: <UndoOutlined />,
            label: 'Reopen NCN',
            onClick: () => handleReopenNCN(record)
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
              onClick={() => navigate(`/ncn-entry/${record.ROWID}`)}
            />
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/issue-log/${record.ROWID}`)}
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

  const handleReopenNCN = async (record: INCN_Entry) => {
    Modal.confirm({
      title: 'Reopen NCN',
      content: (
        <div>
          <p>Are you sure you want to reopen NCN <strong>{record.SerialNo}</strong>?</p>
          <p style={{ color: '#faad14', marginTop: 8 }}>This will change the status from Closed back to On-going. Only Quality Engineer or Admin can perform this action.</p>
        </div>
      ),
      okText: 'Yes, Reopen',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await reopenNCNEntry(record.ROWID!);
          if (response.success) {
            message.success(`NCN ${record.SerialNo} has been reopened`);
            // 刷新列表
            handleSearch(form.getFieldsValue());
          } else {
            message.error(response.error || 'Failed to reopen NCN');
          }
        } catch (error: any) {
          message.error(error.response?.data?.error || 'Failed to reopen NCN');
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

  // 导出 Excel 功能
  const handleExportExcel = () => {
    if (data.length === 0) {
      message.warning('No data to export');
      return;
    }

    // 定义导出的列
    const exportColumns = [
      { header: 'Serial No', dataIndex: 'SerialNo' },
      { header: 'Type', dataIndex: 'NCN_Type' },
      { header: 'WO', dataIndex: 'WO' },
      { header: 'Part ID', dataIndex: 'Part_ID' },
      { header: 'Customer', dataIndex: 'Customer' },
      { header: 'SBU', dataIndex: 'SBU_Des' },
      { header: 'Finder', dataIndex: 'Finder' },
      { header: 'Finder Date', dataIndex: 'Finder_Date' },
      { header: 'Status', dataIndex: 'Status' },
      { header: 'Owner', dataIndex: 'Owner' },
      { header: 'Owner Email', dataIndex: 'OwnerEmail' },
      { header: 'Quality Engineer', dataIndex: 'QualityEngineer' },
      { header: 'ME Engineer', dataIndex: 'ME_Engineer' },
      { header: 'Defect Rate', dataIndex: 'DefectRate' },
      { header: 'Defect Description', dataIndex: 'Defect_Description' },
      { header: 'Root Cause', dataIndex: 'Root_Cause' },
      { header: 'Analysis & Assignment', dataIndex: 'Analysis_Assignment' },
      { header: 'Corrective Action', dataIndex: 'Corrective_Action' },
      { header: 'Preventive Action', dataIndex: 'Preventive_Action' },
      { header: 'Close By', dataIndex: 'CloseBy' },
      { header: 'Close Date', dataIndex: 'CloseDate' },
      { header: 'Line Leader', dataIndex: 'LineLeader' },
      { header: 'Comments', dataIndex: 'Comments' }
    ];

    // 转换数据
    const exportData = data.map(row => {
      const newRow: Record<string, any> = {};
      exportColumns.forEach(col => {
        let value = row[col.dataIndex as keyof INCN_Entry];
        // 格式化日期
        if (col.dataIndex === 'Finder_Date' || col.dataIndex === 'CloseDate') {
          value = value ? dayjs(value as string).format('YYYY-MM-DD') : '';
        }
        newRow[col.header] = value ?? '';
      });
      return newRow;
    });

    // 创建工作簿和工作表
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NCN List');

    // 设置列宽
    ws['!cols'] = [
      { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
      { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 30 },
      { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 30 }
    ];

    // 生成文件名
    const fileName = `NCN_Export_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    message.success(`Exported ${data.length} records to ${fileName}`);
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
          onClick={() => navigate('/ncn-entry')}
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
              <Button icon={<DownloadOutlined />} onClick={handleExportExcel}>
                Export
              </Button>
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
