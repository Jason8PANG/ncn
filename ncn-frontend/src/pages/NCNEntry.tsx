import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, Card, Row, Col, DatePicker, message, Typography, Divider, Space, Upload, Modal, Tag, Collapse } from 'antd';
import { SaveOutlined, RollbackOutlined, FileAddOutlined, UploadOutlined, DownloadOutlined, PaperClipOutlined, AudioOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
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
import { uploadFile, downloadFile, deleteAttachmentFile } from '../services/upload';
import { aiFillNew, aiSuggestEdit, type IAiSuggestEditResponse } from '../services/ai';
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
  // 附件：传统共享路径方案（文件存 \\suzvfile02\TaskManager\NCN_{SerialNo}.{ext}，路径存 FilePath 字段）
  const [existingFilePath, setExistingFilePath] = useState('');
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  // AI 助手
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [editSuggestion, setEditSuggestion] = useState<IAiSuggestEditResponse['data'] | null>(null);
  const [editSuggestionVisible, setEditSuggestionVisible] = useState(false);

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
        setExistingFilePath(data.FilePath || '');
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
              const ownerOpt = ownerOptions.find(o => o.label.startsWith(data.Owner ?? ''));
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

  // 保存成功后，逐个上传选中的附件到共享目录（编辑用当前 SerialNo，新建用后端返回的 SerialNo）
  const uploadPendingFiles = async (serialNo: string): Promise<number> => {
    let failed = 0;
    for (const f of uploadFileList) {
      // beforeUpload 传入的是 RcFile（继承 File，无 originFileObj 属性）；
      // 受控 fileList 回显的 UploadFile 才有 originFileObj。两种情况都兜底。
      const originFile = (f.originFileObj || f) as File | undefined;
      if (!originFile || typeof originFile.size !== 'number') continue;
      try {
        const resp = await uploadFile(originFile, serialNo);
        if (!resp.success) failed += 1;
      } catch {
        failed += 1;
      }
    }
    return failed;
  };

  // ─── AI 助手 ────────────────────────────────────────────────────────────────
  const startVoiceInput = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      message.warning('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = (event: any) => {
      const err = event?.error || 'unknown';
      if (err === 'not-allowed') {
        message.error('Voice input is not allowed: browsers require HTTPS (or localhost) for speech recognition. Please use text input, or access NCN over HTTPS.', 6);
      } else if (err === 'no-speech') {
        message.warning('No speech detected, please try again');
      } else if (err === 'audio-capture') {
        message.error('No microphone found. Please check your microphone.');
      } else {
        message.error(`Speech recognition error: ${err}`);
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  // 新建模式：AI 自动填写（历史统计推荐 + 可选 LLM 解析文字）
  const handleAiFill = async () => {
    setAiLoading(true);
    try {
      const resp = await aiFillNew({
        text: aiText,
        sbuDes: form.getFieldValue('SBU_Des')
      });
      if (resp.success && resp.data) {
        const { suggestions, parsedFields } = resp.data;
        const fields: Record<string, any> = {};

        // LLM 解析的字段（优先，仅填非空）
        if (parsedFields) {
          for (const [k, v] of Object.entries(parsedFields)) {
            if (v) fields[k] = v;
          }
        }

        // 统计推荐（仅填空字段）
        if (!fields.ME_Engineer && suggestions.meEngineer) fields.ME_Engineer = suggestions.meEngineer;
        if (!fields.QualityEngineer && suggestions.qualityEngineer) fields.QualityEngineer = suggestions.qualityEngineer;
        if (!fields.Issue_Type && suggestions.issueType) fields.Issue_Type = suggestions.issueType;
        if (!fields.Deep_Annlysis && suggestions.deepAnalysis) fields.Deep_Annlysis = suggestions.deepAnalysis;

        form.setFieldsValue(fields);

        // 若 SBU 被填入且选项未加载，加载 SBU 描述选项
        if (fields.SBU) {
          loadSBUDescriptionOptions(fields.SBU);
        }

        const applied: string[] = [];
        if (fields.ME_Engineer) applied.push(`ME: ${fields.ME_Engineer}`);
        if (fields.QualityEngineer) applied.push(`QE: ${fields.QualityEngineer}`);
        if (fields.Issue_Type) applied.push(`Issue: ${fields.Issue_Type}`);
        if (fields.Deep_Annlysis) applied.push(`Deep: ${fields.Deep_Annlysis}`);
        message.success(applied.length > 0 ? `AI filled: ${applied.join(', ')}` : 'AI filled (description only)');
      } else {
        message.error(resp.error || 'AI assistant failed');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'AI assistant failed');
    } finally {
      setAiLoading(false);
    }
  };

  // 编辑模式：AI 一键填写推荐（QE / Issue_Type / Deep_Analysis）
  const handleAiSuggestEdit = async () => {
    setAiLoading(true);
    try {
      const resp = await aiSuggestEdit({
        sbuDes: form.getFieldValue('SBU_Des'),
        partId: form.getFieldValue('Part_ID'),
        defectDescription: form.getFieldValue('Defect_Description'),
        issueType: form.getFieldValue('Issue_Type')
      });
      if (resp.success && resp.data) {
        setEditSuggestion(resp.data);
        setEditSuggestionVisible(true);
      } else {
        message.error(resp.error || 'AI assistant failed');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'AI assistant failed');
    } finally {
      setAiLoading(false);
    }
  };

  // 应用编辑推荐
  const applyEditSuggestion = () => {
    if (!editSuggestion) return;
    const target = editSuggestion.llm &&
      (editSuggestion.llm.QualityEngineer || editSuggestion.llm.Issue_Type || editSuggestion.llm.Deep_Annlysis)
      ? editSuggestion.llm
      : editSuggestion.stats as any;

    const fields: Record<string, any> = {};
    const qe = target.QualityEngineer ?? target.qualityEngineer;
    const issue = target.Issue_Type ?? target.issueType;
    const deep = target.Deep_Annlysis ?? target.deepAnalysis;
    if (qe) fields.QualityEngineer = qe;
    if (issue) fields.Issue_Type = issue;
    if (deep) fields.Deep_Annlysis = deep;
    form.setFieldsValue(fields);
    setEditSuggestionVisible(false);
    message.success('AI suggestions applied');
  };

  // 从共享路径提取文件名（如 \\suzvfile02\TaskManager\NCN_NCN2608011.jpg → NCN_NCN2608011.jpg）
  const extractFileNameFromPath = (filePath: string): string => {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    return normalized.split('/').pop() || normalized;
  };

  // 下载已有附件（传统方案：按 filePath 从共享目录下载）
  const handleDownloadAttachment = async (filePath: string) => {
    try {
      const blob = await downloadFile(filePath);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = extractFileNameFromPath(filePath);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download attachment');
    }
  };

  // 删除已有附件（传统方案：删除共享目录文件 + 清空 FilePath）
  const handleDeleteAttachment = () => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Delete attachment "${extractFileNameFromPath(existingFilePath)}"? The file will be removed from the shared folder.`,
      okText: 'Yes, Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const currentSerialNo = form.getFieldValue('SerialNo') || '';
          if (!currentSerialNo) {
            message.error('SerialNo is missing, cannot delete attachment');
            return;
          }
          const resp = await deleteAttachmentFile(String(currentSerialNo));
          if (resp.success) {
            setExistingFilePath('');
            message.success('Attachment deleted');
          } else {
            message.error(resp.error || 'Failed to delete attachment');
          }
        } catch (error: any) {
          message.error(error?.response?.data?.error || 'Failed to delete attachment');
        }
      }
    });
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
          // 保存成功后上传选中的附件（用当前 NCN 的 SerialNo）
          const currentSerialNo = form.getFieldValue('SerialNo') || '';
          if (uploadFileList.length > 0 && currentSerialNo) {
            const failed = await uploadPendingFiles(String(currentSerialNo));
            if (failed > 0) {
              message.warning(`NCN updated, but ${failed} attachment(s) failed to upload`);
              navigate('/ncn-list');
              return;
            }
          }
          message.success('NCN updated successfully');
          navigate('/ncn-list');
        }
      } else {
        // 后端 POST /api/entry 内部会自动生成 SerialNo
        data.CreateBy = user?.lanId;
        const response = await createNCNEntry(data);
        if (response.success) {
          // 新建成功：用返回的 SerialNo 上传附件（上传接口按 SerialNo 命名文件并写回 FilePath）
          const newSerialNo = response.data?.SerialNo as string | undefined;
          if (newSerialNo && uploadFileList.length > 0) {
            const failed = await uploadPendingFiles(newSerialNo);
            if (failed > 0) {
              message.warning(`NCN created, but ${failed} attachment(s) failed to upload`);
              navigate('/ncn-list');
              return;
            }
          }
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
        <Space>
          {id && (
            <Button
              type="primary"
              ghost
              icon={<ThunderboltOutlined />}
              loading={aiLoading}
              onClick={handleAiSuggestEdit}
            >
              AI Fill
            </Button>
          )}
          {id && (
            <Button
              type="primary"
              ghost
              icon={<FileAddOutlined />}
              onClick={() => navigate(`/issue-log/${id}?from=entry`)}
            >
              Log Issue
            </Button>
          )}
          <Button icon={<RollbackOutlined />} onClick={() => navigate('/ncn-list')}>
            Back to List
          </Button>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          size="large"
          initialValues={{ Finder_Date: dayjs() }}
        >
          {!isEditMode && (
            <Collapse
              ghost
              style={{ marginBottom: 16 }}
              items={[
                {
                  key: 'ai',
                  label: (
                    <Space>
                      <ThunderboltOutlined style={{ color: '#1677ff' }} />
                      <Typography.Text strong>AI Assistant</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        (click to open: describe the defect, AI fills the form & assigns ME from history)
                      </Typography.Text>
                    </Space>
                  ),
                  children: (
                    <Card size="small" style={{ background: '#f7f9ff' }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input.TextArea
                            rows={2}
                            value={aiText}
                            onChange={(e) => setAiText(e.target.value)}
                            placeholder="Type or speak the defect description, e.g. '线束外观不良，端子压接偏移，数量5件，发生在HVLM事业部'"
                          />
                          <Button
                            type={listening ? 'primary' : 'default'}
                            icon={<AudioOutlined />}
                            onClick={startVoiceInput}
                            style={{ width: 90, height: 'auto' }}
                          >
                            {listening ? 'Stop' : 'Mic'}
                          </Button>
                        </Space.Compact>
                        <Space>
                          <Button type="primary" icon={<ThunderboltOutlined />} loading={aiLoading} onClick={handleAiFill}>
                            AI Auto-Fill
                          </Button>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            ME / QE / Issue Type / Deep Analysis recommended from historical NCN data.
                          </Typography.Text>
                        </Space>
                      </Space>
                    </Card>
                  )
                }
              ]}
            />
          )}

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
                <Select
                  options={sbuDesOptions}
                  placeholder="Select SBU Description"
                  onChange={(value) => {
                    // 自动分配 ME Engineer：按该 SBU_Des 的历史记录推荐（仅当 ME 尚未选择）
                    if (value && !form.getFieldValue('ME_Engineer')) {
                      aiFillNew({ sbuDes: value }).then((resp) => {
                        const me = resp.data?.suggestions?.meEngineer;
                        if (me && !form.getFieldValue('ME_Engineer')) {
                          form.setFieldsValue({ ME_Engineer: me });
                          message.info(`ME Engineer auto-assigned: ${me}`);
                        }
                      }).catch(() => {});
                    }
                  }}
                />
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

          <Divider orientation="left">Attachments</Divider>

          {isEditMode && existingFilePath && (
            <Space style={{ marginBottom: 12 }} align="center">
              <Typography.Text type="secondary">Current attachment:</Typography.Text>
              <Typography.Text strong>
                <PaperClipOutlined style={{ marginRight: 4 }} />
                {extractFileNameFromPath(existingFilePath)}
              </Typography.Text>
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadAttachment(existingFilePath)}
              >
                Download
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteAttachment}
              >
                Delete
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                (uploading a new file will replace it)
              </Typography.Text>
            </Space>
          )}

          <Upload
            multiple
            beforeUpload={(file) => {
              setUploadFileList(prev => [...prev, file]);
              return false; // 阻止自动上传，保存 NCN 后统一上传
            }}
            fileList={uploadFileList}
            onRemove={(file) => setUploadFileList(prev => prev.filter(f => f.uid !== file.uid))}
          >
            <Button icon={<UploadOutlined />}>Select Files</Button>
          </Upload>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Allowed: jpg/jpeg/bmp/gif/png/xls/xlsx/docx/pptx/ppt/pdf, max 10MB per file. Files are saved to the shared folder after the NCN is saved.
          </Typography.Text>

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

      <Modal
        title="AI Suggestions (based on historical NCN data)"
        open={editSuggestionVisible}
        onCancel={() => setEditSuggestionVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditSuggestionVisible(false)}>Cancel</Button>,
          <Button key="apply" type="primary" icon={<ThunderboltOutlined />} onClick={applyEditSuggestion}>
            Apply Suggestions
          </Button>
        ]}
      >
        {editSuggestion && (
          <div>
            {editSuggestion.llm && (
              <div style={{ marginBottom: 12 }}>
                <Typography.Text strong>AI Analysis: </Typography.Text>
                <div>
                  <Tag color="blue">QE: {editSuggestion.llm.QualityEngineer || '-'}</Tag>
                  <Tag color="purple">Issue Type: {editSuggestion.llm.Issue_Type || '-'}</Tag>
                  <Tag color="cyan">Deep Analysis: {editSuggestion.llm.Deep_Annlysis || '-'}</Tag>
                </div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>Historical Stats: </Typography.Text>
              <div>
                <Tag>QE: {editSuggestion.stats?.qualityEngineer || '-'}</Tag>
                <Tag>Issue Type: {editSuggestion.stats?.issueType || '-'}</Tag>
                <Tag>Deep Analysis: {editSuggestion.stats?.deepAnalysis || '-'}</Tag>
              </div>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {editSuggestion.llmEnabled
                ? 'AI Analysis (LLM) takes priority when applying. '
                : 'LLM is not configured (add LLM_API_KEY in .env to enable AI analysis). '
              }
              Historical distributions for this SBU:
            </Typography.Text>
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              <div>Issue Types: {editSuggestion.distributions?.issueTypes.join(', ') || '-'}</div>
              <div>Deep Analysis: {editSuggestion.distributions?.deepAnalysis.join(', ') || '-'}</div>
              <div>QE: {editSuggestion.distributions?.qes.join(', ') || '-'}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
