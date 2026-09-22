import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Table, Card, Form, Input, Select, Button, Space, DatePicker, Tag, Typography, Dropdown, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { SearchOutlined, PlusOutlined, EyeOutlined, EditOutlined, CheckCircleOutlined, CheckCircleFilled, DeleteOutlined, MoreOutlined, UndoOutlined, DownloadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useRecoilValue } from 'recoil';
import { authState } from '../state/auth';
import { queryNCNs } from '../services/ncn';
import { closeNCNEntry, deleteNCNEntry, reopenNCNEntry, getSBUDesOptions, getMEEngineerOptions, getQEEngineerOptions, getOwnerOptions } from '../services/entry';
import { Modal, message } from 'antd';
import { downloadAttachment } from '../utils/attachment';
import type { INCN_Entry, INCNQueryParams } from '../types';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const { Title } = Typography;
const { RangePicker } = DatePicker;

/**
 * 筛选条件持久化
 *
 * 场景：用户设好筛选 → 点编辑进 NCN Entry → 返回 NCN List，筛选条件不能丢。
 * 用 sessionStorage（按标签页隔离、关标签页即清）而不是 URL query，
 * 因为返回列表的入口有多处（NCN Entry 的 Back to List / 保存后跳转 / 侧边栏菜单），
 * 它们都不会带上 query，只有本地存储能覆盖所有返回路径。
 */
const FILTER_STORAGE_KEY = 'ncn-list:filter';

/** 把表单值序列化（dayjs 对象转 ISO 字符串，空值丢弃） */
const serializeFilter = (values: any): Record<string, any> => {
  const out: Record<string, any> = {};
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'dateRange' && Array.isArray(value) && value.length === 2) {
      const toIso = (v: any) => (v && typeof v.toISOString === 'function' ? v.toISOString() : String(v));
      out[key] = [toIso(value[0]), toIso(value[1])];
      return;
    }
    if (Array.isArray(value) && value.length === 0) return;
    out[key] = value;
  });
  return out;
};

/** 反序列化（dateRange 的 ISO 字符串还原成 dayjs 对象，否则 RangePicker 显示不出来） */
const deserializeFilter = (raw: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = { ...raw };
  if (Array.isArray(raw?.dateRange) && raw.dateRange.length === 2) {
    out.dateRange = [dayjs(raw.dateRange[0]), dayjs(raw.dateRange[1])];
  }
  return out;
};

const saveFilter = (values: any) => {
  try {
    const payload = serializeFilter(values);
    if (Object.keys(payload).length === 0) {
      sessionStorage.removeItem(FILTER_STORAGE_KEY);
    } else {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // sessionStorage 不可用（隐私模式/被禁用）时静默降级为不持久化
  }
};

const loadSavedFilter = (): Record<string, any> | null => {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) return null;
    return deserializeFilter(parsed);
  } catch {
    return null;
  }
};

