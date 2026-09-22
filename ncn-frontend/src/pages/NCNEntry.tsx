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
  getSBUDesRecommend,
  getOwnerOptions,
  getMEEngineerOptions,
  getQEEngineerOptions,
  getIssueTypeOptions,
  getDeepAnalysisOptions,
  lookupWO
} from '../services/entry';
import { uploadFile, deleteAttachmentFile } from '../services/upload';
import { downloadAttachment, extractFileNameFromPath } from '../utils/attachment';
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
  // 响应式读取 Owner Dept：原先在 render 里写 form.getFieldValue('OwnerDept')
  // 不会随表单变化触发重渲染，导致 Owner 下拉的 disabled 状态不跟随更新
  const ownerDeptValue = Form.useWatch('OwnerDept', form);
  const [loading, setLoading] = useState(false);
  const [sbuOptions, setSbuOptions] = useState<{ value: string; label: string }[]>([]);
  const [finderName, setFinderName] = useState('');
  const [finderLookupMessage, setFinderLookupMessage] = useState('');
  const [lineLeaderName, setLineLeaderName] = useState('');
  const [lineLeaderLookupMessage, setLineLeaderLookupMessage] = useState('');
  const [ownerDeptOptions, setOwnerDeptOptions] = useState<{ value: string; label: string }[]>([]);
  const [ownerDeptLoading, setOwnerDeptLoading] = useState(false);
  // Owner 下拉：value=label=lanId（显示账号，与 NCN Action 页 Action Owner 一致），name 仅供搜索
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string; name?: string }[]>([]);
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
  // WO 号查询 Infor（带出 Part ID / Customer）
  const [woLoading, setWoLoading] = useState(false);
  // 记录上一次由 SBU 变更“自动分配”的 ME，便于重选 SBU 时移除并重新分配（用户手动选的 ME 不动）
  const [autoAssignedME, setAutoAssignedME] = useState('');

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

  /**
   * 加载 Owner / 责任人 下拉选项
   *
   * label 显示「账号」(lanId)，与本系统 NCN Action 页的 Action Owner 保持一致；
   * name（姓名）仅保留在 option 上供搜索使用。
   * value 就是 NCN_Entry.Owner 的入库值（lanId），不能改。
   *
   * @returns 本次加载的选项数组。调用方必须用返回值做匹配，
   *          不要读 ownerOptions state（setState 异步，闭包里拿到的是旧值）。
   */
  const loadOwnerOptions = async (
    dept: string
  ): Promise<{ value: string; label: string; name: string }[]> => {
    setOwnerLoading(true);
    try {
      const response = await getOwnerOptions(dept);
      if (response.success && response.data?.owners) {
        const options = response.data.owners.map((o: any) => {
          const lanId = String(o.lanId || '').trim();
          return {
            value: lanId,
            // 显示账号（与本系统 NCN Action 页的 Action Owner 一致）。
            // 姓名仍保留在 name 字段里，仅供 filterOption 搜索用。
            label: lanId,
            name: String(o.name || '').trim()
          };
        });
        setOwnerOptions(options);
        return options;
      }
      setOwnerOptions([]);
      return [];
    } catch (error) {
      setOwnerOptions([]);
      message.error('Failed to load Owner options');
      return [];
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
        // SBU_Des 是只读文本框，直接回显数据库值，无需加载描述选项
        if (data.OwnerDept) {
          // 用 loadOwnerOptions 的返回值匹配，不要读 ownerOptions state
          //（setState 异步，闭包里的 ownerOptions 还是上一轮的值 → 匹配不到）
          void loadOwnerOptions(data.OwnerDept).then((opts) => {
            if (!data.Owner) return;
            // 按 value(=lanId) 精确匹配，大小写不敏感。
            // label 已经改成姓名，不能再靠 label.startsWith(lanId) 匹配。
            const target = String(data.Owner).trim().toLowerCase();
            const hit = opts.find((o) => String(o.value).trim().toLowerCase() === target);
            // 未命中（如该责任人已离职、不在在职名单里）时保留原值，
            // Select 会直接显示 lanId 原文，避免把已有数据清空
            form.setFieldsValue({ Owner: hit ? hit.value : data.Owner });
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

        // 若 AI 填入 SBU，自动带出对应的 SBU_Des
        if (fields.SBU) {
          applySBUDesBySBU(fields.SBU);
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

  // 附件文件名提取与下载统一走 utils/attachment（与 NCNList 共用同一实现）
  const handleDownloadAttachment = (filePath: string) => {
    void downloadAttachment(filePath);
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

  // SBU 选中后自动带出 SBU_Des（历史最常用值，.NET 时代一致），并自动分配 ME Engineer
  const applySBUDesBySBU = async (sbu: string) => {
    // ① SBU 变更：先移除上一次自动分配的 ME（若用户已手动改成别人，则保留不动）
    const currentME = String(form.getFieldValue('ME_Engineer') || '');
    if (autoAssignedME && currentME === autoAssignedME) {
      form.setFieldsValue({ ME_Engineer: undefined });
    }
    setAutoAssignedME('');

    if (!sbu) {
      form.setFieldsValue({ SBU_Des: '' });
      return;
    }

    let sbuDes = '';
    // 1) 优先历史推荐值
    try {
      const recResp = await getSBUDesRecommend(sbu);
      if (recResp.success && recResp.data) {
        sbuDes = recResp.data;
      }
    } catch {
      // ignore
    }

    // 2) 无历史推荐时回退到匹配的唯一描述
    if (!sbuDes) {
      try {
        const response = await getSBUDescriptionOptions(sbu);
        if (response.success && Array.isArray(response.data) && response.data.length === 1) {
          sbuDes = response.data[0];
        }
      } catch {
        // ignore
      }
    }

    form.setFieldsValue({ SBU_Des: sbuDes });

    // ② 重新分配 ME Engineer（按 SBU_Des 历史推荐；后端已保证只在启用中的 ME 名单内推荐）
    if (sbuDes) {
      try {
        const resp = await aiFillNew({ sbuDes });
        const me = resp.data?.suggestions?.meEngineer;
        const meNow = String(form.getFieldValue('ME_Engineer') || '');
        if (me && !meNow) {
          form.setFieldsValue({ ME_Engineer: me });
          setAutoAssignedME(me);
          message.info(`ME Engineer auto-assigned: ${me}`);
        } else if (!me && !meNow) {
          message.warning('No active ME Engineer recommendation found, please select manually');
        }
      } catch {
        // ignore
      }
    }
  };

  // WO 号被清空时，同步清掉之前从 Infor 带出的 Part ID / Customer，避免残留旧值
  const handleWoChange = (value: string) => {
    if (!String(value || '').trim()) {
      form.setFieldsValue({ Part_ID: undefined, Customer: undefined });
    }
  };

  // WO 号输入后自动调 Infor CSI IDO 带出 Part ID / Customer（站点由 SBU 决定）
  const handleWoLookup = async () => {
    const wo = String(form.getFieldValue('WO') || '').trim();
    if (!wo) return;
    const sbu = String(form.getFieldValue('SBU') || '').trim();
    if (!sbu) {
      message.warning('Please select SBU first (site is determined by SBU)');
      return;
    }
    setWoLoading(true);
    try {
      const resp = await lookupWO(wo, sbu);
      if (resp.success && resp.data) {
        const fields: Record<string, any> = {};
        if (resp.data.item) fields.Part_ID = resp.data.item;
        if (resp.data.customer) fields.Customer = resp.data.customer;
        if (Object.keys(fields).length > 0) {
          form.setFieldsValue(fields);
        } else {
          // 工单存在但没带出数据：清掉 Part ID / Customer 的旧值（WO 保留）
          form.setFieldsValue({ Part_ID: undefined, Customer: undefined });
          message.warning(`Work order ${wo} found, but Part ID / Customer is empty`);
        }
      } else {
        // 工单找不到：清空 WO Number / Part ID / Customer 三个栏位，避免残留无效数据
        form.setFieldsValue({ WO: undefined, Part_ID: undefined, Customer: undefined });
        message.warning(resp.error || `Work order ${wo} not found`);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Failed to look up work order');
    } finally {
      setWoLoading(false);
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
        setFinderLookupMessage('Employee not found');
        form.setFieldsValue({ Finder: '' });
      }
    } catch (error) {
      setFinderName('');
      setFinderLookupMessage('Employee not found');
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
        setLineLeaderLookupMessage('Employee not found');
        form.setFieldsValue({ LineLeader: '' });
      }
    } catch (error) {
      setLineLeaderName('');
      setLineLeaderLookupMessage('Employee not found');
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
              NCN Action
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
                    applySBUDesBySBU(value);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="SBU_Des" label="SBU Description" rules={[{ required: true }]}>
                <Input readOnly placeholder="Auto-filled from SBU selection" />
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
                {finderLookupMessage || (finderName ? `Employee Name: ${finderName}` : 'Employee Name: ')}
              </Typography.Text>
              <Form.Item name="Finder" hidden>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="WO" label="WO Number" rules={[{ required: true }]} extra="Part ID and Customer are auto-filled from the WO number">
                <Input
                  placeholder="WO Number"
                  onChange={(e) => handleWoChange(e.target.value)}
                  onBlur={handleWoLookup}
                  onPressEnter={(e) => {
                    (e.target as HTMLInputElement).blur();
                  }}
                  suffix={woLoading ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>Loading...</Typography.Text> : undefined}
                />
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
                  disabled={!ownerDeptValue}
                  showSearch
                  allowClear
                  // label 和 value 都是账号 → 仍支持按账号或姓名搜索
                  filterOption={(input, option) => {
                    const kw = String(input || '').trim().toLowerCase();
                    if (!kw) return true;
                    const o = option as any;
                    return (
                      String(o?.label ?? '').toLowerCase().includes(kw) ||
                      String(o?.value ?? '').toLowerCase().includes(kw) ||
                      String(o?.name ?? '').toLowerCase().includes(kw)
                    );
                  }}
                  // 账号可能较长，字号略小以便在字段宽度内完整显示
                  style={{ fontSize: 13 }}
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
                    {lineLeaderLookupMessage || (lineLeaderName ? `Employee Name: ${lineLeaderName}` : 'Employee Name: ')}
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
