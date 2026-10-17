// LcosProjectLauncherPage — LCOS 项目启动页（Figma launcher 5388:3652；统一 SurfaceFeedback 5391:357）。
// 真实 Core route：GET/POST /projects；创建/打开走 POST intent create/open，回执翻译后进入项目。
// 禁止 mock 项目列表、禁止把打开失败伪装成功；reload 重读列表、已创建不重复创建。

import { HttpError } from '@local-creative-os/web-gen2';
import { FolderPlus, FolderOpen, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';


import { Button } from '@/components/Common/Button';
import { Input } from '@/components/Common/Input';
import { Modal } from '@/components/Common/Modal';

import { createLcosCoreSession } from './lcosCoreClient';
import { ProjectContentPreview } from '../ui/launcher/ProjectContentPreview';
import { LcosSurfaceFeedback } from '../ui/LcosSurfaceFeedback';

import '../ui/launcher/launcher.css';

import type { ProjectListItem } from '@local-creative-os/web-gen2';
import type { RefObject } from 'react';


type LauncherStatus = 'loading' | 'ready' | 'offline' | 'error';
type OpenDialogKind = 'create' | 'open' | null;

interface ProjectDraft {
  name: string;
  parentPath: string;
  directoryName: string;
}

interface OpenDraft {
  name: string;
  rootPath: string;
}

export function LcosProjectLauncherPage(): React.JSX.Element {
  const navigate = useNavigate();
  useEffect(() => { document.title = 'LCOS · 创意工作台'; }, []);
  const session = useMemo(() => createLcosCoreSession(), []);
  const [projects, setProjects] = useState<readonly ProjectListItem[]>([]);
  const [status, setStatus] = useState<LauncherStatus>('loading');
  const [statusDetail, setStatusDetail] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'recent' | 'all'>('recent');
  const [dialog, setDialog] = useState<OpenDialogKind>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [createDraft, setCreateDraft] = useState<ProjectDraft>({
    name: '',
    parentPath: '',
    directoryName: '',
  });
  const [openDraft, setOpenDraft] = useState<OpenDraft>({ name: '', rootPath: '' });

  const loadGeneration = useRef(0);
  const firstField = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!dialog || !formRef.current) return;
    const form = formRef.current;
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const fields = [...form.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), [tabindex="0"]')];
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && (document.activeElement === first || !form.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    form.addEventListener('keydown', trapTab);
    return () => form.removeEventListener('keydown', trapTab);
  }, [dialog]);
  const load = useCallback(async (): Promise<void> => {
    const generation = ++loadGeneration.current;
    try {
      const list = await session.projects.listProjects();
      if (generation !== loadGeneration.current) return;
      setProjects(list);
      setStatus('ready');
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      if (error instanceof HttpError && (error.status === 0 || error.code === 'network')) {
        setStatus('offline');
      } else {
        setStatus('error');
      }
      setStatusDetail(error instanceof Error ? error.message : String(error));
    }
  }, [session]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q === '' ? projects : projects.filter((p) => (p.name ?? '').toLowerCase().includes(q));
    if (tab === 'recent') {
      return [...matches].sort((a, b) => {
        const at = a.lastOpenedAt ?? '';
        const bt = b.lastOpenedAt ?? '';
        return bt.localeCompare(at);
      });
    }
    return [...matches].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [projects, query, tab]);

  const openProject = (id: string): void => {
    setOpeningId(id);
    navigate(`/projects/${encodeURIComponent(id)}/main`);
  };

  const submitCreate = async (): Promise<void> => {
    if (submitting) return;
    setSubmitError(undefined);
    if (!createDraft.name.trim() || !createDraft.parentPath.trim() || !createDraft.directoryName.trim()) {
      setSubmitError('请填写项目名称、父目录与目录名。');
      return;
    }
    setSubmitting(true);
    try {
      const receipt = await session.projects.createProject({
        name: createDraft.name.trim(),
        intent: 'create',
        parentPath: createDraft.parentPath.trim(),
        directoryName: createDraft.directoryName.trim(),
      });
      setDialog(null);
      await load();
      navigate(`/projects/${encodeURIComponent(receipt.id)}/main`);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : String(error);
      setSubmitError(`创建失败 · ${message}`);
      // 保留已输入路径（Figma recovery 语义）
    } finally {
      setSubmitting(false);
    }
  };

  const submitOpen = async (): Promise<void> => {
    if (submitting) return;
    setSubmitError(undefined);
    if (!openDraft.name.trim() || !openDraft.rootPath.trim()) {
      setSubmitError('请填写项目名称与现有目录路径。');
      return;
    }
    setSubmitting(true);
    try {
      const receipt = await session.projects.createProject({
        name: openDraft.name.trim(),
        intent: 'open',
        rootPath: openDraft.rootPath.trim(),
      });
      setDialog(null);
      await load();
      navigate(`/projects/${encodeURIComponent(receipt.id)}/main`);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : String(error);
      setSubmitError(`打开失败 · ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-lcos-launcher className="lcos-launcher">
      <header className="lcos-launcher-header">
        <span className="lcos-launcher-brand">LCOS</span>
        <div className="lcos-launcher-heading">
          <div><h1>项目</h1><p>继续上一次的创作现场。</p></div>
          <div className="lcos-launcher-actions">
            <Button variant="solid" onClick={() => { setSubmitError(undefined); setDialog('create'); }}>
              <FolderPlus size={16} aria-hidden />新建项目
            </Button>
            <Button variant="ghost" onClick={() => { setSubmitError(undefined); setDialog('open'); }}>
              <FolderOpen size={16} aria-hidden />打开已有项目
            </Button>
          </div>
        </div>
        <div className="lcos-launcher-toolbar">
          <div role="group" aria-label="项目排序" className="lcos-launcher-tabs">
            <button type="button" aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>最近</button>
            <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>全部</button>
          </div>
          <label className="lcos-launcher-search"><span>搜索项目</span>
            <div><Search size={16} aria-hidden />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="名称或关键词" aria-label="搜索项目" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
            </div>
          </label>
        </div>
      </header>
      <main className="lcos-launcher-main">
        {status === 'loading' && <LcosSurfaceFeedback presentation="loading" message="正在读取项目…" />}
        {(status === 'offline' || status === 'error') && <LcosSurfaceFeedback presentation="error"
          message={status === 'offline' ? '暂时无法连接本地服务' : '项目列表读取失败'}
          onAction={() => { setStatus('loading'); void load(); }} actionLabel="重试" />}
        {statusDetail && status !== 'ready' && status !== 'loading' && <details className="lcos-launcher-error-detail">
          <summary>查看详情</summary><p>{statusDetail}</p></details>}
        {status === 'ready' && (filtered.length === 0 ? <LcosSurfaceFeedback presentation="empty"
          message={query ? '没有匹配的项目' : '还没有项目 · 新建或打开一个创作现场'} />
          : <div className="lcos-project-grid">{filtered.map((project) => <button key={project.id}
            type="button" className="lcos-project-tile" disabled={openingId === project.id}
            onClick={() => openProject(project.id)} aria-label={'打开项目 ' + project.name}>
            <ProjectContentPreview client={session.projects} projectId={project.id} name={project.name} />
            <strong title={project.name}>{project.name}</strong>
            <span className="lcos-project-subtitle" title={project.rootPath}>
              {project.lastOpenedAt ? '上次打开 · ' + new Date(project.lastOpenedAt).toLocaleDateString('zh-CN') : '本地项目'}
            </span>
          </button>)}</div>)}
      </main>
      <footer className="lcos-launcher-footer">项目保存在你自己的电脑上</footer>
      <Modal isOpen={dialog !== null} title={dialog === 'create' ? '新建项目' : '打开已有项目'}
        onClose={() => { if (!submitting) setDialog(null); }} initialFocusRef={firstField}
        closeOnBackdropClick={!submitting} closeOnEscape={!submitting} className="lcos-project-dialog">
        <form ref={formRef} onSubmit={(event) => { event.preventDefault(); if (!submitting) void (dialog === 'create' ? submitCreate() : submitOpen()); }}
>
          <fieldset disabled={submitting} className="lcos-project-fields">
            {dialog === 'create' ? <>
              <Field label="项目名称" value={createDraft.name} onChange={(name) => setCreateDraft({ ...createDraft, name })} placeholder="例如：山野 · 品牌探索" inputRef={firstField} />
              <Field label="父目录路径" value={createDraft.parentPath} onChange={(parentPath) => setCreateDraft({ ...createDraft, parentPath })} placeholder="例如：D:/Projects" />
              <Field label="目录名" value={createDraft.directoryName} onChange={(directoryName) => setCreateDraft({ ...createDraft, directoryName })} placeholder="例如：mountain-brand" />
            </> : <>
              <Field label="项目名称" value={openDraft.name} onChange={(name) => setOpenDraft({ ...openDraft, name })} placeholder="例如：山野 · 品牌探索" inputRef={firstField} />
              <Field label="已有目录路径" value={openDraft.rootPath} onChange={(rootPath) => setOpenDraft({ ...openDraft, rootPath })} placeholder="例如：D:/Projects/mountain-brand" />
            </>}
          </fieldset>
          {submitError && <p role="alert" className="lcos-project-submit-error">{submitError}</p>}
          <div className="lcos-project-dialog-actions">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setDialog(null)}>取消</Button>
            <Button type="submit" variant="solid" disabled={submitting}>
              {submitting ? (dialog === 'create' ? '创建中…' : '打开中…') : dialog === 'create' ? '创建并进入' : '打开并进入'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field(props: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; inputRef?: RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  return <label className="lcos-project-field"><span>{props.label}</span>
    <Input ref={props.inputRef} value={props.value} onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder} /></label>;
}
