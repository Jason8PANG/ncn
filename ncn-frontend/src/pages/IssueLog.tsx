import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Table, Card, Button, Space, Tag, Form, Input, Select, DatePicker, message, Typography, Divider, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getActions, createAction, updateAction, closeAction, deleteAction } from '../services/action';
import { getOwnerOptions, getNCNEntry } from '../services/entry';
import type { INCN_Action_Detail, INCN_Entry } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

export default function IssueLog() {
  const { id } = useParams();
  const [currentActions, setCurrentActions] = useState<INCN_Action_Detail[]>([]);
  const [futureActions, setFutureActions] = useState<INCN_Action_Detail[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAction, setEditingAction] = useState<INCN_Action_Detail | null>(null);
  const [form] = Form.useForm();
  const [ncnStatus, setNcnStatus] = useState<string>('');

  // Action Department/Owner 联动下拉状态
  const [actionDeptOptions, setActionDeptOptions] = useState<{ value: string; label: string }[]>([]);
  const [actionDeptLoading, setActionDeptLoading] = useState(false);
  const [actionOwnerOptions, setActionOwnerOptions] = useState<{ value: string; label: string }[]>([]);
  const [actionOwnerLoading, setActionOwnerLoading] = useState(false);

  const loadActions = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 先获取 NCN 状态
      try {
        const ncnResponse = await getNCNEntry(parseInt(id, 10));
        if (ncnResponse.success && ncnResponse.data) {
          setNcnStatus(ncnResponse.data.Status || '');
        }
      } catch (ncnError) {
        console.error('Failed to load NCN info:', ncnError);
      }

      const response = await getActions(parseInt(id, 10));
      if (response.success && response.data) {
        setCurrentActions(response.data.currentActions || []);
        setFutureActions(response.data.futureActions || []);
      }
    } catch (error) {
      message.error('Failed to load actions');
    } finally {
      setLoading(false);
    }
  };

  // 加载 Action Department 下拉选项
  const loadActionDeptOptions = async () => {
    setActionDeptLoading(true);
    try {
      const response = await getOwnerOptions();
      if (response.success && response.data?.departments) {
        const deptOpts = response.data.departments.map((d: string) => ({
          value: d,
          label: d
        }));
        setActionDeptOptions(deptOpts);
      }
    } catch (error) {
      message.error('Failed to load Department options');
    } finally {
      setActionDeptLoading(false);
    }
  };

  // 加载 Action Owner 下拉选项（根据部门筛选）
  const loadActionOwnerOptions = async (dept: string) => {
    setActionOwnerLoading(true);
    try {
      const response = await getOwnerOptions(dept);
      if (response.success && response.data?.owners) {
        const options = response.data.owners.map(o => ({
          value: o.lanId,
          label: `${o.lanId} - ${o.name}`
        }));
        setActionOwnerOptions(options);
      } else {
        setActionOwnerOptions([]);
      }
    } catch (error) {
      setActionOwnerOptions([]);
      message.error('Failed to load Owner options');
    } finally {
      setActionOwnerLoading(false);
    }
  };

  useEffect(() => {
    loadActions();
    loadActionDeptOptions();
  }, [id]);

  const handleAddAction = (type: 'C' | 'F') => {
    setEditingAction(null);
    form.resetFields();
    // 重置 Owner 下拉（联动依赖）
    setActionOwnerOptions([]);
    form.setFieldsValue({ Type: type, NCN_ID: parseInt(id!, 10), ActionStatus: 'Open' });
    setModalVisible(true);
  };

  const handleEditAction = (action: INCN_Action_Detail) => {
    setEditingAction(action);
    // 加载 Owner 列表（如果已有部门）
    if (action.ActionDept) {
      loadActionOwnerOptions(action.ActionDept);
    }
    // 预填充表单 - 日期转换为 dayjs 对象
    form.setFieldsValue({
      ...action,
      ActionDuedate: action.ActionDuedate ? dayjs(action.ActionDuedate) : null
    });
    setModalVisible(true);
  };

  const handleCloseAction = async (rowId: number) => {
    try {
      console.log('Closing action:', rowId);
      const response = await closeAction(rowId);
      console.log('Close action response:', JSON.stringify(response));
      if (response?.success) {
        message.success('Action closed successfully');
        // 强制刷新：先清空再加载
        setCurrentActions([]);
        setFutureActions([]);
        loadActions();
      } else {
        console.log('Close failed - error:', response?.error, 'details:', response?.details);
        message.error(response?.error || response?.details || 'Failed to close action');
      }
    } catch (error: any) {
      console.error('Close action error:', error);
      console.error('Error response:', error?.response?.data);
      message.error(error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Failed to close action');
    }
  };

  const handleDeleteAction = async (rowId: number) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to delete this action?',
      onOk: async () => {
        try {
          const response = await deleteAction(rowId);
          console.log('Delete action response:', response);
          if (response?.success) {
            message.success('Action deleted successfully');
            // 从状态中移除被删除的记录
            setCurrentActions(prev => prev.filter(a => a.RowID !== rowId));
            setFutureActions(prev => prev.filter(a => a.RowID !== rowId));
          } else {
            message.error(response?.error || 'Failed to delete action');
          }
        } catch (error: any) {
          console.error('Delete action error:', error);
          message.error(error?.response?.data?.error || error?.message || 'Failed to delete action');
        }
      }
    });
  };

  const handleSave = async (values: any) => {
    try {
      // 格式化日期为 YYYY-MM-DD 格式
      const formatDate = (dateVal: any): string | null => {
        if (!dateVal) return null;
        if (dayjs.isDayjs(dateVal)) {
          return dateVal.format('YYYY-MM-DD');
        }
        if (typeof dateVal === 'string') {
          return dateVal.substring(0, 10);
        }
        return null;
      };

      const data = {
        ...values,
        // 新增时直接使用 URL 中的 NCN ID
        NCN_ID: editingAction?.NCN_ID || parseInt(id!, 10),
        ActionDuedate: formatDate(values.ActionDuedate)
      };

      console.log('Saving action data:', data);

      if (editingAction?.RowID) {
        const response = await updateAction(editingAction.RowID, data);
        console.log('Update action response:', response);
        if (response?.success) {
          message.success('Action updated successfully');
          setModalVisible(false);
          // 强制刷新
          setCurrentActions([]);
          setFutureActions([]);
          loadActions();
        } else {
          message.error(response?.error || response?.details || 'Failed to update action');
        }
      } else {
        const response = await createAction(data);
        console.log('Create action response:', response);
        if (response?.success) {
          message.success('Action created successfully');
          setModalVisible(false);
          // 强制刷新
          setCurrentActions([]);
          setFutureActions([]);
          loadActions();
        } else {
          message.error(response?.error || response?.details || 'Failed to create action');
        }
      }
    } catch (error: any) {
      console.error('Save action error:', error);
      message.error(error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Operation failed');
    }
  };

  const actionColumns: ColumnsType<INCN_Action_Detail> = [
    {
      title: 'Type',
      dataIndex: 'Type',
      key: 'Type',
      width: 80,
      render: (type: 'C' | 'F') => (
        <Tag color={type === 'C' ? 'blue' : 'green'}>{type === 'C' ? 'Current' : 'Future'}</Tag>
      )
    },
    {
      title: 'Action Owner',
      dataIndex: 'ActionOwner',
      key: 'ActionOwner',
      width: 120
    },
    {
      title: 'Analysis',
      dataIndex: 'OwnerAnalysis',
      key: 'OwnerAnalysis',
      width: 200,
      ellipsis: true
    },
    {
      title: 'Action',
      dataIndex: 'OwnerAction',
      key: 'OwnerAction',
      width: 200,
      ellipsis: true
    },
    {
      title: 'Due Date',
      dataIndex: 'ActionDuedate',
      key: 'ActionDuedate',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: 'Status',
      dataIndex: 'ActionStatus',
      key: 'ActionStatus',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'Closed' ? 'green' : 'red'}>{status}</Tag>
      )
    },
    {
      title: 'Create Date',
      dataIndex: 'CreateDate',
      key: 'CreateDate',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: 'Update Date',
      dataIndex: 'UpdateDate',
      key: 'UpdateDate',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: INCN_Action_Detail) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditAction(record)}
          >
            Edit
          </Button>
          {record.ActionStatus !== 'Closed' && (
            <Button
              type="link"
              icon={<CheckOutlined />}
              onClick={() => handleCloseAction(record.RowID!)}
            >
              Close
            </Button>
          )}
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteAction(record.RowID!)}
          >
            Delete
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>Issue Log - NCN {id}</Title>
      </div>

      <Card title="Current Actions (Temporary)" style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleAddAction('C')}
            disabled={ncnStatus === 'Closed'}
          >
            Add Current Action
          </Button>
        </Space>
        <Table
          columns={actionColumns}
          dataSource={currentActions}
          rowKey="RowID"
          pagination={false}
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>

      <Card title="Future Actions (Long-term Measures)" style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleAddAction('F')}
            disabled={ncnStatus === 'Closed'}
          >
            Add Future Action
          </Button>
        </Space>
        <Table
          columns={actionColumns}
          dataSource={futureActions}
          rowKey="RowID"
          pagination={false}
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={editingAction ? 'Edit Action' : 'Add Action'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="Type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="C">Current (Temporary)</Select.Option>
              <Select.Option value="F">Future (Long-term)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ActionDept" label="Action Department">
            <Select
              placeholder="Select Department"
              options={actionDeptOptions}
              loading={actionDeptLoading}
              allowClear
              onChange={(value) => {
                form.setFieldsValue({ ActionOwner: undefined });
                if (value) loadActionOwnerOptions(value);
                else setActionOwnerOptions([]);
              }}
            />
          </Form.Item>
          <Form.Item name="ActionOwner" label="Action Owner" rules={[{ required: true }]}>
            <Select
              placeholder="Select Owner"
              options={actionOwnerOptions}
              loading={actionOwnerLoading}
              disabled={!form.getFieldValue('ActionDept')}
            />
          </Form.Item>
          <Form.Item name="OwnerAnalysis" label="Analysis">
            <TextArea rows={3} placeholder="Analysis details" />
          </Form.Item>
          <Form.Item name="OwnerAction" label="Action" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="Action details" />
          </Form.Item>
          <Form.Item name="ActionDuedate" label="Due Date" rules={[{ required: true, message: 'Please select Due Date' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="ActionStatus" label="Status" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="Open">Open</Select.Option>
              <Select.Option value="Closed">Closed</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">Save</Button>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
