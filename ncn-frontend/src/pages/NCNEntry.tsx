import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Row, Col, DatePicker, message, Typography, Divider, Space } from 'antd';
import { SaveOutlined, RollbackOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useRecoilValue } from 'recoil';
import { authState } from '../state/auth';
import {
  getNCNEntry,
  createNCNEntry,
  updateNCNEntry,
  generateSerialNo,
  lookupStaffByEmpId,
  getSBUOptions,
  getSBUDescriptionOptions,
  getOwnerOptions,
  getMEEngineerOptions,
  getQEEngineerOptions,
  getIssueTypeOptions,
  getDeepAnalysisOptions
} from '../services/entry';
import type { INCN_Entry } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

const NCN_TYPES = [
  { value: 'A', label: 'A' },
  { value: 'F', label: 'F' },
  { value: 'P', label: 'P' },
  { value: 'L', label: 'L' },
  { value: 'B', label: 'B' }
];

export default function NCNEntry() {
  const { id } = useParams();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sbuOptions, setSbuOptions] = useState<{ value: string; label: string }[]>([]);
  const [sbuDesOptions, setSbuDesOptions] = useState<{ value: string; label: string }[]>([]);
  const [finderName, setFinderName] = useState('');
  const [finderLookupMessage, setFinderLookupMessage] = useState('');
  const [lineLeaderName, setLineLeaderName] = useState('');
  const [lineLeaderLookupMessage, setLineLeaderLookupMessage] = useState('');
  const [ownerDeptOptions, setOwnerDeptOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerDeptLoading, setOwnerDeptLoading] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [meOptions, setMeOptions] = useState<{ value: string; label: string }[]>([]);
  const [qeOptions, setQeOptions] = useState<{ value: string; label: string }[]>([]);
  const [issueTypeOptions, setIssueTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [deepAnalysisOptions, setDeepAnalysisOptions] = useState<{ value: string; label: string }[]>([]);
  const { user } = useRecoilValue(authState);

  useEffect(() => {
    if (id) {
      loadEntry(parseInt(id, 10));
    } else {
      requestLatestSerialNo();
    }
    loadSBUOptions();
    loadOwnerDeptOptions();
    loadMEEngineerOptions();
    loadQEEngineerOptions();
    loadIssueTypeOptions();
  }, [id]);

  const loadSBUOptions = async () => {
    try {
      const response = await getSBUOptions();
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map(item => ({ value: item, label: item }));
        setSbuOptions(options);
      }
    } catch (error) {
      message.error('Failed to load SBU options');
    }
  };

  const loadOwnerDeptOptions = async () => {
    setOwnerDeptLoading(true);
    try {
      const response = await getOwnerOptions();
      if (response.success && response.data?.departments) {
        const deptOpts = response.data.departments.map((d: string) => ({
          value: d,
          label: d
        }));
        setOwnerDeptOptions(deptOpts);
        form.setFieldsValue({
          OwnerDept: form.getFieldValue('OwnerDept') || undefined,
        });
      }
    } catch (error) {
      message.error('Failed to load Owner Dept options');
    } finally {
      setOwnerDeptLoading(false);
    }
  };

  const loadOwnerOptions = async (dept: string) => {
    setOwnerLoading(true);
    try {
      const response = await getOwnerOptions(dept);
      if (response.success && response.data?.owners) {
        const options = response.data.owners.map((o: any) => ({
          value: o.lanId,
          label: `${o.lanId} - ${o.name}`
        }));
        setOwnerOptions(options);
      } else {
        setOwnerOptions([]);
      }
    } catch (error) {
      setOwnerOptions([]);
      message.error('Failed to load Owner options');
    } finally {
      setOwnerLoading(false);
    }
  };

  const loadMEEngineerOptions = async () => {
    try {
      const response = await getMEEngineerOptions();
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map((item: any) => ({
          value: item.value || item,
          label: item.label || item
        }));
        setMeOptions(options);
      }
    } catch (error) {
      message.error('Failed to load ME Engineer options');
    }
  };

  const loadQEEngineerOptions = async () => {
    try {
      const response = await getQEEngineerOptions();
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map((item: any) => ({
          value: item.value || item,
          label: item.label || item
        }));
        setQeOptions(options);
      }
    } catch (error) {
      message.error('Failed to load QE Engineer options');
    }
  };

  const loadIssueTypeOptions = async () => {
    try {
      const response = await getIssueTypeOptions();
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map((item: any) => ({
          value: item.Code,
          label: item.Code
        }));
        setIssueTypeOptions(options);
      }
    } catch (error) {
      message.error('Failed to load Issue Type options');
    }
  };

  const loadDeepAnalysisOptions = async (issueType: string) => {
    if (!issueType) {
      setDeepAnalysisOptions([]);
      form.setFieldsValue({ Deep_Annlysis: undefined });
      return;
    }
    try {
      const response = await getDeepAnalysisOptions(issueType);
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map((item: string) => ({ value: item, label: item }));
        setDeepAnalysisOptions(options);
        // 只有一个选项时自动填入
        if (options.length === 1) {
          form.setFieldsValue({ Deep_Annlysis: options[0].value });
        } else {
          form.setFieldsValue({ Deep_Annlysis: undefined });
        }
      } else {
        setDeepAnalysisOptions([]);
      }
    } catch (error) {
      setDeepAnalysisOptions([]);
    }
  };

  const requestLatestSerialNo = async () => {
    try {
      const response = await generateSerialNo();
      if (response.success && response.serialNo) {
        form.setFieldsValue({ SerialNo: response.serialNo });
      }
    } catch (error) {
      message.error('Failed to generate serial number');
    }
  };

  const loadEntry = async (ncnId: number) => {
    setLoading(true);
    try {
      const response = await getNCNEntry(ncnId);
      if (response.success && response.data) {
        const data = { ...response.data };
        console.log('[DEBUG] loadEntry response.data:', JSON.stringify(data, null, 2));
        if (data.Finder_Date) {
          (data as any).Finder_Date = dayjs(data.Finder_Date);
        }
        // 编辑模式：移除 FinderEmpId 和 LineLeaderEmpId（它们是前端虚拟字段，编辑时不需要）
        const { FinderEmpId, LineLeaderEmpId, ...restData } = data as any;
        form.setFieldsValue(restData);
        setFinderName(data.Finder || '');
        setFinderLookupMessage('');
        setLineLeaderName(data.LineLeader || '');
        setLineLeaderLookupMessage('');
        if (data.SBU) {
          loadSBUDescriptionOptions(data.SBU);
        } else {
          setSbuDesOptions([]);
        }
        if (data.OwnerDept) {
          loadOwnerOptions(data.OwnerDept).then(() => {
            // 回填 Owner（编辑模式下，Owner 值需要与新的选项格式匹配）
            if (data.Owner) {
              const ownerOpt = ownerOptions.find(o => o.label.startsWith(data.Owner));
              if (ownerOpt) {
                form.setFieldsValue({ Owner: ownerOpt.value });
              }
            }
          });
        }
        if (data.Issue_Type) {
          loadDeepAnalysisOptions(data.Issue_Type).then(() => {
            // 回填 Deep_Annlysis（等选项加载完后再设值）
            if (data.Deep_Annlysis) {
              form.setFieldsValue({ Deep_Annlysis: data.Deep_Annlysis });
            }
          });
        }
      }
    } catch (error) {
      message.error('Failed to load NCN entry');
      console.error('[DEBUG] loadEntry error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSBUDescriptionOptions = async (sbu: string) => {
    if (!sbu) {
      setSbuDesOptions([]);
      return;
    }

    try {
      const response = await getSBUDescriptionOptions(sbu);
      if (response.success && Array.isArray(response.data)) {
        const options = response.data.map(item => ({ value: item, label: item }));
        setSbuDesOptions(options);

        if (options.length === 1) {
          form.setFieldsValue({ SBU_Des: options[0].value });
        }
      } else {
        setSbuDesOptions([]);
      }
    } catch (error) {
      setSbuDesOptions([]);
      message.error('Failed to load SBU description options');
    }
  };

  const handleGenerateSerialNo = async () => {
    await requestLatestSerialNo();
    message.success('Serial number generated');
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 创建模式下验证 Finder（编辑模式下 Finder 是从数据库加载的）
      if (!id && !values.Finder) {
        message.error('Finder employee info not found, please enter a valid employee ID');
        setLoading(false);
        return;
      }

      // 验证 LineLeader（只有创建模式且输入了 EmpId 时才验证）
      if (!id && values.LineLeaderEmpId && !values.LineLeader) {
        message.error('Line Leader employee info not found, please enter a valid employee ID');
        setLoading(false);
        return;
      }

      // ME_Engineer 和 QualityEngineer 直接存储 Code_Description（从 Code_Table 获取）
      // Owner 需要通过 Lan_ID 获取邮箱
      const getEmailByLanId = async (lanId: string): Promise<string> => {
        if (!lanId) return '';
        try {
          const response = await lookupStaffByEmpId(lanId);
          return response?.data?.Email_Addr || '';
        } catch {
          return '';
        }
      };

      // 移除 EmpId 字段
      // 编辑时也移除 SerialNo（不允许修改）和 UpdateBy（后端自动设置）
      const { FinderEmpId, LineLeaderEmpId, SerialNo, ...restValues } = values;

      // 格式化日期为 MM/DD/YYYY 格式
      const formatDate = (d: any) => {
        if (!d) return '';
        const date = dayjs(d);
        return date.format('MM/DD/YYYY');
      };

      // 只为 Owner 获取邮箱
      const ownerEmail = await getEmailByLanId(values.Owner || '');

      const data = {
        ...restValues,
        // 使用 MM/dd/yyyy 格式（与原始 .NET 代码一致）
        Finder_Date: formatDate(values.Finder_Date),
        // ME_Engineer 和 QualityEngineer 直接存储 Code_Description
        // Owner 存储 Lan_ID
        OwnerEmail: ownerEmail
      };

      // Debug: 打印提交的数据
      console.log('[DEBUG] Submitting NCN data:', JSON.stringify(data, null, 2));

      if (id) {
        // UpdateBy 由后端自动设置，前端不传
        const response = await updateNCNEntry(parseInt(id, 10), data);
        if (response.success) {
          message.success('NCN updated successfully');
          navigate('/ncn-list');
        }
      } else {
        // 后端 POST /api/entry 内部会自动生成 SerialNo
        data.CreateBy = user?.lanId;
        const response = await createNCNEntry(data);
        if (response.success) {
          message.success('NCN created successfully');
          navigate('/ncn-list');
        } else {
          message.error(response.message || 'Failed to create NCN Entry');
        }
      }
    } catch (error: any) {
      console.error('Create/Update NCN Error:', error);
      console.error('Error response:', error.response?.data);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Operation failed';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleFinderEmpIdBlur = async () => {
    const empId = String(form.getFieldValue('FinderEmpId') || '').trim();

    if (!empId) {
      setFinderName('');
      setFinderLookupMessage('');
      form.setFieldsValue({ Finder: '' });
      return;
    }

    try {
      const response = await lookupStaffByEmpId(empId);
      const staffName = response?.data?.Staff_Name;

      if (response.success && staffName) {
        setFinderName(staffName);
        setFinderLookupMessage('');
        form.setFieldsValue({ Finder: staffName });
      } else {
        setFinderName('');
        setFinderLookupMessage('此员工不存在');
        form.setFieldsValue({ Finder: '' });
      }
    } catch (error) {
      setFinderName('');
      setFinderLookupMessage('此员工不存在');
      form.setFieldsValue({ Finder: '' });
    }
  };

  const handleLineLeaderEmpIdBlur = async () => {
    const empId = String(form.getFieldValue('LineLeaderEmpId') || '').trim();

    if (!empId) {
      setLineLeaderName('');
      setLineLeaderLookupMessage('');
      form.setFieldsValue({ LineLeader: '' });
      return;
    }

    try {
      const response = await lookupStaffByEmpId(empId);
      const staffName = response?.data?.Staff_Name;

      if (response.success && staffName) {
        setLineLeaderName(staffName);
        setLineLeaderLookupMessage('');
        form.setFieldsValue({ LineLeader: staffName });
      } else {
        setLineLeaderName('');
        setLineLeaderLookupMessage('此员工不存在');
        form.setFieldsValue({ LineLeader: '' });
      }
    } catch (error) {
      setLineLeaderName('');
      setLineLeaderLookupMessage('此员工不存在');
      form.setFieldsValue({ LineLeader: '' });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>{id ? 'Edit NCN' : 'New NCN Entry'}</Title>
        <Button icon={<RollbackOutlined />} onClick={() => navigate('/ncn-list')}>
          Back to List
        </Button>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          size="large"
        >
          <Divider orientation="left">Basic Information</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="NCN_Type" label="NCN Type" rules={[{ required: true }]}>
                <Select options={NCN_TYPES} placeholder="Select type" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="SerialNo"
                label="Serial Number"
                rules={[{ required: true }]}
              >
                <Input
                  placeholder="Serial Number"
                  addonAfter={
                    <Button type="link" onClick={handleGenerateSerialNo}>
                      Generate
                    </Button>
                  }
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Finder_Date" label="Finder Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="SBU" label="SBU" rules={[{ required: true }]}>
                <Select
                  options={sbuOptions}
                  placeholder="Select SBU"
                  onChange={(value) => {
                    form.setFieldsValue({ SBU_Des: undefined });
                    loadSBUDescriptionOptions(value);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="SBU_Des" label="SBU Description" rules={[{ required: true }]}>
                <Select options={sbuDesOptions} placeholder="Select SBU Description" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Finder_Dept" label="Finder Department" rules={[{ required: true }]}>
                <Select
                  placeholder="Select Finder Department"
                  options={[
                    { value: 'PD', label: 'PD' },
                    { value: 'QLY', label: 'QLY' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="FinderEmpId" label={isEditMode ? 'Finder (Optional)' : 'Finder'} rules={[{ required: !isEditMode, message: 'Please input employee ID' }]}> 
                <Input placeholder="Input employee ID" onBlur={handleFinderEmpIdBlur} />
              </Form.Item>
              <Typography.Text type={finderLookupMessage ? 'danger' : undefined}>
                {finderLookupMessage || (finderName ? `员工姓名：${finderName}` : '员工姓名：')}
              </Typography.Text>
              <Form.Item name="Finder" hidden>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="WO" label="WO Number" rules={[{ required: true }]}>
                <Input placeholder="WO Number" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Part_ID" label="Part ID" rules={[{ required: true }]}>
                <Input placeholder="Part ID" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Customer" label="Customer">
                <Input placeholder="Customer Name" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Defect Information</Divider>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="Defect_Description" label="Defect Description" rules={[{ required: true }]}>
                <TextArea rows={2} placeholder="Describe the defect" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={4}>
              <Form.Item name="Defect_Qty" label="Defect Quantity" rules={[{ required: true }]}>
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="Defect_Rate" label="Defect Rate (%)">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ME_Engineer" label="ME Engineer" rules={[{ required: true }]}>
                <Select options={meOptions} placeholder="Select ME Engineer" />
              </Form.Item>
            </Col>
          </Row>

          {isEditMode && (
            <>
              <Divider orientation="left">Analysis & Assignment</Divider>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item name="QualityEngineer" label="Quality Engineer *" rules={[{ required: true, message: 'Please select Quality Engineer' }]}>
                    <Select options={qeOptions} placeholder="Select QE Engineer" allowClear />
                  </Form.Item>
                </Col>
            <Col span={6}>
              <Form.Item name="OwnerDept" label="Owner Dept / 责任部门 *" rules={[{ required: isEditMode, message: 'Please select Owner Dept' }]}>
                <Select
                  options={ownerDeptOptions}
                  placeholder="Select Department"
                  loading={ownerDeptLoading}
                  onChange={(value) => {
                    form.setFieldsValue({ Owner: undefined });
                    if (value) loadOwnerOptions(value);
                    else setOwnerOptions([]);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="Owner" label="Owner / 责任人 *" rules={[{ required: isEditMode, message: 'Please select Owner' }]}>
                <Select
                  placeholder="Select Owner"
                  options={ownerOptions}
                  loading={ownerLoading}
                  disabled={!form.getFieldValue('OwnerDept')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="Issue_Type" label="Issue Type / 问题类别 *" rules={[{ required: isEditMode, message: 'Please select Issue Type' }]}>
                <Select
                  options={issueTypeOptions}
                  placeholder="Select Issue Type"
                  allowClear
                  onChange={(value) => {
                    loadDeepAnalysisOptions(value || '');
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item name="Deep_Annlysis" label="Deep Analysis / 深度分析 *" rules={[{ required: isEditMode, message: 'Please select Deep Analysis' }]}>
                <Select
                  options={deepAnalysisOptions}
                  placeholder={form.getFieldValue('Issue_Type') ? 'Select Deep Analysis' : 'Please select Issue Type first'}
                  allowClear
                  disabled={deepAnalysisOptions.length === 0}
                />
              </Form.Item>
            </Col>
          </Row>
            </>
          )}

          {isEditMode && (
            <>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item name="Tooling_Code" label="Tooling Code">
                    <Input placeholder="Tooling Code" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="RawMaterialLot" label="Raw Material Lot">
                    <Input placeholder="Raw Material Lot" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="RMpart" label="RM Part">
                    <Input placeholder="RM Part" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="LineLeaderEmpId" label="Line Leader">
                    <Input placeholder="Input employee ID" onBlur={handleLineLeaderEmpIdBlur} />
                  </Form.Item>
                  <Typography.Text type={lineLeaderLookupMessage ? 'danger' : undefined}>
                    {lineLeaderLookupMessage || (lineLeaderName ? `员工姓名：${lineLeaderName}` : '员工姓名：')}
                  </Typography.Text>
                  <Form.Item name="LineLeader" hidden>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item name="Comments" label="Comments">
                    <TextArea rows={3} placeholder="Additional comments" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                {id ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => navigate('/ncn-list')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
