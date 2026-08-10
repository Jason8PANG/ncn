import { useState, useEffect } from 'react';
import {
  Table, Card, Form, Input, Select, Button, Space, Tag, Modal, message, Typography, Divider
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  queryCodeTable,
  getCodeTableCategories,
  createCodeTableRecord,
  updateCodeTableRecord,
  deleteCodeTableRecord,
  type ICodeTableRecord
} from '../services/codetable';

const { Title } = Typography;
const { TextArea } = Input;

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Close', label: 'Close' }
];

export default function CodeTable() {
  const [data, setData] = useState<ICodeTableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchForm] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ICodeTableRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const values = searchForm.getFieldsValue();
      const response = await queryCodeTable({
        category: values.category,
        keyword: values.keyword,
        status: values.status
      });
      if (response.success && Array.isArray(response.data)) {
        setData(response.data as ICodeTableRecord[]);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Failed to load code table');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getCodeTableCategories();
      if (response.success && Array.isArray(response.data)) {
        setCategories(response.data as string[]);
      }
    } catch {
      // 忽略，下拉为空时用户仍可手动输入
    }
  };

  useEffect(() => {
    loadData();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ Status: 'Active' });
    setModalVisible(true);
  };

  const handleEdit = (record: ICodeTableRecord) => {
    setEditing(record);
    form.setFieldsValue({
      Code_Category: record.Code_Category,
      Code: record.Code,
      Code_Description: record.Code_Description,
      Status: record.Status,
      Note: record.Note,
      remark: record.remark
    });
    setModalVisible(true);
  };

  const handleDelete = (record: ICodeTableRecord) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Delete record "${record.Code_Description}" (ID=${record.ID})? This may affect NCN forms using this option.`,
      okText: 'Yes, Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await deleteCodeTableRecord(record.ID);
          if (response.success) {
            message.success('Record deleted');
            loadData();
          } else {
            message.error(response.error || 'Failed to delete record');
          }
        } catch (error: any) {
          message.error(error?.response?.data?.error || 'Failed to delete record');
        }
      }
    });
  };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      if (editing) {
        const response = await updateCodeTableRecord(editing.ID, values);
        if (response.success) {
          message.success('Record updated');
          setModalVisible(false);
          loadData();
        } else {
          message.error(response.error || 'Failed to update record');
        }
      } else {
        const response = await createCodeTableRecord(values);
        if (response.success) {
          message.success('Record created');
          setModalVisible(false);
          loadData();
        } else {
          message.error(response.error || 'Failed to create record');
        }
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ICodeTableRecord> = [
    {
      title: 'ID',
      dataIndex: 'ID',
      key: 'ID',
      width: 70
    },
    {
      title: 'Code Category',
      dataIndex: 'Code_Category',
      key: 'Code_Category',
      width: 160,
      render: (v: string) => <Tag color="blue">{v}</Tag>
    },
    {
      title: 'Code',
      dataIndex: 'Code',
      key: 'Code',
      width: 140
    },
    {
      title: 'Description',
      dataIndex: 'Code_Description',
      key: 'Code_Description',
      ellipsis: true
    },
    {
      title: 'Status',
      dataIndex: 'Status',
      key: 'Status',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'Active' ? 'green' : 'red'}>{v}</Tag>
      )
    },
    {
      title: 'Note',
      dataIndex: 'Note',
      key: 'Note',
      width: 140,
      ellipsis: true
    },
    {
      title: 'Remark',
      dataIndex: 'remark',
      key: 'remark',
      width: 140,
      ellipsis: true
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_: any, record: ICodeTableRecord) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            Delete
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <Title level={3} style={{ marginBottom: 0 }}>Code Table Maintenance (NCN Parameters)</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add Record
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Form form={searchForm} layout="inline" onFinish={loadData}>
          <Form.Item name="category" label="Category">
            <Select
              placeholder="All NCN Categories"
              style={{ width: 200 }}
              allowClear
              options={categories.map(c => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select
              placeholder="All"
              style={{ width: 120 }}
              allowClear
              options={STATUS_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="keyword" label="Keyword">
            <Input placeholder="Search description / code" style={{ width: 220 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                Search
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  searchForm.resetFields();
                  loadData();
                }}
              >
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          rowKey="ID"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `Total ${t} records` }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={editing ? `Edit Record (ID=${editing.ID})` : 'Add Record'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="Code_Category" label="Code Category" rules={[{ required: true, message: 'Please select category' }]}>
            <Select
              placeholder="Select Category"
              options={categories.map(c => ({ value: c, label: c }))}
              disabled={!!editing}
            />
          </Form.Item>
          <Form.Item name="Code" label="Code">
            <Input placeholder="Group code (e.g. issue type group), optional" />
          </Form.Item>
          <Form.Item name="Code_Description" label="Description" rules={[{ required: true, message: 'Please input description' }]}>
            <Input placeholder="Option display text" />
          </Form.Item>
          <Form.Item name="Status" label="Status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="Note" label="Note">
            <Input placeholder="Note (optional)" />
          </Form.Item>
          <Form.Item name="remark" label="Remark">
            <TextArea rows={2} placeholder="Remark (optional)" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