const clearSavedFilter = () => {
  try {
    sessionStorage.removeItem(FILTER_STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
};

export default function NCNList() {
  const [data, setData] = useState<INCN_Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form] = Form.useForm();
  const { user } = useRecoilValue(authState);
  const navigate = useNavigate();
  // SBU 筛选选项：来自 NCN_Entry.SBU_Des 的 distinct 值
  const [sbuOptions, setSbuOptions] = useState<{ value: string; label: string }[]>([]);
  // ME / QE / Owner 筛选选项
  const [meOptions, setMeOptions] = useState<{ value: string; label: string }[]>([]);
  const [qeOptions, setQeOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    getSBUDesOptions()
      .then((response) => {
        if (response.success && Array.isArray(response.data)) {
          setSbuOptions((response.data as string[]).map((v) => ({ value: v, label: v })));
        }
      })
      .catch(() => {
        setSbuOptions([]);
      });

    getMEEngineerOptions()
      .then((response) => {
        if (response.success && Array.isArray(response.data)) {
          // 后端返回 [{value,label}] 或 string[]，两种都兼容
          setMeOptions((response.data as any[]).map((item) => ({
            value: item.value || item,
            label: item.label || item
          })));
        }
      })
      .catch(() => setMeOptions([]));

    getQEEngineerOptions()
      .then((response) => {
        if (response.success && Array.isArray(response.data)) {
          setQeOptions((response.data as any[]).map((item) => ({
            value: item.value || item,
            label: item.label || item
          })));
        }
      })
      .catch(() => setQeOptions([]));

    getOwnerOptions()
      .then((response) => {
        if (response.success && Array.isArray(response.data?.owners)) {
          const list = (response.data.owners as { lanId: string; name: string }[]) || [];
          // 筛选下拉的 label 保持「账号 - 姓名」便于在宽下拉里区分同名
          // （列表 Owner 列本身显示账号原值，见 Owner 列定义）
          setOwnerOptions(
            list.map((o) => ({
              value: o.lanId,
              label: `${o.lanId} - ${o.name}`
            }))
          );
        }
      })
      .catch(() => setOwnerOptions([]));
  }, []);

  const columns: ColumnsType<INCN_Entry> = [
    {
      title: 'Att',
      key: 'hasAttachment',
      width: 55,
      align: 'center' as const,
      render: (_: any, record: INCN_Entry) =>
        record.FilePath ? (
          <Tooltip title="Download attachment">
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              icon={<PaperClipOutlined style={{ color: '#507CD1' }} />}
              onClick={(e) => {
                e.stopPropagation();
                void downloadAttachment(record.FilePath as string);
              }}
            />
          </Tooltip>
        ) : null
    },
    {
      // 已维护 NCN Action 的标识（后端按 NCN_Action_Detail 是否存在对应 NCN_ID 计算）
      title: 'Act',
      key: 'hasAction',
      width: 50,
      align: 'center' as const,
      render: (_: any, record: INCN_Entry) =>
        record.HasAction ? (
          <Tooltip title="NCN Action maintained">
            <CheckCircleFilled style={{ color: '#52c41a' }} />
          </Tooltip>
        ) : null
    },
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
      title: 'Defect Description',
      dataIndex: 'Defect_Description',
      key: 'Defect_Description',
      width: 200,
      ellipsis: {
        showTitle: false
      },
      render: (text: string) =>
        text ? (
          <Tooltip title={text} placement="topLeft">
            {text}
          </Tooltip>
        ) : null
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
      title: 'ME',
      dataIndex: 'ME_Engineer',
      key: 'ME_Engineer',
      width: 110
    },
    {
      title: 'QE',
      dataIndex: 'QualityEngineer',
      key: 'QualityEngineer',
      width: 110
    },
    {
      title: 'Owner',
      dataIndex: 'Owner',
      key: 'Owner',
      width: 110
      // 直接显示账号(如 ju.wang)，与本系统 NCN Action 页的 Action Owner 列保持一致
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
              onClick={() => navigate(`/issue-log/${record.ROWID}?from=list`)}
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
    // 记住本次筛选条件，从 NCN Entry / NCN Action 返回列表时自动还原
    saveFilter(values);
    try {
      const params: INCNQueryParams = {};
      if (values.serialNo) params.serialNo = values.serialNo;
      if (values.wo) params.customer = values.wo;
      if (values.partId) params.partId = values.partId;
      if (values.sbu) params.sbuDes = values.sbu;
      if (values.meEngineer) params.meEngineer = values.meEngineer;
      if (values.qualityEngineer) params.qualityEngineer = values.qualityEngineer;
      if (values.owner) params.owner = values.owner;
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
    // 首次进入时还原上次的筛选条件（若有），否则查全部
    const saved = loadSavedFilter();
    if (saved) {
      form.setFieldsValue(saved);
      void handleSearch(saved);
    } else {
      void handleSearch({});
    }
    // 仅在挂载时执行一次；handleSearch / form 为稳定引用，故意不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <Select
              placeholder="Select SBU"
              style={{ width: 180 }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={sbuOptions}
            />
          </Form.Item>
          <Form.Item name="meEngineer" label="ME">
            <Select
              placeholder="Select ME"
              style={{ width: 150 }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={meOptions}
            />
          </Form.Item>
          <Form.Item name="qualityEngineer" label="QE">
            <Select
              placeholder="Select QE"
              style={{ width: 150 }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={qeOptions}
            />
          </Form.Item>
          <Form.Item name="owner" label="Owner">
            <Select
              placeholder="Select Owner"
              style={{ width: 180 }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={ownerOptions}
            />
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
              <Button
                onClick={() => {
                  form.resetFields();
                  clearSavedFilter();
                  setCurrentPage(1);
                  void handleSearch({});
                }}
              >
                Reset
              </Button>
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
            current: currentPage,
            total,
            pageSize,
            showSizeChanger: true,
            showTotal: (t) => `Total ${t} items`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }
          }}
          scroll={{ x: 1500 }}
          size="small"
        />
      </Card>
    </div>
  );
}
